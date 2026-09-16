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

# settings_walker.ts + folder-suggest.ts sind seit Welle 3 (2026-09-16) neu vendoriert —
# eigener, spaeterer Pin (Welle-Default 0.37.1), unabhaengig vom REF oben: „wer ein
# Modul NEU vendort, nimmt den aktuellen Welle-Pin; wer ein Repo mit aelterem Pin nur
# repariert, hebt dessen Pin nicht mit" (Dach-AGENTS.md, Kit-first-Regel 2). confirm.ts/
# hub.ts bleiben deshalb auf $REF (0.27.0), auch wenn $2 gesetzt wird. Inhaltlich macht
# das aktuell keinen Unterschied (0.27.0 und 0.37.1 sind fuer beide Dateien byte-gleich,
# gemessen 2026-09-16) — der zweite Pin dokumentiert trotzdem ehrlich, aus welcher Ref
# tatsaechlich gezogen wurde (CORE-META-22).
SW_REF=${2:-0.37.1}
SW_VER=$(echo "$SW_REF" | sed 's/^v//')
SW_SHA=$(git -C "$KIT" rev-parse --short "$SW_REF^{commit}")

mkdir -p src/vendor/kit src/vendor/kit-obsidian

vendor() { # $1 = Kit-Ref, $2 = Quellpfad unter src/, $3 = Zielpfad, $4 = Version fuer den Kopf
	{ printf '%s\n' "// vendored from obsidian-kit@$4, src/$2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
	  git -C "$KIT" show "$1:src/$2"; } > "$3"
}

vendor "$REF"    pure/callout.ts             src/vendor/kit/callout.ts               "$VER"
vendor "$REF"    pure/clipboard.ts           src/vendor/kit/clipboard.ts             "$VER"
vendor "$REF"    pure/frontmatter.ts         src/vendor/kit/frontmatter.ts           "$VER"
vendor "$REF"    pure/i18n.ts                src/vendor/kit/i18n.ts                  "$VER"
vendor "$REF"    pure/sha256.ts              src/vendor/kit/sha256.ts                "$VER"
vendor "$REF"    obsidian/hub.ts             src/vendor/kit-obsidian/hub.ts          "$VER"
vendor "$REF"    obsidian/confirm.ts         src/vendor/kit-obsidian/confirm.ts      "$VER"
vendor "$SW_REF" obsidian/settings_walker.ts src/vendor/kit-obsidian/settings_walker.ts "$SW_VER"
vendor "$SW_REF" obsidian/folder-suggest.ts  src/vendor/kit-obsidian/folder-suggest.ts  "$SW_VER"

# VENDOR.json in der reicheren files-Array-Form (ein Eintrag je Datei, nicht eine
# gemeinsame version). Sie kann einen Rueckstand einzelner Dateien ausdruecken —
# genau daran ist der i18n-0.16.0-Rueckstand aufgefallen. Nicht auf die flache Form
# zurueckbauen. Sie traegt auch einen gemischten Pin (kit-obsidian/ hat seit Welle 3
# zwei: $VER fuer confirm/hub, $SW_VER fuer settings_walker/folder-suggest).
entry() { printf '    { "vendored": "%s", "as": "%s", "version": "%s", "sha": "%s" }' "$1" "$2" "$3" "$4"; }

{
	printf '{\n  "source": "obsidian-kit",\n  "note": "Verbatim snapshots. Never hand-edit. Re-vendor via tools/sync-kit.sh.",\n  "files": [\n'
	entry pure/callout.ts callout.ts "$VER" "$SHA";                 printf ',\n'
	entry pure/clipboard.ts clipboard.ts "$VER" "$SHA";             printf ',\n'
	entry pure/frontmatter.ts frontmatter.ts "$VER" "$SHA";         printf ',\n'
	entry pure/i18n.ts i18n.ts "$VER" "$SHA";                       printf ',\n'
	entry pure/sha256.ts sha256.ts "$VER" "$SHA";                   printf '\n  ]\n}\n'
} > src/vendor/kit/VENDOR.json

{
	printf '{\n  "source": "obsidian-kit",\n  "note": "Verbatim snapshots. Never hand-edit. Re-vendor via tools/sync-kit.sh.",\n  "files": [\n'
	entry obsidian/confirm.ts confirm.ts "$VER" "$SHA";                             printf ',\n'
	entry obsidian/hub.ts hub.ts "$VER" "$SHA";                                     printf ',\n'
	entry obsidian/settings_walker.ts settings_walker.ts "$SW_VER" "$SW_SHA";       printf ',\n'
	entry obsidian/folder-suggest.ts folder-suggest.ts "$SW_VER" "$SW_SHA";         printf '\n  ]\n}\n'
} > src/vendor/kit-obsidian/VENDOR.json

echo "vendored aus obsidian-kit@$VER ($SHA): callout clipboard frontmatter i18n sha256 | confirm hub"
echo "vendored aus obsidian-kit@$SW_VER ($SW_SHA): settings_walker folder-suggest"
