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
