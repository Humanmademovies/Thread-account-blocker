import tempfile
import unittest
from pathlib import Path

from threads_blocker.blocklist import BlocklistError, normalize_handle, parse_blocklists


def parse(name: str, content: str):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / name
        path.write_text(content, encoding="utf-8")
        return parse_blocklists([path])


class NormalizeTest(unittest.TestCase):
    def test_variants(self):
        self.assertEqual(normalize_handle("@Foo.Bar_1"), "foo.bar_1")
        self.assertEqual(normalize_handle("https://www.threads.net/@someone?hl=fr"), "someone")
        self.assertEqual(normalize_handle("threads.com/@Someone/post/abc"), "someone")

    def test_invalid(self):
        for raw in ("", "@", "has space", "a" * 31, "bad!char", "https://example.com/@x"):
            self.assertIsNone(normalize_handle(raw), raw)


class ParseTest(unittest.TestCase):
    def test_txt_comments_dupes_invalid(self):
        parsed = parse("l.txt", "# liste\n@Alice\nbob  # troll\n\nalice\nnot valid\n")
        self.assertEqual(parsed.handles, ["alice", "bob"])
        self.assertEqual(parsed.duplicates, 1)
        self.assertEqual(parsed.invalid, ["not valid"])

    def test_csv_with_header(self):
        parsed = parse("l.csv", "id,Username,reason\n1,alice,spam\n2,@bob,bot\n")
        self.assertEqual(parsed.handles, ["alice", "bob"])

    def test_csv_without_header_uses_first_column(self):
        parsed = parse("l.csv", "alice,spam\nbob,bot\n")
        self.assertEqual(parsed.handles, ["alice", "bob"])

    def test_csv_bom(self):
        parsed = parse("l.csv", "﻿username\nalice\n")
        self.assertEqual(parsed.handles, ["alice"])

    def test_json_list_and_objects(self):
        self.assertEqual(parse("l.json", '["alice", "@bob"]').handles, ["alice", "bob"])
        self.assertEqual(
            parse("l.json", '{"users": [{"username": "alice"}, {"handle": "bob"}]}').handles,
            ["alice", "bob"],
        )

    def test_json_errors(self):
        with self.assertRaises(BlocklistError):
            parse("l.json", "{nope")
        with self.assertRaises(BlocklistError):
            parse("l.json", '{"x": 1}')

    def test_multiple_files_dedupe_across(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a.txt", Path(tmp) / "b.txt"
            a.write_text("alice\nbob\n")
            b.write_text("bob\ncarol\n")
            parsed = parse_blocklists([a, b])
        self.assertEqual(parsed.handles, ["alice", "bob", "carol"])
        self.assertEqual(parsed.duplicates, 1)

    def test_missing_file(self):
        with self.assertRaises(BlocklistError):
            parse_blocklists([Path("/nonexistent/list.txt")])


if __name__ == "__main__":
    unittest.main()
