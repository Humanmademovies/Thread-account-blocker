"""Interface en ligne de commande : check / login / apply."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .blocklist import BlocklistError, ParsedList, parse_blocklists
from .export import write_blocklist
from .runner import BackendError, run
from .state import State, Status

DEFAULT_HOME = Path.home() / ".threads-blocker"


def _load(files: list[Path]) -> ParsedList:
    try:
        parsed = parse_blocklists(files)
    except BlocklistError as exc:
        sys.exit(f"Erreur : {exc}")
    print(
        f"{len(parsed.handles)} comptes valides, {parsed.duplicates} doublons ignorés, "
        f"{len(parsed.invalid)} entrées invalides."
    )
    for raw in parsed.invalid[:10]:
        print(f"  entrée invalide : {raw!r}")
    if len(parsed.invalid) > 10:
        print(f"  ... et {len(parsed.invalid) - 10} autres")
    return parsed


def cmd_check(args: argparse.Namespace) -> int:
    parsed = _load(args.files)
    if args.show:
        for handle in parsed.handles:
            print(f"@{handle}")
    return 0 if parsed.handles else 1


def cmd_login(args: argparse.Namespace) -> int:
    from .browser import BrowserBackend

    with BrowserBackend(args.profile_dir) as backend:
        backend.login()
    print("Session enregistrée dans", args.profile_dir)
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    parsed = _load(args.files)
    if not parsed.handles:
        return 1
    if args.min_delay > args.max_delay:
        sys.exit("Erreur : --min-delay doit être inférieur ou égal à --max-delay.")
    state = State(args.state)
    todo = [h for h in parsed.handles if not state.is_done(h)]
    print(f"{len(todo)} à traiter, {len(parsed.handles) - len(todo)} déjà traités (journal : {args.state}).")

    if args.dry_run:
        for handle in todo[: args.limit or None]:
            print(f"[dry-run] bloquerait @{handle}")
        return 0
    if not todo:
        return 0
    if not args.yes:
        answer = input(f"Bloquer jusqu'à {min(len(todo), args.limit or len(todo))} comptes sur Threads ? [o/N] ")
        if answer.strip().lower() not in {"o", "oui", "y", "yes"}:
            print("Annulé.")
            return 1

    from .browser import BrowserBackend

    with BrowserBackend(args.profile_dir, headless=args.headless, debug_dir=args.state.parent / "failures") as backend:
        summary = run(
            parsed.handles,
            backend,
            state,
            delay=(args.min_delay, args.max_delay),
            limit=args.limit or None,
        )
    parts = [f"{summary.counts[s]} {s.value}" for s in Status if summary.counts[s]]
    print("Terminé : " + (", ".join(parts) or "rien à faire") + f" ; {summary.remaining} restants.")
    return 1 if summary.aborted else 0


def cmd_export(args: argparse.Namespace) -> int:
    from .browser import BrowserBackend

    if args.output.exists() and not args.force:
        sys.exit(f"Erreur : {args.output} existe déjà (utilisez --force pour l'écraser).")
    with BrowserBackend(args.profile_dir, headless=args.headless, debug_dir=args.profile_dir.parent / "failures") as backend:
        try:
            handles = backend.list_blocked()
        except BackendError as exc:
            sys.exit(f"Erreur : {exc}")
    if not handles:
        print("Aucun compte récupéré : rien n'a été écrit (liste vide, ou interface modifiée ?).")
        return 1
    write_blocklist(handles, args.output)
    print(f"{len(handles)} comptes exportés dans {args.output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="threads_blocker", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="valide des listes sans rien bloquer")
    check.add_argument("files", nargs="+", type=Path)
    check.add_argument("--show", action="store_true", help="affiche les comptes retenus")
    check.set_defaults(func=cmd_check)

    login = sub.add_parser("login", help="se connecter à Threads (une seule fois)")
    login.add_argument("--profile-dir", type=Path, default=DEFAULT_HOME / "profile")
    login.set_defaults(func=cmd_login)

    export = sub.add_parser("export", help="exporte vos comptes bloqués actuels vers un fichier")
    export.add_argument("output", type=Path, help="fichier de sortie (.txt, .csv ou .json)")
    export.add_argument("--force", action="store_true", help="écraser le fichier s'il existe")
    export.add_argument("--profile-dir", type=Path, default=DEFAULT_HOME / "profile")
    export.add_argument("--headless", action="store_true", help="sans fenêtre (à éviter au début)")
    export.set_defaults(func=cmd_export)

    apply = sub.add_parser("apply", help="bloque les comptes des listes")
    apply.add_argument("files", nargs="+", type=Path)
    apply.add_argument("--dry-run", action="store_true", help="liste les actions sans les faire")
    apply.add_argument("--yes", action="store_true", help="ne pas demander confirmation")
    apply.add_argument("--limit", type=int, default=100, help="max de comptes par exécution (0 = illimité)")
    apply.add_argument("--min-delay", type=float, default=8.0, help="pause minimale entre deux blocages (s)")
    apply.add_argument("--max-delay", type=float, default=20.0, help="pause maximale entre deux blocages (s)")
    apply.add_argument("--state", type=Path, default=DEFAULT_HOME / "state.json")
    apply.add_argument("--profile-dir", type=Path, default=DEFAULT_HOME / "profile")
    apply.add_argument("--headless", action="store_true", help="sans fenêtre (à éviter au début)")
    apply.set_defaults(func=cmd_apply)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\nInterrompu : la progression est sauvegardée, relancez la même commande pour reprendre.")
        return 130
