// Test de bout en bout : charge l'extension dans Chromium et la fait travailler contre un FAUX Threads
// (pages HTML servies en interceptant https://www.threads.com). Valide la mécanique de l'extension,
// pas les vrais sélecteurs de Threads.
//
// Usage : node extension/tests/e2e.mjs   (nécessite le paquet `playwright`, un Chromium et openssl)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NAV = '<nav><div role="button"><svg aria-label="More" width="16" height="16"></svg></div></nav>'; // leurre
const profilePage = (handle, { unblock = false, noBlock = false } = {}) => `<!doctype html><body>${NAV}
<main><h1>${handle}</h1><div role="button" id="more"><svg aria-label="More" width="16" height="16"></svg></div></main>
<script>
document.getElementById('more').onclick = () => {
  const menu = document.createElement('div');
  menu.innerHTML = ${noBlock ? "'<div role=\"menuitem\">Report</div>'" : unblock ? "'<div role=\"menuitem\">Unblock</div>'" : "'<div role=\"menuitem\">Block</div>'"};
  document.body.append(menu);
  const item = menu.firstChild;
  if (item.textContent === 'Block') item.onclick = () => {
    const d = document.createElement('div'); d.setAttribute('role', 'dialog');
    d.innerHTML = '<button>Block</button>';
    d.querySelector('button').onclick = () => { fetch('/__block?h=${handle}'); d.remove(); };
    document.body.append(d);
  };
};
</script></body>`;

const loginPage = '<!doctype html><body><a href="/login">Log in</a></body>';
const notFoundPage = '<!doctype html><body><main><h1>Sorry, this page isn\'t available.</h1></main></body>';

const TOTAL_BLOCKED = 55;
const privacyPage = `<!doctype html><body>${NAV}<main><div><span>Blocked profiles</span></div></main>
<script>
const total = ${TOTAL_BLOCKED};
document.querySelector('span').onclick = () => {
  const d = document.createElement('div'); d.setAttribute('role', 'dialog');
  const box = document.createElement('div'); box.style.cssText = 'height:200px;overflow-y:auto';
  d.append(box); document.body.append(d);
  let n = 0;
  const more = () => { for (let i = 0; i < 20 && n < total; i++, n++) {
    const a = document.createElement('a'); const name = 'User' + String(n + 1).padStart(2, '0');
    a.href = '/@' + name; a.textContent = name; a.style.display = 'block'; a.style.height = '30px';
    box.append(a);
    const post = document.createElement('a'); post.href = '/@' + name + '/post/1'; post.textContent = 'post'; box.append(post);
  } };
  more();
  box.onscroll = () => { if (box.scrollTop + box.clientHeight >= box.scrollHeight - 5) setTimeout(more, 300); };
};
</script></body>`;

