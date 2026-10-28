import random
import tempfile
import unittest
from pathlib import Path

from blockedex.runner import BackendError, run
from blockedex.state import State, Status


class FakeBackend:
    def __init__(self, outcomes=None, fatal_on=None):
        self.outcomes = outcomes or {}
        self.fatal_on = fatal_on
        self.calls = []

    def block(self, handle):
        self.calls.append(handle)
        if handle == self.fatal_on:
            raise BackendError("session expirée")
        return self.outcomes.get(handle, Status.BLOCKED)


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_path = Path(self.tmp.name) / "state.json"
        self.sleeps = []

    def go(self, handles, backend, **kwargs):
        state = State(self.state_path)
        return run(
            handles, backend, state, sleep=self.sleeps.append,
            rng=random.Random(0), log=lambda _m: None, **kwargs,
        )

    def test_counts_and_state_persisted(self):
        backend = FakeBackend({"b": Status.ALREADY_BLOCKED, "c": Status.NOT_FOUND})
        summary = self.go(["a", "b", "c"], backend)
        self.assertEqual(summary.counts[Status.BLOCKED], 1)
        self.assertEqual(summary.counts[Status.ALREADY_BLOCKED], 1)
        self.assertEqual(summary.counts[Status.NOT_FOUND], 1)
        self.assertEqual(State(self.state_path).results["a"], Status.BLOCKED)

    def test_resume_skips_done_but_retries_failed(self):
        self.go(["a", "b"], FakeBackend({"b": Status.FAILED}))
        backend = FakeBackend()
        summary = self.go(["a", "b"], backend)
        self.assertEqual(backend.calls, ["b"])
        self.assertEqual(summary.skipped, 1)

    def test_limit(self):
        backend = FakeBackend()
        summary = self.go(["a", "b", "c", "d"], backend, limit=2)
        self.assertEqual(backend.calls, ["a", "b"])
        self.assertEqual(summary.remaining, 2)

    def test_delay_between_calls_only(self):
        self.go(["a", "b", "c"], FakeBackend(), delay=(5, 10))
        self.assertEqual(len(self.sleeps), 2)
        self.assertTrue(all(5 <= s <= 10 for s in self.sleeps))

    def test_aborts_after_consecutive_failures(self):
        outcomes = {h: Status.FAILED for h in "abc"}
        backend = FakeBackend(outcomes)
        summary = self.go(list("abcde"), backend, max_consecutive_failures=3)
        self.assertEqual(backend.calls, ["a", "b", "c"])
        self.assertIn("3 échecs", summary.aborted)
        self.assertEqual(summary.remaining, 2)

    def test_success_resets_failure_streak(self):
        outcomes = {"a": Status.FAILED, "b": Status.FAILED, "d": Status.FAILED}
        backend = FakeBackend(outcomes)
        summary = self.go(list("abcde"), backend, max_consecutive_failures=3)
        self.assertIsNone(summary.aborted)
        self.assertEqual(len(backend.calls), 5)

    def test_fatal_backend_error_stops_and_keeps_progress(self):
        backend = FakeBackend(fatal_on="b")
        summary = self.go(["a", "b", "c"], backend)
        self.assertEqual(summary.aborted, "session expirée")
        self.assertEqual(summary.remaining, 2)
        self.assertTrue(State(self.state_path).is_done("a"))
        self.assertFalse(State(self.state_path).is_done("b"))


class StateTest(unittest.TestCase):
    def test_corrupt_state_raises_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            path.write_text("{oops")
            with self.assertRaises(RuntimeError):
                State(path)


if __name__ == "__main__":
    unittest.main()
