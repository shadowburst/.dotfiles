import json
from pathlib import Path
import unittest


class LayoutTests(unittest.TestCase):
    def test_personal_layout_combines_mods_and_preserves_status(self):
        root = Path(__file__).resolve().parents[1]
        layout = json.loads((root / "layouts/personal.json").read_text())

        def nodes(node):
            yield node
            for child in node.get("children", []):
                yield from nodes(child)

        blocks = list(nodes(layout))
        ids = [node["id"] for node in blocks]
        self.assertEqual(len(ids), len(set(ids)))
        tabs = next(node for node in blocks if node["id"] == "tabs")
        self.assertEqual(tabs["content"], {"mod": "auto-tabs"})
        self.assertEqual(tabs["size"], {"px": 42})
        status = next(node for node in blocks if node["id"] == "status")
        self.assertEqual(status["size"], {"px": 28})
        self.assertEqual(
            [child["content"]["mod"] for child in status["children"]],
            ["usage-bar", "workspace-status"],
        )
        self.assertTrue((root / layout["preview"]).is_file())
