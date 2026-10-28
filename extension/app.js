import { STATUS, isDone, parseBlocklists, runBlocks, writeBlocklist, BlocklistError } from './lib.js';

const THREADS = 'https://www.threads.com';
const PRIVACY_URL = `${THREADS}/settings/privacy`;
const $ = (id) => document.getElementById(id);

// --- Stockage (chrome.storage.local) : liste, progression et réglages survivent à la fermeture ---

const DEFAULTS = { list: [], results: {}, settings: { min: 8, max: 20, limit: 100 } };
let store = structuredClone(DEFAULTS);
const persist = () => chrome.storage.local.set(store);

// --- Pauses : dans un worker, car les minuteries d'un onglet masqué sont ralenties par Chrome ---

const timer = new Worker('timer-worker.js');
const sleepers = new Map();
let sleepSeq = 0;
timer.onmessage = ({ data: { id } }) => sleepers.get(id)?.();
const workerSleep = (ms) => new Promise((resolve) => {
  const id = ++sleepSeq;
  sleepers.set(id, () => { sleepers.delete(id); resolve(); });
  timer.postMessage({ id, ms });
});
const sleep = (ms, signal) => {
  if (!signal) return workerSleep(ms);
  if (signal.aborted) return Promise.resolve();
  return Promise.race([workerSleep(ms), new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))]);
};

// --- Onglet Threads de travail ---

let workTabId = null;

/**
 * Exécute `trigger` (qui navigue ou crée un onglet et renvoie son id), puis attend que cet onglet ait
 * fini de charger. Les événements sont écoutés avant le déclenchement : un « complete » n'est retenu
 * que s'il suit un « loading », pour ne pas confondre avec l'ancienne page.
 */
function loadAfter(trigger, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const seen = new Map(); // id d'onglet -> 'loading' puis 'done'
    let tabId = null;
    const finish = (fn, arg) => { chrome.tabs.onUpdated.removeListener(onUpdated); fn(arg); };
    const settle = () => { if (tabId !== null && seen.get(tabId) === 'done') finish(resolve, tabId); };
    const onUpdated = (id, info) => {
      if (info.status === 'loading') seen.set(id, 'loading');
      else if (info.status === 'complete' && seen.get(id) === 'loading') seen.set(id, 'done');
      settle();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    sleep(timeoutMs).then(() => finish(reject, new Error('chargement de la page trop long')));
    trigger().then((id) => { tabId = id; settle(); }, (e) => finish(reject, e));
  });
}

async function openInWorkTab(url, { active = false } = {}) {
  if (workTabId !== null) {
    try {
      return await loadAfter(async () => {
        await chrome.tabs.update(workTabId, { url, active });
        return workTabId;
      });
    } catch (e) {
      if (!/No tab with id/i.test(e.message)) throw e;
      workTabId = null; // l'utilisateur a fermé l'onglet : on en recrée un
    }
  }
  workTabId = await loadAfter(async () => (await chrome.tabs.create({ url, active })).id);
  return workTabId;
}

async function callInPage(tabId, method) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name) => globalThis.__blockedex[name](),
    args: [method],
  });
  return result;
}

// --- Interface ---

