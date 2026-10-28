import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from blockedex.cli import main
from blockedex.state import State, Status


def run_cli(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = main(list(argv))
    return code, out.getvalue()


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.list = Path(self.tmp.name) / "l.txt"
        self.list.write_text("alice\nbob\n@carol\nbad entry\n")
        self.state = Path(self.tmp.name) / "state.json"

    def test_check(self):
        code, out = run_cli("check", str(self.list), "--show")
        self.assertEqual(code, 0)
        self.assertIn("3 comptes valides", out)
        self.assertIn("@carol", out)

    def test_dry_run_skips_done_and_touches_nothing(self):
        State(self.state).record("alice", Status.BLOCKED)
        before = self.state.read_text()
        code, out = run_cli("apply", str(self.list), "--dry-run", "--state", str(self.state))
        self.assertEqual(code, 0)
        self.assertNotIn("@alice", out)
        self.assertIn("bloquerait @bob", out)
        self.assertEqual(self.state.read_text(), before)

    def test_export_refuses_to_overwrite(self):
        with self.assertRaises(SystemExit) as ctx:
            run_cli("export", str(self.list))
        self.assertIn("existe déjà", str(ctx.exception))

    def test_empty_list_fails(self):
        empty = Path(self.tmp.name) / "e.txt"
        empty.write_text("# rien\n")
        code, _ = run_cli("check", str(empty))
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
