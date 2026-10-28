// Un clic sur l'icône ouvre (ou ramène au premier plan) la page blockedex.
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