const blocked = [];
function fakeThreads(req, res) {
  const url = new URL(req.url, 'https://www.threads.com');
  const html = (body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
  if (url.pathname === '/__block') { blocked.push(url.searchParams.get('h')); res.writeHead(204); return res.end(); }
  if (url.pathname === '/settings/privacy') return html(privacyPage);
  const m = /^\/@([^/]+)$/.exec(url.pathname);
  if (!m) return html(loginPage);
  const h = m[1];
  if (h === 'ghost') return html(notFoundPage);
  if (h === 'needslogin') return html(loginPage);
  if (h === 'already') return html(profilePage(h, { unblock: true }));
  if (h === 'broken') return html(profilePage(h, { noBlock: true }));
  return html(profilePage(h));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blockedex-e2e-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=www.threads.com',
  '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });
const server = https.createServer(
  { key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem')) }, fakeThreads);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const userDataDir = path.join(tmp, 'profile');
// Chrome résout threads.com vers notre serveur local (et accepte son certificat auto-signé).
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--host-resolver-rules=MAP www.threads.com 127.0.0.1:${port},MAP threads.com 127.0.0.1:${port}`,
    '--ignore-certificate-errors',
    '--no-proxy-server', // l'environnement peut imposer un proxy, qui court-circuiterait la redirection ci-dessus
  ],
});

// Requête de chauffe : sans elle, la toute première navigation ouverte par l'extension dans ce
// Chromium neuf échoue (réseau pas encore initialisé), ce qui ne dit rien sur l'extension elle-même.
const warmup = await context.newPage();
await warmup.goto('https://www.threads.com/@warmup');
await warmup.close();

let worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extId = new URL(worker.url()).host;
const app = await context.newPage();
app.on('dialog', (d) => d.accept());
app.on('pageerror', (e) => { throw e; });
const appUrl = `chrome-extension://${extId}/app.html`;
await app.goto(appUrl);

const setPause = async () => { await app.fill('#min', '0'); await app.fill('#max', '0'); };
const results = {};
let step = 0;
const ok = (name) => console.log(`ok ${++step} - ${name}`);

// 1. Import + application
await app.fill('#paste', '@Alice\nghost\nalready\nbroken\nalice\nnot valid\nhttps://www.threads.com/@Bob');
await app.click('#load');
assert.match(await app.textContent('#parse-summary'), /5 comptes valides.*1 doublons.*1 entrées invalides/);
ok('import : doublon et entrée invalide signalés');

await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
const log1 = await app.textContent('#log');
assert.deepEqual(blocked.sort(), ['alice', 'bob']);
assert.match(log1, /@alice : bloqué/);
assert.match(log1, /@ghost : introuvable/);
assert.match(log1, /@already : déjà bloqué/);
assert.match(log1, /@broken : échec/);
assert.match(await app.textContent('#counts'), /5 comptes dans la liste : 4 déjà traités, 1 à traiter/);
ok('application : bloqué / introuvable / déjà bloqué / échec, avec le bon effet côté page');

// 2. Reprise : seul l'échec est retenté, rien de déjà fait n'est rebloqué
blocked.length = 0;
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.split('Terminé').length > 2, null, { timeout: 60000 });
assert.deepEqual(blocked, []);
ok('reprise : les comptes déjà traités sont sautés, l\'échec est retenté');

// 3. Persistance
await app.reload();
assert.match(await app.textContent('#counts'), /5 comptes dans la liste : 4 déjà traités/);
ok('persistance : liste et progression retrouvées après rechargement');

// 4. Session expirée : arrêt net, les suivants ne sont pas traités
blocked.length = 0;
await app.click('#reset');
await app.fill('#paste', 'carol\nneedslogin\ndave');
await app.click('#load');
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
assert.deepEqual(blocked, ['carol']);
assert.match(await app.textContent('#log'), /session Threads absente ou expirée/);
ok('session expirée : arrêt immédiat, les comptes suivants ne sont pas touchés');

// 5. Plafond par session
blocked.length = 0;
await app.click('#reset');
await app.fill('#paste', 'p1\np2\np3\np4');
await app.click('#load');
await app.fill('#limit', '2');
await setPause();
await app.click('#start');
await app.waitForFunction(() => document.querySelector('#log').textContent.includes('Terminé'), null, { timeout: 60000 });
assert.deepEqual(blocked, ['p1', 'p2']);
assert.match(await app.textContent('#counts'), /2 à traiter/);
ok('plafond : 2 comptes traités, 2 restants');

// 6. Export : défilement jusqu'au bout, liens de posts ignorés, fichier relisible
const [download] = await Promise.all([app.waitForEvent('download'), app.click('#export-btn')]);
const exported = fs.readFileSync(await download.path(), 'utf8');
const lines = exported.split('\n').filter((l) => l && !l.startsWith('#'));
assert.equal(lines.length, TOTAL_BLOCKED);
assert.equal(lines[0], '@user01');
assert.equal(lines.at(-1), `@user${TOTAL_BLOCKED}`);
assert.equal(new Set(lines).size, TOTAL_BLOCKED);
assert.match(download.suggestedFilename(), /^blockedex-bloques-\d{4}-\d{2}-\d{2}\.txt$/);
ok(`export : ${TOTAL_BLOCKED} comptes récupérés par défilement, sans doublons ni liens de posts`);

// 7. Aller-retour : le fichier exporté est ré-importable
await app.fill('#paste', '');
await app.setInputFiles('#file', { name: 'export.txt', mimeType: 'text/plain', buffer: Buffer.from(exported) });
await app.click('#load');
await app.waitForFunction((n) => document.querySelector('#parse-summary').textContent.startsWith(`${n} comptes valides.`), TOTAL_BLOCKED);
ok('aller-retour : le fichier exporté se ré-importe tel quel');

await context.close();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('tous les tests e2e passent');