const logEl = $('log');
function log(text, kind = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  logEl.append(li);
  while (logEl.children.length > 300) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

const LABELS = {
  [STATUS.BLOCKED]: ['bloqué', 'ok'],
  [STATUS.ALREADY_BLOCKED]: ['déjà bloqué', 'ok'],
  [STATUS.NOT_FOUND]: ['introuvable', 'warn'],
  [STATUS.FAILED]: ['échec', 'err'],
};

function refresh() {
  const total = store.list.length;
  const done = store.list.filter((h) => isDone(store.results[h])).length;
  const idle = !running;
  $('counts').textContent = total
    ? `${total} comptes dans la liste : ${done} déjà traités, ${total - done} à traiter.`
    : 'Aucune liste chargée.';
  $('start').disabled = !idle || total === done;
  $('stop').disabled = idle;
  $('reset').disabled = !idle || !Object.keys(store.results).length;
  $('load').disabled = !idle;
  $('export-btn').disabled = !idle;
  $('bar').hidden = !total;
  $('bar').max = Math.max(total, 1);
  $('bar').value = done;
}

function readSettings() {
  const num = (id, fallback) => {
    const value = $(id).value.trim() === '' ? NaN : Number($(id).value);
    return Number.isFinite(value) ? Math.max(0, value) : fallback; // 0 est une valeur valide
  };
  const settings = { min: num('min', 8), max: num('max', 20), limit: num('limit', 100) };
  if (settings.min > settings.max) settings.max = settings.min;
  return settings;
}

// --- Import ---

$('load').addEventListener('click', async () => {
  const sources = [];
  if ($('paste').value.trim()) sources.push({ name: 'collé.txt', text: $('paste').value });
  for (const file of $('file').files) sources.push({ name: file.name, text: await file.text() });
  const summary = $('parse-summary');
  if (!sources.length) return setStatus(summary, 'Collez des comptes ou choisissez un fichier.', 'warn');
  let parsed;
  try {
    parsed = parseBlocklists(sources);
  } catch (e) {
    if (e instanceof BlocklistError) return setStatus(summary, e.message, 'err');
    throw e;
  }
  if (!parsed.handles.length) return setStatus(summary, 'Aucun compte valide trouvé.', 'err');
  store.list = parsed.handles;
  await persist();
  const extra = [];
  if (parsed.duplicates) extra.push(`${parsed.duplicates} doublons ignorés`);
  if (parsed.invalid.length) extra.push(`${parsed.invalid.length} entrées invalides (ex. ${JSON.stringify(parsed.invalid[0])})`);
  setStatus(summary, `${parsed.handles.length} comptes valides` + (extra.length ? ` ; ${extra.join(', ')}` : '') + '.', parsed.invalid.length ? 'warn' : 'ok');
  refresh();
});

// --- Application ---

let running = false;
let controller = null;

async function blockOne(handle) {
  try {
    const tabId = await openInWorkTab(`${THREADS}/@${handle}`);
    const result = await callInPage(tabId, 'blockProfile');
    if (result.status === STATUS.FAILED && result.detail) log(`  détail : ${result.detail}`, 'err');
    return result.status;
  } catch (e) {
    log(`  détail : ${e.message}`, 'err');
    return STATUS.FAILED;
  }
}

$('start').addEventListener('click', async () => {
  const settings = readSettings();
  store.settings = settings;
  const todo = store.list.filter((h) => !isDone(store.results[h])).length;
  const planned = settings.limit ? Math.min(todo, settings.limit) : todo;
  if (!confirm(`Bloquer jusqu'à ${planned} comptes sur Threads avec votre compte connecté ?`)) return;

  running = true;
  controller = new AbortController();
  refresh();
  log(`Démarrage : ${planned} comptes prévus.`);
  const summary = await runBlocks({
    handles: store.list,
    results: store.results,
    block: blockOne,
    sleep,
    delay: [settings.min, settings.max],
    limit: settings.limit,
    signal: controller.signal,
    log: (text) => log(text, 'warn'),
    onResult: async (handle, status, index, total) => {
      const [label, kind] = LABELS[status];
      log(`[${index + 1}/${total}] @${handle} : ${label}`, kind);
      await persist();
      refresh();
    },
  });
  running = false;
  const parts = Object.entries(summary.counts).map(([s, n]) => `${n} ${LABELS[s][0]}`);
  log(`Terminé : ${parts.join(', ') || 'rien à faire'} ; ${summary.remaining} restants.`, summary.aborted ? 'warn' : 'ok');
  refresh();
});

$('stop').addEventListener('click', () => controller?.abort());

$('reset').addEventListener('click', async () => {
  if (!confirm('Effacer la progression ? Les comptes de la liste seront retraités.')) return;
  store.results = {};
  await persist();
  logEl.replaceChildren();
  refresh();
});

// --- Export ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'blockedex:progress') setStatus($('export-status'), `${msg.count} comptes trouvés...`);
});

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('export-btn').addEventListener('click', async () => {
  const status = $('export-status');
  running = true; // verrouille les autres boutons pendant l'export
  refresh();
  setStatus(status, 'Ouverture des réglages Threads (un onglet va passer au premier plan)...');
  try {
    const tabId = await openInWorkTab(PRIVACY_URL, { active: true });
    const result = await callInPage(tabId, 'exportBlocked');
    if (result.status === STATUS.LOGIN_REQUIRED) {
      setStatus(status, 'Session Threads absente ou expirée : connectez-vous sur threads.com puis réessayez.', 'err');
    } else if (result.status !== 'ok') {
      setStatus(status, `Échec : ${result.detail}. Threads a peut-être changé son interface.`, 'err');
    } else if (!result.handles.length) {
      setStatus(status, 'Aucun compte récupéré : rien n\'a été enregistré (liste vide, ou interface modifiée ?).', 'warn');
    } else {
      const format = $('format').value;
      download(`blockedex-bloques-${new Date().toISOString().slice(0, 10)}.${format}`, writeBlocklist(result.handles, format));
      setStatus(status, `${result.handles.length} comptes exportés.`, 'ok');
    }
  } catch (e) {
    setStatus(status, `Échec : ${e.message}`, 'err');
  } finally {
    running = false;
    refresh();
  }
});

// --- Démarrage ---

(async () => {
  store = { ...structuredClone(DEFAULTS), ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  $('min').value = store.settings.min;
  $('max').value = store.settings.max;
  $('limit').value = store.settings.limit;
  refresh();
})();
