"""Backend Playwright : pilote le site Threads avec la session de l'utilisateur.

L'API officielle de Threads n'expose aucun endpoint de blocage ; on automatise donc
l'interface web, dans un profil de navigateur dédié où l'utilisateur se connecte
lui-même (le script ne voit jamais le mot de passe).

Les sélecteurs reposent sur les libellés accessibles (EN/FR) et peuvent casser si Threads
modifie son interface : ils sont regroupés en haut du fichier pour être faciles à ajuster.
"""

from __future__ import annotations

import re
from pathlib import Path

from .export import collect_scrolling, handle_from_href
from .runner import BackendError
from .state import Status

PROFILE_URL = "https://www.threads.com/@{handle}"
LOGIN_URL = "https://www.threads.com/login"
PRIVACY_URL = "https://www.threads.com/settings/privacy"

NOT_FOUND_RE = re.compile(
    r"(this page isn.t available|page not found|cette page n.est pas disponible|page introuvable)",
    re.IGNORECASE,
)
MORE_BUTTON_RE = re.compile(r"^(more|plus)$", re.IGNORECASE)
BLOCK_RE = re.compile(r"^(block|bloquer)$", re.IGNORECASE)
UNBLOCK_RE = re.compile(r"^(unblock|débloquer)$", re.IGNORECASE)
LOGIN_RE = re.compile(r"^(log in|se connecter)$", re.IGNORECASE)
BLOCKED_ROW_RE = re.compile(r"(blocked profiles|profils bloqués)", re.IGNORECASE)

ACTION_TIMEOUT_MS = 8_000


class BrowserBackend:
    def __init__(self, profile_dir: Path, *, headless: bool = False, debug_dir: Path | None = None):
        self.profile_dir = profile_dir
        self.headless = headless
        self.debug_dir = debug_dir
        self._playwright = None
        self._context = None
        self._page = None

    def __enter__(self) -> "BrowserBackend":
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise SystemExit(
                "Playwright n'est pas installé. Lancez :\n"
                "  pip install playwright && playwright install chromium"
            ) from exc
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        self._playwright = sync_playwright().start()
        self._context = self._playwright.chromium.launch_persistent_context(
            str(self.profile_dir), headless=self.headless, locale="en-US"
        )
        self._context.set_default_timeout(ACTION_TIMEOUT_MS)
        self._page = self._context.pages[0] if self._context.pages else self._context.new_page()
        return self

    def __exit__(self, *exc_info) -> None:
        if self._context:
            self._context.close()
        if self._playwright:
            self._playwright.stop()

    def login(self) -> None:
        """Ouvre la page de connexion ; l'utilisateur se connecte à la main."""
        self._page.goto(LOGIN_URL)
        input("Connectez-vous à Threads dans la fenêtre ouverte, puis appuyez sur Entrée ici... ")

    def block(self, handle: str) -> Status:
        page = self._page
        try:
            response = page.goto(PROFILE_URL.format(handle=handle), wait_until="domcontentloaded")
            self._require_login()
            if (response and response.status == 404) or self._looks_not_found():
                return Status.NOT_FOUND

            page.get_by_role("button", name=MORE_BUTTON_RE).first.click()
            if page.get_by_role("menuitem", name=UNBLOCK_RE).count():
                page.keyboard.press("Escape")
                return Status.ALREADY_BLOCKED
            page.get_by_role("menuitem", name=BLOCK_RE).first.click()

            dialog = page.get_by_role("dialog")
            dialog.get_by_role("button", name=BLOCK_RE).first.click()
            dialog.wait_for(state="hidden")
            return Status.BLOCKED
        except BackendError:
            raise
        except Exception as exc:  # timeout, sélecteur introuvable, navigation échouée...
            self._save_debug(handle, exc)
            return Status.FAILED

    def list_blocked(self, log=print) -> list[str]:
        """Lit la liste « Profils bloqués » des réglages de confidentialité, en la faisant défiler."""
        page = self._page
        page.goto(PRIVACY_URL, wait_until="domcontentloaded")
        self._require_login()
        try:
            page.get_by_text(BLOCKED_ROW_RE).first.click()
            dialog = page.get_by_role("dialog")
            dialog.wait_for()
        except Exception as exc:
            self._save_debug("export", exc)
            raise BackendError(
                "Impossible d'ouvrir la liste des profils bloqués (interface modifiée ?)."
            ) from exc

        profile_links = dialog.locator("a[href^='/@']")

        def read_visible() -> list[str]:
            hrefs = profile_links.evaluate_all("els => els.map(e => e.getAttribute('href'))")
            return [h for h in map(handle_from_href, hrefs) if h]

        def scroll() -> None:
            if profile_links.count():
                profile_links.last.scroll_into_view_if_needed()
            dialog.hover()
            page.mouse.wheel(0, 2000)

        return collect_scrolling(read_visible, scroll, log=log)

    def _require_login(self) -> None:
        page = self._page
        if page.get_by_role("link", name=LOGIN_RE).count() or page.get_by_role("button", name=LOGIN_RE).count():
            raise BackendError("Session Threads absente ou expirée : relancez `login`.")

    def _looks_not_found(self) -> bool:
        body = self._page.locator("body").inner_text(timeout=ACTION_TIMEOUT_MS)
        return bool(NOT_FOUND_RE.search(body))

    def _save_debug(self, handle: str, exc: Exception) -> None:
        if not self.debug_dir:
            return
        try:
            self.debug_dir.mkdir(parents=True, exist_ok=True)
            self._page.screenshot(path=str(self.debug_dir / f"{handle}.png"))
            (self.debug_dir / f"{handle}.txt").write_text(repr(exc), encoding="utf-8")
        except Exception:
            pass
