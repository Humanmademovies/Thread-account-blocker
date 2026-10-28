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

  // --- Masquer sans bloquer ---
  // Les publications des comptes cochés de votre liste restent à leur place et à leur taille : le réseau
  // les compte comme affichées. Elles sont seulement recouvertes, pour que vous ne les lisiez pas et ne
  // puissiez pas cliquer dessus (ni ouvrir, ni aimer, ni répondre). Rien n'est envoyé au réseau.
  const EMOJIS = ['🫧', '🙈', '🌸', '🍿', '✨', '🦄', '🧸', '🌈', '🍭', '🎈'];
  const COVER_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu'];
  let ignoreOn = false;
  let ignored = new Set();

  // Nom d'auteur d'une publication ou d'une réponse (pas une mention, pas un avatar, pas un menu).
  const authorHandle = (link) => {
    const m = HREF_RE.exec(link.getAttribute('href') || '');
    if (!m || nameText(link) !== m[1] || NOT_PROFILES.has(m[1].toLowerCase())) return null;
    return nearPostTime(link) || link.closest('article') ? m[1].toLowerCase() : null;
  };
  const authorCount = (root) => [...root.querySelectorAll('a[href^="/"]')].filter((a) => authorHandle(a)).length;
  // La publication entière : <article> dans le fil Instagram ; sinon le plus grand bloc qui ne contient
  // qu'un seul auteur (une publication ou une réponse d'un fil Threads, un commentaire Instagram).
  const postOf = (link) => {
    const article = PLATFORM === 'instagram' && link.closest('article');
    if (article) return article;
    let el = link;
    while (el.parentElement && el.parentElement !== document.body && authorCount(el.parentElement) === 1) el = el.parentElement;
    return el;
  };
  // Couleur de fond réelle derrière la publication, pour un cache opaque dans le thème de la page.
  const backgroundOf = (el) => {
    for (; el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
    }
    return 'rgb(255, 255, 255)';
  };
  const isDark = (rgb) => {
    const [r, g, b] = (rgb.match(/\d+/g) || [255, 255, 255]).map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  };

  function cover(post, handle) {
    if (post.querySelector(':scope > .lb-cover')) return;
    if (getComputedStyle(post).position === 'static') {
      post.style.position = 'relative';
      post.dataset.lbPositioned = '';
    }
    post.dataset.lbIgnored = handle;
    const bg = backgroundOf(post);
    const el = document.createElement('div');
    el.className = 'lb-cover';
    el.style.background = bg;
    el.style.color = isDark(bg) ? '#e8eaee' : '#15181e';
    el.innerHTML = '<span class="lb-emoji" aria-hidden="true"></span><span class="lb-label"></span>';
    el.querySelector('.lb-emoji').textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    el.querySelector('.lb-label').textContent = `@${handle} · masqué par La Blocklist`;
    for (const type of COVER_EVENTS) {
      el.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    post.append(el);
  }

  function uncover(post) {
    post.querySelector(':scope > .lb-cover')?.remove();
    if ('lbPositioned' in post.dataset) post.style.position = '';
    delete post.dataset.lbPositioned;
    delete post.dataset.lbIgnored;
  }

  function applyIgnore() {
    // Retirer les caches devenus inutiles (compte décoché ou retiré, masquage désactivé).
    for (const post of document.querySelectorAll('[data-lb-ignored]')) {
      if (!ignoreOn || !ignored.has(post.dataset.lbIgnored)) uncover(post);
    }
    if (!ignoreOn || !ignored.size) return;
    const own = ownHandle();
    for (const link of document.querySelectorAll('a[href^="/"]')) {
      const m = HREF_RE.exec(link.getAttribute('href') || '');
      const quick = m && m[1].toLowerCase();
      if (!quick || !ignored.has(quick) || quick === own) continue; // filtre rapide avant le test complet
      const masked = link.closest('[data-lb-ignored]');
      if (masked?.querySelector(':scope > .lb-cover')) continue;
      const handle = authorHandle(link);
      if (handle) cover(postOf(link), handle);
    }
  }

  // Liste et réglage, lus dans le stockage de l'extension et suivis en direct.
  async function loadIgnore() {
    const { list = [], excluded = [], ignore = {} } = await chrome.storage.local.get(['list', 'excluded', 'ignore']);
    const off = new Set(excluded);
    ignored = new Set(list.filter((h) => !off.has(h)));
    ignoreOn = ignore.enabled !== false; // activé par défaut
    applyIgnore();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.list || changes.excluded || changes.ignore)) loadIgnore();
  });
  loadIgnore();

  // Threads charge les réponses au fil du défilement : on repasse après chaque changement de la page.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      addButtons();
      applyIgnore();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  addButtons();
})();
