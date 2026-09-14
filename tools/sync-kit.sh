#!/bin/sh
# Vendort Kit-Module byte-identisch aus dem Schwester-Repo obsidian-kit (Dach-AGENTS.md, Kit-first).
# Nie von Hand editieren — Skript neu laufen lassen. Zielordner nach Quellbereich getrennt (Kit-README).
#
# Eine Abweichung vom Vorbild (audio-interface/tools/sync-kit.sh), mit Grund. (Bis 2026-09-14
# gab es eine zweite: KIT=../../obsidian-kit, solange das Repo im Container
# finance-ledger-plugin/ lag; seitdem liegt es wie die anderen direkt im Dach.)
#  Vendoriert wird aus einem TAG (git show), nicht aus dem Worktree. Zwingend: seit
#     Kit-HEAD 2ab1bb5 ("pure-Teilmenge zieht nach code-kit") existieren src/pure/sha256.ts
#     und src/pure/clipboard.ts im Worktree gar nicht mehr — ein `cat` daraus liefe leer.
#     Der Pin steht damit im Skript und nicht in der Laune des Kit-Checkouts.
set -e
KIT=../obsidian-kit
REF=${1:-0.27.0}
VER=$(echo "$REF" | sed 's/^v//')
# ^{commit} ist Pflicht, nicht Kosmetik: ../tools/release/release.mjs taggt
# ANNOTIERT (git tag -a), und `rev-parse --short <annotierter Tag>` liefert die SHA
# des TAG-OBJEKTS, nicht die des Commits. In VENDOR.json staende dann eine SHA, die
# im `git log` des Kits gar nicht vorkommt — ein Auffindbarkeitsschaden, der erst
# auffaellt, wenn jemand den Stand nachschlagen will.
#
# Dass der bisherige Pin trotzdem stimmte, war Glueck: 0.27.0 ist zufaellig
# LEICHTGEWICHTIG, dort sind Tag-Objekt und Commit dieselbe SHA (548041b). Der
# naechste annotierte Tag haette es still gebrochen. Gemessen am 2026-09-02 an
# code-kit 0.5.0, wo genau das passiert ist (Tag-Objekt 41e96e0 vs. Commit efcd456).
SHA=$(git -C "$KIT" rev-parse --short "$REF^{commit}")

mkdir -p src/vendor/kit src/vendor/kit-obsidian

vendor() { # $1 = Quellpfad unter src/, $2 = Zielpfad
	{ printf '%s\n' "// vendored from obsidian-kit@$VER, src/$1 — do not hand-edit; re-vendor via tools/sync-kit.sh"
	  git -C "$KIT" show "$REF:src/$1"; } > "$2"
}

vendor pure/callout.ts      src/vendor/kit/callout.ts
vendor pure/clipboard.ts    src/vendor/kit/clipboard.ts
vendor pure/frontmatter.ts  src/vendor/kit/frontmatter.ts
vendor pure/i18n.ts         src/vendor/kit/i18n.ts
vendor pure/sha256.ts       src/vendor/kit/sha256.ts
vendor obsidian/hub.ts      src/vendor/kit-obsidian/hub.ts
vendor obsidian/confirm.ts  src/vendor/kit-obsidian/confirm.ts

# VENDOR.json in der reicheren files-Array-Form (ein Eintrag je Datei, nicht eine
# gemeinsame version). Sie kann einen Rueckstand einzelner Dateien ausdruecken —
# genau daran ist der i18n-0.16.0-Rueckstand aufgefallen. Nicht auf die flache Form
# zurueckbauen.
entry() { printf '    { "vendored": "%s", "as": "%s", "version": "%s", "sha": "%s" }' "$1" "$2" "$VER" "$SHA"; }

{
	printf '{\n  "source": "obsidian-kit",\n  "note": "Verbatim snapshots. Never hand-edit. Re-vendor via tools/sync-kit.sh.",\n  "files": [\n'
	entry pure/callout.ts callout.ts;         printf ',\n'
	entry pure/clipboard.ts clipboard.ts;     printf ',\n'
	entry pure/frontmatter.ts frontmatter.ts; printf ',\n'
	entry pure/i18n.ts i18n.ts;               printf ',\n'
	entry pure/sha256.ts sha256.ts;           printf '\n  ]\n}\n'
} > src/vendor/kit/VENDOR.json

{
	printf '{\n  "source": "obsidian-kit",\n  "note": "Verbatim snapshots. Never hand-edit. Re-vendor via tools/sync-kit.sh.",\n  "files": [\n'
	entry obsidian/confirm.ts confirm.ts; printf ',\n'
	entry obsidian/hub.ts hub.ts;         printf '\n  ]\n}\n'
} > src/vendor/kit-obsidian/VENDOR.json

echo "vendored aus obsidian-kit@$VER ($SHA): callout clipboard frontmatter i18n sha256 | confirm hub"
