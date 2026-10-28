"""Lecture et normalisation des listes de blocage (txt, csv, json)."""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

# Les comptes Threads reprennent les noms d'utilisateur Instagram.
HANDLE_RE = re.compile(r"^[a-z0-9._]{1,30}$")
PROFILE_URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?threads\.(?:net|com)/@([^/?#\s]+)", re.IGNORECASE
)
HANDLE_KEYS = ("username", "handle", "user", "screen_name", "account", "compte")
CONTAINER_KEYS = ("accounts", "users", "blocked", "handles", "comptes")


class BlocklistError(Exception):
    pass


@dataclass
class ParsedList:
    handles: list[str] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)
    duplicates: int = 0


def normalize_handle(raw: str) -> str | None:
    """Renvoie le handle en minuscules sans @, ou None s'il est invalide."""
    value = raw.strip()
    url = PROFILE_URL_RE.match(value)
    if url:
        value = url.group(1)
    value = value.lstrip("@").lower()
    return value if HANDLE_RE.match(value) else None


def _extract_raw_values(path: Path, text: str) -> list[str]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        return _values_from_json(text)
    if suffix == ".csv":
        return _values_from_csv(text)
    return _values_from_text(text)


def _values_from_text(text: str) -> list[str]:
    values = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            values.append(line)
    return values


def _values_from_csv(text: str) -> list[str]:
    rows = [row for row in csv.reader(io.StringIO(text)) if any(c.strip() for c in row)]
    if not rows:
        return []
    header = [c.strip().lower() for c in rows[0]]
    column = next((header.index(k) for k in HANDLE_KEYS if k in header), None)
    if column is None:
        # Pas d'en-tête reconnu : première colonne, toutes les lignes.
        column, body = 0, rows
    else:
        body = rows[1:]
    return [row[column] for row in body if len(row) > column and row[column].strip()]


def _values_from_json(text: str) -> list[str]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise BlocklistError(f"JSON invalide : {exc}") from exc
    if isinstance(data, dict):
        key = next((k for k in CONTAINER_KEYS if isinstance(data.get(k), list)), None)
        if key is None:
            raise BlocklistError(
                "JSON : attendu une liste, ou un objet avec une clé parmi "
                + ", ".join(CONTAINER_KEYS)
            )
        data = data[key]
    if not isinstance(data, list):
        raise BlocklistError("JSON : attendu une liste de comptes")
    values = []
    for item in data:
        if isinstance(item, str):
            values.append(item)
        elif isinstance(item, dict):
            key = next((k for k in HANDLE_KEYS if isinstance(item.get(k), str)), None)
            values.append(item[key] if key else json.dumps(item, ensure_ascii=False))
        else:
            values.append(str(item))
    return values


def parse_blocklists(paths: list[Path]) -> ParsedList:
    """Lit un ou plusieurs fichiers et renvoie les handles uniques, dans l'ordre."""
    result = ParsedList()
    seen: set[str] = set()
    for path in paths:
        try:
            text = path.read_text(encoding="utf-8-sig")
        except OSError as exc:
            raise BlocklistError(f"Impossible de lire {path} : {exc}") from exc
        for raw in _extract_raw_values(path, text):
            handle = normalize_handle(raw)
            if handle is None:
                result.invalid.append(raw)
            elif handle in seen:
                result.duplicates += 1
            else:
                seen.add(handle)
                result.handles.append(handle)
    return result
