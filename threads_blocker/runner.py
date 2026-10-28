"""Boucle d'application d'une liste de blocage, indépendante du navigateur."""

from __future__ import annotations

import random
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable, Protocol

from .state import State, Status


class BackendError(Exception):
    """Erreur fatale du backend (session expirée, limitation de débit...) : on arrête."""


class Backend(Protocol):
    def block(self, handle: str) -> Status: ...


@dataclass
class Summary:
    counts: Counter = field(default_factory=Counter)
    skipped: int = 0
    remaining: int = 0
    aborted: str | None = None


def run(
    handles: list[str],
    backend: Backend,
    state: State,
    *,
    delay: tuple[float, float] = (8.0, 20.0),
    limit: int | None = 100,
    max_consecutive_failures: int = 5,
    sleep: Callable[[float], None] = time.sleep,
    rng: random.Random | None = None,
    log: Callable[[str], None] = print,
) -> Summary:
    """Applique les blocages un par un. `limit` plafonne les tentatives par exécution."""
    rng = rng or random.Random()
    summary = Summary()
    todo = [h for h in handles if not state.is_done(h)]
    summary.skipped = len(handles) - len(todo)
    consecutive_failures = 0
    attempted = 0

    for index, handle in enumerate(todo):
        if limit is not None and attempted >= limit:
            summary.remaining = len(todo) - index
            log(f"Limite de {limit} comptes atteinte ; relancez plus tard pour continuer.")
            break
        if attempted:
            sleep(rng.uniform(*delay))
        attempted += 1
        try:
            status = backend.block(handle)
        except BackendError as exc:
            summary.aborted = str(exc)
            summary.remaining = len(todo) - index
            log(f"Arrêt : {exc}")
            break
        state.record(handle, status)
        summary.counts[status] += 1
        log(f"[{index + 1}/{len(todo)}] @{handle} : {status.value}")

        consecutive_failures = consecutive_failures + 1 if status is Status.FAILED else 0
        if consecutive_failures >= max_consecutive_failures:
            summary.aborted = f"{consecutive_failures} échecs consécutifs"
            summary.remaining = len(todo) - index - 1
            log(f"Arrêt : {summary.aborted} (Threads a peut-être changé son interface ou limité le compte).")
            break
    return summary
