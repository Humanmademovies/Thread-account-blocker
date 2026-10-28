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
    notFound: /(this page isn.t available|page not found|cette page n.est pas disponible|page introuvable)/i,
    blockedRow: /(blocked profiles|profils bloqués)/i,
  };
  const PROFILE_HREF_RE = /^\/@([A-Za-z0-9._]+)\/?$/;

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
  // Le menu de navigation de Threads a aussi un bouton « More » : on cherche d'abord dans la zone principale.
  const findMoreButton = () => {
    const main = document.querySelector('main, [role="main"]');
    return (main && find(RE.more, main)) || null;
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
      return findMoreButton() ? 'ready' : null;
    }, 20000);
    if (state === 'login') return { status: 'login_required' };
    if (state === 'not_found') return { status: 'not_found' };
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

  const scrollListToEnd = (dialog) => {
    const links = dialog.querySelectorAll('a[href^="/@"]');
    const last = links[links.length - 1];
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

    const dialog = await waitFor(() => document.querySelector('[role="dialog"]'));
    if (!dialog) return fail('la liste des profils bloqués ne s\'est pas ouverte');

    const read = () => [...dialog.querySelectorAll('a[href^="/@"]')]
      .map((a) => handleFromHref(a.getAttribute('href'))).filter(Boolean);
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
      scrollListToEnd(dialog);
      await waitFor(() => read().some((h) => !found.has(h)), 4000);
    }
    return { status: 'ok', handles: [...found] };
  }

  globalThis.__blockedex = { blockProfile, exportBlocked };
})();
