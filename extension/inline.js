// Script chargé sur threads.com et instagram.com : ajoute un petit bouton « Bloquer » à côté du nom de
// chaque auteur (publications, réponses, commentaires). Le blocage lui-même est fait par background.js,
// dans un onglet en arrière-plan : la page en cours n'est pas touchée.
(() => {
  if (globalThis.__blockedexInline) return;
  globalThis.__blockedexInline = true;

  const PLATFORM = /(^|\.)instagram\.com$/.test(location.hostname) ? 'instagram' : 'threads';
  // Liens de profil : /@pseudo sur Threads, /pseudo/ sur Instagram.
  const HREF_RE = PLATFORM === 'instagram' ? /^\/([A-Za-z0-9._]{1,30})\/$/ : /^\/@([A-Za-z0-9._]+)\/?$/;
  const NOT_PROFILES = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct', 'tv']);
  // Instagram ajoute « Vérifié » (texte de l'icône) au nom des comptes certifiés.
  const nameText = (link) => link.textContent.trim().replace(/(vérifié|verified)$/i, '').trim();
  const LABELS = {
    idle: 'Bloquer',
    pending: 'Blocage…',
    blocked: 'Bloqué',
    already_blocked: 'Bloqué',
    not_found: 'Introuvable',
    login_required: 'Session expirée',
    failed: 'Échec, réessayer',
  };
  const state = new Map(); // handle -> statut ; partagé par tous les boutons du même compte
  const buttons = new WeakMap(); // lien du nom -> son bouton

  // Le nom est dans des blocs empilés : on place le bouton dans la première ligne horizontale
  // (flex) au-dessus, pour qu'il reste à côté du nom au lieu de passer en dessous.
  const insertionPoint = (link) => {
    let child = link;
    for (let el = link.parentElement, i = 0; i < 5 && el; child = el, el = el.parentElement, i++) {
      const style = getComputedStyle(el);
      if (style.display.includes('flex') && style.flexDirection.startsWith('row')) return child;
    }
    return link;
  };

  // Votre propre compte : lien « Profil » du menu de gauche. Pas de bouton à côté de vous-même.
  const ownHandle = () => {
    const link = [...document.querySelectorAll('a[href^="/"]')]
      .find((a) => /^(profil|profile)/i.test(a.textContent.trim()) && HREF_RE.test(a.getAttribute('href')));
    const m = link && HREF_RE.exec(link.getAttribute('href'));
    return m ? m[1].toLowerCase() : null;
  };
  // Un nom d'auteur est à quelques niveaux de l'heure de la publication ; les menus, l'en-tête de
  // colonne et les listes d'abonnés n'en ont pas.
  const nearPostTime = (el) => {
    for (let i = 0; i < 7 && el; i++, el = el.parentElement) if (el.querySelector('time')) return true;
    return false;
  };

  const render = (button) => {
    const status = state.get(button.dataset.handle) || 'idle';
    button.dataset.state = status;
    button.textContent = LABELS[status] || LABELS.failed;
    button.disabled = !['idle', 'failed', 'login_required'].includes(status);
    button.title = status === 'idle' ? `Bloquer @${button.dataset.handle} (La Blocklist)` : '';
  };
  const update = (handle) => {
    for (const button of document.querySelectorAll('button.blockedex-btn')) {
      if (button.dataset.handle === handle) render(button);
    }
  };

  async function block(handle) {
    state.set(handle, 'pending');
    update(handle);
    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'blockedex:block', handle, platform: PLATFORM });
    } catch {
      result = null; // extension rechargée pendant que la page était ouverte
    }
    state.set(handle, result?.status || 'failed');
    update(handle);
  }

  function addButtons() {
    const own = ownHandle();
    for (const link of document.querySelectorAll('a[href^="/"]')) {
      if (buttons.get(link)?.isConnected) continue;
      const m = HREF_RE.exec(link.getAttribute('href') || '');
      if (!m || nameText(link) !== m[1]) continue; // avatar ou mention, pas un nom d'auteur
      const handle = m[1].toLowerCase();
      if (handle === own || NOT_PROFILES.has(handle) || !nearPostTime(link)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'blockedex-btn';
      button.dataset.handle = handle;
      button.addEventListener('click', (event) => {
        // Le nom est dans un lien cliquable : on ne suit pas le lien.
        event.preventDefault();
        event.stopPropagation();
        if (!button.disabled) block(handle);
      });
      render(button);
      insertionPoint(link).after(button);
      buttons.set(link, button);
    }
  }

  // Threads charge les réponses au fil du défilement : on repasse après chaque changement de la page.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      addButtons();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  addButtons();
})();
