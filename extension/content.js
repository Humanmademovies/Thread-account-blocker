// Script injecté dans l'onglet Threads : il manipule la page comme le ferait l'utilisateur.
// Les sélecteurs reposent sur les libellés accessibles (EN/FR) et peuvent casser si Threads change
// son interface : tout ce qui en dépend est regroupé dans RE, labelOf et findMoreButton.
(() => {
  if (globalThis.__blockedex) return;

  const RE = {
    more: /^(more|plus)$/i,
    block: /^(block|bloquer)$/i,
    unblock: /^(unblock|débloquer)$/i,
    login: /^(log in|se connecter)$/i,
    notFound: /(this page isn.t available|page not found|but this page is|page is gone|cette page n.est pas disponible|page introuvable|mais cette page l.est|la page a disparu)/i,
    blockedRow: /(blocked profiles|profils bloqués)/i,
    // Gros bouton d'action de l'en-tête de profil, qui sert de repère pour trouver son bouton « Plus ».
    profileAction: /^(follow|follow back|following|requested|unblock|suivre|suivre en retour|suivi\(e\)|abonné\(e\)|demande envoyée|débloquer)$/i,
  };
  const PROFILE_HREF_RE = /^\/@([A-Za-z0-9._]+)\/?$/;
  const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

  const isVisible = (el) => el.getClientRects().length > 0;
  const labelOf = (el) => {
    const own = el.getAttribute('aria-label');
    if (own) return own.trim();
    const text = el.textContent.trim();
    if (text) return text;
    const svg = el.querySelector('svg[aria-label]');
    return svg ? svg.getAttribute('aria-label').trim() : '';
  };
  const find = (re, root = document) =>
    [...root.querySelectorAll('[role="button"],[role="menuitem"],button,a')]
      .find((el) => isVisible(el) && re.test(labelOf(el)));
  // La navigation et l'en-tête de colonne ont aussi un bouton « Plus ». Le vrai Threads n'a pas de <main> :
  // on part du bouton d'action du profil (Suivre, Débloquer…) et on remonte jusqu'au premier « Plus ».
  const findMoreButton = () => {
    const main = document.querySelector('main, [role="main"]');
    if (main) return find(RE.more, main) || null;
    for (let el = find(RE.profileAction); el && el !== document.body; el = el.parentElement) {
      const more = find(RE.more, el);
      if (more) return more;
    }
    return null;
  };
  // Un profil déjà bloqué affiche directement un bouton « Débloquer », hors de toute fenêtre.
  const profileIsBlocked = () => {
    const button = find(RE.unblock);
    return Boolean(button && !button.closest('[role="dialog"],[role="menu"]'));
  };
  const click = (el) => el.click();
  const fail = (detail) => ({ status: 'failed', detail });
  const handleFromHref = (href) => {
    const m = PROFILE_HREF_RE.exec(href || '');
    return m ? m[1].toLowerCase() : null;
  };

  // Attend qu'une condition devienne vraie : MutationObserver (non ralenti dans un onglet masqué)
  // plus un sondage de secours. Renvoie la valeur de la condition, ou null au bout du délai.
  const waitFor = (fn, timeout = 10000) =>
    new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timer);
        clearInterval(poll);
        resolve(value);
      };
      const check = () => {
        try {
          const value = fn();
          if (value) finish(value);
        } catch { /* la page est en cours de rendu */ }
      };
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => finish(null), timeout);
      const poll = setInterval(check, 500);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      check();
    });

  const isLoginPage = () => location.pathname.startsWith('/login') || Boolean(find(RE.login));

  /** À appeler sur la page d'un profil : bloque le compte. */
  async function blockProfile() {
    const state = await waitFor(() => {
      if (isLoginPage()) return 'login';
      if (RE.notFound.test(document.body.innerText)) return 'not_found';
      if (profileIsBlocked()) return 'already_blocked';
      return findMoreButton() ? 'ready' : null;
    }, 20000);
    if (state === 'login') return { status: 'login_required' };
    if (state === 'not_found') return { status: 'not_found' };
    if (state === 'already_blocked') return { status: 'already_blocked' };
    if (state !== 'ready') return fail('profil non chargé');

    click(findMoreButton());
    const item = await waitFor(() => find(RE.unblock) || find(RE.block));
    if (!item) return fail('menu « Bloquer » introuvable');
    if (RE.unblock.test(labelOf(item))) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { status: 'already_blocked' };
    }
    click(item);

    const confirm = await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog && find(RE.block, dialog);
    });
    if (!confirm) return fail('confirmation introuvable');
    click(confirm);
    const closed = await waitFor(() => !document.querySelector('[role="dialog"]'));
    return closed ? { status: 'blocked' } : fail('la confirmation ne s\'est pas fermée');
  }

  const findRowByText = (re) =>
    [...document.querySelectorAll('div,span,a,button,[role="button"]')].find((el) =>
      isVisible(el) && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && re.test(n.textContent.trim())));

  // Sur le vrai Threads, les lignes de « Profils bloqués » n'ont pas de lien de profil : le pseudo est
  // la première ligne de texte de la ligne qui porte le bouton « Débloquer ».
  const unblockButtons = (dialog) =>
    [...dialog.querySelectorAll('[role="button"],button')].filter((b) => RE.unblock.test(b.textContent.trim()));
  const rowOf = (button, dialog) => {
    let row = button;
    while (row.parentElement && row.parentElement !== dialog
      && unblockButtons(row.parentElement).length === 1) row = row.parentElement;
    return row;
  };
  const handleFromRow = (row) => {
    const first = row.innerText.split('\n').map((s) => s.trim()).find(Boolean) || '';
    return HANDLE_RE.test(first) && !RE.unblock.test(first) ? first.toLowerCase() : null;
  };

  const scrollListToEnd = (dialog) => {
    const items = [...dialog.querySelectorAll('a[href^="/@"]'), ...unblockButtons(dialog)];
    const last = items[items.length - 1];
    if (!last) return;
    last.scrollIntoView({ block: 'end' });
    for (let el = last.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        el.scrollTop = el.scrollHeight;
        break;
      }
    }
  };

  /** À appeler sur la page des réglages de confidentialité : lit la liste « Profils bloqués ». */
  async function exportBlocked() {
    const state = await waitFor(() => (isLoginPage() ? 'login' : findRowByText(RE.blockedRow)), 20000);
    if (state === 'login') return { status: 'login_required' };
    if (!state) return fail('« Profils bloqués » introuvable dans les réglages');
    click(state);

    // Threads ouvre d'abord une fenêtre vide puis la remplace par celle qui contient la liste :
    // on ne garde donc pas l'élément, on reprend la fenêtre visible à chaque lecture.
    const currentDialog = () => [...document.querySelectorAll('[role="dialog"]')].find(isVisible) || null;
    if (!await waitFor(currentDialog)) return fail('la liste des profils bloqués ne s\'est pas ouverte');

    const read = () => {
      const dialog = currentDialog();
      if (!dialog) return [];
      return [
        ...[...dialog.querySelectorAll('a[href^="/@"]')].map((a) => handleFromHref(a.getAttribute('href'))),
        ...unblockButtons(dialog).map((b) => handleFromRow(rowOf(b, dialog))),
      ].filter(Boolean);
    };
    const found = new Set();
    let idle = 0;
    // On défile jusqu'à 3 passages de suite sans nouveau compte.
    for (let round = 0; round < 2000 && idle < 3; round++) {
      const before = found.size;
      read().forEach((h) => found.add(h));
      if (found.size === before) idle++;
      else {
        idle = 0;
        chrome.runtime.sendMessage({ type: 'blockedex:progress', count: found.size }).catch(() => {});
      }
      const dialog = currentDialog();
      if (dialog) scrollListToEnd(dialog);
      await waitFor(() => read().some((h) => !found.has(h)), 4000);
    }
    return { status: 'ok', handles: [...found] };
  }

  globalThis.__blockedex = { blockProfile, exportBlocked };
})();
