"""Export de la liste des comptes bloqués : collecte par défilement et écriture."""

from __future__ import annotations

import csv
import json
import re
import time
from datetime import date
from pathlib import Path
from typing import Callable, Iterable

from .blocklist import normalize_handle

PROFILE_HREF_RE = re.compile(r"^/@([A-Za-z0-9._]+)/?$")


def handle_from_href(href: str) -> str | None:
    """'/@alice' -> 'alice' ; None pour tout lien qui n'est pas un profil."""
    match = PROFILE_HREF_RE.match(href or "")
    return normalize_handle(match.group(1)) if match else None


def collect_scrolling(
    read_visible: Callable[[], Iterable[str]],
    scroll: Callable[[], None],
    *,
    max_idle: int = 3,
    max_rounds: int = 2000,
    sleep: Callable[[float], None] = time.sleep,
    pause: float = 1.0,
    log: Callable[[str], None] = lambda _m: None,
) -> list[str]:
    """Défile une liste à chargement progressif jusqu'à ce qu'elle ne grossisse plus.

    `read_visible` renvoie les handles actuellement affichés ; on s'arrête après
    `max_idle` défilements consécutifs sans nouveau compte.
    """
    found: dict[str, None] = {}
    idle = 0
    for _ in range(max_rounds):
        before = len(found)
        for handle in read_visible():
            found.setdefault(handle)
        idle = idle + 1 if len(found) == before else 0
        if idle >= max_idle:
            break
        if len(found) != before:
            log(f"{len(found)} comptes trouvés...")
        scroll()
        sleep(pause)
    return list(found)


def write_blocklist(handles: list[str], path: Path) -> None:
    """Écrit au format déduit de l'extension (.csv, .json, sinon texte) ; relisible par `apply`."""
    suffix = path.suffix.lower()
    path.parent.mkdir(parents=True, exist_ok=True)
    if suffix == ".json":
        path.write_text(json.dumps(handles, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elif suffix == ".csv":
        with path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["username"])
            writer.writerows([h] for h in handles)
    else:
        header = f"# Comptes bloqués exportés le {date.today().isoformat()} ({len(handles)} comptes)\n"
        path.write_text(header + "".join(f"@{h}\n" for h in handles), encoding="utf-8")
