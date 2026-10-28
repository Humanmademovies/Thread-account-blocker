"""Journal des résultats, pour pouvoir reprendre une exécution interrompue."""

from __future__ import annotations

import enum
import json
import os
from pathlib import Path


class Status(str, enum.Enum):
    BLOCKED = "blocked"
    ALREADY_BLOCKED = "already_blocked"
    NOT_FOUND = "not_found"
    FAILED = "failed"


# Ces comptes ne seront pas retraités à la prochaine exécution ; les échecs si.
FINAL_STATUSES = {Status.BLOCKED, Status.ALREADY_BLOCKED, Status.NOT_FOUND}


class State:
    def __init__(self, path: Path):
        self.path = path
        self.results: dict[str, Status] = {}
        if path.exists():
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                self.results = {h: Status(s) for h, s in raw.get("results", {}).items()}
            except (OSError, ValueError) as exc:
                raise RuntimeError(
                    f"Fichier d'état illisible ({path}) : {exc}. "
                    "Corrigez-le ou supprimez-le pour repartir de zéro."
                ) from exc

    def is_done(self, handle: str) -> bool:
        return self.results.get(handle) in FINAL_STATUSES

    def record(self, handle: str, status: Status) -> None:
        self.results[handle] = status
        self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        payload = {"results": {h: s.value for h, s in sorted(self.results.items())}}
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)
