import { STARTER, applyStarterUpdate, parseStarterList } from './lib.js';

// Un clic sur l'icône ouvre (ou ramène au premier plan) la page La Blocklist.
// La page reste ouverte pendant tout le traitement : un service worker serait coupé après ~30 s.
chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  }
});

// Bouton « Bloquer » des fils Threads et des publications Instagram (inline.js) : le profil est ouvert
// dans un onglet en arrière-plan, bloqué avec content.js, puis l'onglet est refermé. Un blocage à la
// fois, dans l'ordre des clics.
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
let queue = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'blockedex:block') return undefined;
  if (!HANDLE_RE.test(msg.handle || '')) {
    sendResponse({ status: 'failed', detail: 'pseudo invalide' });
    return undefined;
  }
  queue = queue
    .then(() => blockInBackground(msg.handle, msg.platform))
    .catch((e) => ({ status: 'failed', detail: e.message }))
    .then((result) => sendResponse(result));
  return true; // réponse asynchrone
});

const PROFILE_URLS = {
  threads: (handle) => `https://www.threads.com/@${handle}`,
  instagram: (handle) => `https://www.instagram.com/${handle}/`,
};

async function blockInBackground(handle, platform) {
  const url = (PROFILE_URLS[platform] || PROFILE_URLS.threads)(handle);
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForLoad(tab.id);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.__blockedex.blockProfile(),
    });
    return result;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const done = (fn, arg) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      fn(arg);
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done(resolve);
    };
    const timer = setTimeout(() => done(reject, new Error('chargement du profil trop long')), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Le chargement a pu se terminer avant que l'on écoute.
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === 'complete') done(resolve); }, (e) => done(reject, e));
  });
}

// --- Liste de départ : téléchargement et mise à jour quotidienne ---
// `starter` (chrome.storage.local) : { added: la liste a été ajoutée, auto: mise à jour automatique,
// handles: dernière version connue, lastCheck, lastChange, lastAdded, lastRemoved, unseen, error }.

const ALARM = 'starter-refresh';
const DAY_MINUTES = 24 * 60;

async function fetchStarter() {
  const response = await fetch(STARTER.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`le site a répondu ${response.status}`);
  const accounts = parseStarterList(await response.text());
  if (!accounts.length) throw new Error('aucun compte trouvé sur la page (le site a peut-être changé)');
  return accounts;
}

async function setBadge(unseen) {
  await chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' });
  await chrome.action.setBadgeText({ text: unseen ? `+${unseen}` : '' });
}

/**
 * Télécharge la liste de départ et l'applique à la liste de l'utilisateur, si elle y a été ajoutée
 * et que la mise à jour automatique est active (ou si `force`). Renvoie le nouvel état `starter`.
 */
async function refreshStarter({ force = false } = {}) {
  const store = await chrome.storage.local.get(['list', 'starter']);
  const starter = store.starter || {};
  if (!starter.added || (!starter.auto && !force)) return starter;
  const now = Date.now();
  let accounts;
  try {
    accounts = await fetchStarter();
  } catch (e) {
    const next = { ...starter, lastCheck: now, error: e.message };
    await chrome.storage.local.set({ starter: next });
    return next;
  }
  const handles = accounts.map((a) => a.handle);
  const { list, added, removed } = applyStarterUpdate(store.list || [], starter.handles || [], handles);
  const changed = added.length || removed.length;
  const next = {
    ...starter, handles, accounts, lastCheck: now, error: null,
    ...(changed ? { lastChange: now, lastAdded: added, lastRemoved: removed } : {}),
    unseen: (starter.unseen || 0) + added.length,
  };
  await chrome.storage.local.set(changed ? { list, starter: next } : { starter: next });
  await setBadge(next.unseen);
  return next;
}

const scheduleRefresh = () => chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: DAY_MINUTES });
chrome.runtime.onInstalled.addListener(scheduleRefresh);
chrome.runtime.onStartup.addListener(scheduleRefresh);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) refreshStarter().catch(() => {});
});

// Messages de la page La Blocklist : télécharger la liste (pour l'ajouter), forcer une mise à jour,
// marquer les nouveautés comme vues.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'starter:fetch') {
    fetchStarter().then((accounts) => sendResponse({ ok: true, accounts }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === 'starter:refresh') {
    refreshStarter({ force: true }).then((starter) => sendResponse({ ok: true, starter }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === 'starter:seen') {
    chrome.storage.local.get('starter').then(({ starter }) => chrome.storage.local.set({ starter: { ...starter, unseen: 0 } }))
      .then(() => setBadge(0)).then(() => sendResponse({ ok: true }));
    return true;
  }
  return undefined;
});
