"""Exportiert konten.yaml und die Rule-Notes als JSON für den TS-Vergleichslauf.

Bewusst roh: die Frontmatter-Felder gehen unverändert raus, damit die
TS-Seite ihre eigene Validierung und Sortierung durchläuft und nicht die
Python-Ergebnisse geschenkt bekommt.
"""

import json
import sys
from pathlib import Path

import yaml

konten_path = Path(sys.argv[1])
rules_dir = Path(sys.argv[2])
out_path = Path(sys.argv[3])

konten = yaml.safe_load(konten_path.read_text(encoding="utf-8"))

notes = []
for md in sorted(rules_dir.glob("*.md")):
    text = md.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        continue
    end = None
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == "---":
            end = i
            break
    if end is None:
        continue
    try:
        fm = yaml.safe_load("\n".join(lines[1:end])) or {}
    except yaml.YAMLError:
        continue
    if not isinstance(fm, dict):
        continue
    if fm.get("kategorie") != "categorizer-rule":
        continue
    if fm.get("deprecated") is True:
        continue
    required = {"kategorie", "pattern", "pattern_type", "ledger_account", "priority", "tags"}
    if required - fm.keys():
        continue
    notes.append(
        {
            "pattern": str(fm["pattern"]),
            "patternType": str(fm["pattern_type"]),
            "ledgerAccount": str(fm["ledger_account"]),
            "priority": int(fm["priority"]),
            "tags": [str(t) for t in (fm["tags"] or []) if t is not None],
            "aliases": [str(a) for a in (fm.get("aliases") or []) if a is not None],
            "sourceFile": md.name,
        }
    )

out_path.write_text(
    json.dumps({"konten": konten, "notes": notes}, ensure_ascii=False, indent=1),
    encoding="utf-8",
)
print(f"{len(notes)} Regel-Notizen, {len(konten.get('konten', []))} Konten exportiert")
