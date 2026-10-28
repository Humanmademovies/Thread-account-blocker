import json
import tempfile
import unittest
from pathlib import Path

from blockedex.blocklist import parse_blocklists
from blockedex.export import collect_scrolling, handle_from_href, write_blocklist


class HrefTest(unittest.TestCase):
    def test_profile_links_only(self):
        self.assertEqual(handle_from_href("/@Alice.B"), "alice.b")
        self.assertEqual(handle_from_href("/@bob/"), "bob")
        for href in ("/@bob/post/abc", "/settings", "", None, "https://x.com/@bob"):
            self.assertIsNone(handle_from_href(href), href)


class CollectTest(unittest.TestCase):
    def fake_list(self, pages):
        """Liste à chargement progressif : chaque scroll révèle la page suivante."""
        state = {"loaded": 1, "scrolls": 0}

        def read_visible():
            return [h for page in pages[: state["loaded"]] for h in page]

        def scroll():
            state["scrolls"] += 1
            state["loaded"] = min(state["loaded"] + 1, len(pages))

        return read_visible, scroll, state

    def test_collects_all_pages_in_order_without_duplicates(self):
        read, scroll, _ = self.fake_list([["a", "b"], ["b", "c"], ["d"]])
        result = collect_scrolling(read, scroll, sleep=lambda _s: None)
        self.assertEqual(result, ["a", "b", "c", "d"])

    def test_stops_after_idle_rounds(self):
        read, scroll, state = self.fake_list([["a"]])
        collect_scrolling(read, scroll, max_idle=3, sleep=lambda _s: None)
        self.assertEqual(state["scrolls"], 3)  # 1 lecture utile + 3 lectures vides, arrêt avant un 4e défilement

    def test_empty_list(self):
        self.assertEqual(collect_scrolling(lambda: [], lambda: None, sleep=lambda _s: None), [])

    def test_max_rounds_guard(self):
        counter = iter(range(10_000))
        result = collect_scrolling(
            lambda: [f"u{next(counter)}"], lambda: None, max_rounds=5, sleep=lambda _s: None
        )
        self.assertEqual(len(result), 5)


class WriteRoundTripTest(unittest.TestCase):
    HANDLES = ["alice", "bob.smith", "c_d"]

    def roundtrip(self, name):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sub" / name
            write_blocklist(self.HANDLES, path)
            parsed = parse_blocklists([path])
            return path.read_text(encoding="utf-8"), parsed

    def test_txt(self):
        text, parsed = self.roundtrip("b.txt")
        self.assertTrue(text.startswith("# Comptes bloqués"))
        self.assertEqual(parsed.handles, self.HANDLES)
        self.assertEqual(parsed.invalid, [])

    def test_csv(self):
        text, parsed = self.roundtrip("b.csv")
        self.assertTrue(text.startswith("username"))
        self.assertEqual(parsed.handles, self.HANDLES)

    def test_json(self):
        text, parsed = self.roundtrip("b.json")
        self.assertEqual(json.loads(text), self.HANDLES)
        self.assertEqual(parsed.handles, self.HANDLES)


if __name__ == "__main__":
    unittest.main()
