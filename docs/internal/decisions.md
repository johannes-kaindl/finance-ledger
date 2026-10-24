# Entscheidungen — das Warum

Verdichtete Begründungen zu den Regeln im Kern (`AGENTS.md`). Vor dem Übernehmen einer Altentscheidung gilt: Grund aufsuchen, messen, ob er heute trägt.

## Keine Node-APIs — gar keine (seit 2026-10-03)

Das Plugin lädt **kein** Node-Modul, auch nicht dynamisch und auch nicht hinter einem
`Platform.isDesktop`-Guard. Vorher taten das drei Stellen: der Importer-Subprozess
(`child_process`), die Temp-Kopie der CSV-Vorschau (`fs/promises`, weil der Python-Prozess
einen Pfad brauchte) und das git-Backup (`execFile git`). Alle drei sind abgelöst:
`runNativeImport` fährt den Import im Plugin, `core/import/preview` parst den Inhalt der
gewählten Datei, `core/snapshot/ruleSnapshot` sichert über die Vault-API.

**Grund ist der Store-Review:** `child_process` erzeugt dort `[medium] Shell Execution`,
Node-`fs` erzeugt `[medium] Direct Filesystem Access`, und `medium` drückt die Review-Note.
Gemessen am 2026-10-03: 25 eigene Store-Plugins stehen auf `Passed` mit bis zu zehn
Recommendations (`info` kostet nichts), während **alle vier** geprüften fremden Plugins mit
`child_process` (`obsidian-git`, `obsidian-shellcommands`, `obsidian-pandoc`,
`obsidian-enhancing-export`) auf `Caution` oder `Risks` liegen.

Wer eine Node-API wieder einführt, nimmt der Einreichung die Bestnote — **und** bricht
`tests/bundle.test.ts`, der das gebaute `main.js` gegen die vollständige
`builtinModules`-Liste prüft (inklusive Gegenprobe, dass das Suchmuster trifft). Was ein
Nachbarplugin in dieser Lage tut, steht in der Dach-`AGENTS.md` § Store-Einreichung.

## Verteilung: Release über `release.mjs`, Store und Sideloader

Seit der Rückkehr zu GitHub (2026-09-24, Dach-AGENTS § Store-Einreichung) gelten wieder beide Wege: der Community-Store und der `anysource-sideloader`-Katalog. Ein Release entsteht mit `npm run release -- <version>`: `release.mjs` setzt den Tag, erzeugt den Forgejo-Release mit `main.js`, `manifest.json`, `styles.css` **und** `checksums.sha256` (die vier Assets, die `anysource-sideloader` erwartet und prüft) und schiebt Branch und Tag per Dual-Push nach GitHub, wo `release.yml` das GitHub-Release baut. `--no-github` wird nicht mehr verwendet (das Flag existiert in `release.mjs` weiter, steht aber in keiner `package.json`); GitHub bekommt Branch und Tag nur von `release.mjs`, nie per Hand-Push.

Releases fährt die koordinierende Session nach Freigabe, nicht die Arbeitssession (CORE-AGENT-14). Nach dem Tag steht der Review noch aus: Rescan im Developer Dashboard anstoßen (nur der Maintainer), danach `scorecard.py finance-ledger` prüfen. Die Installationswege für Nutzer stehen in `README.md` und `README.de.md`.

## Erledigte Konventions-Punkte

Die Checkliste stand bis zur Kürzung der `AGENTS.md` (CORE-AGENT-15) als Abschnitt „Offene Konventions-Punkte“ dort; alles war erledigt.

- [x] CORE-META-01/02 — README-Kopf kanonisch + Badge-Zeile
- [x] CORE-META-05/07/08 — `LICENSE` AGPL-3.0-or-later · `LICENSE-DOCS` CC BY-SA 4.0
- [x] CORE-META-06 — `CHANGELOG.md` · `CONTRIBUTING.md` · `SECURITY.md`
- [x] CORE-META-10 — `description`/`keywords`/`author`/`repository` in `package.json`
- [x] CORE-AGENT-05/06 — `.gitignore` · `.editorconfig`
- [x] PROF-TS-01/04 — lint + typecheck · `tsconfig.build.json`-Split
- [x] PROF-OBS-02 — Deploy per `${OBSIDIAN_PLUGIN_DIR:?…}`
- [x] CORE-GIT-01 — Forgejo-`origin` + GitHub-Mirror eingerichtet, 0.1.0 released
- [x] CORE-META-09 — `README.md` EN-kanonisch + `README.de.md`, mit Sprach-Toggle-Zeile
- [x] PROF-OBS-14 — Community-Store: `finance-ledger` steht seit der Rückkehr zu GitHub (2026-09-24) wieder in `community-plugins.json` (gemessen 2026-10-12), Scorecard `Review Passed · Health Excellent`. Ausstieg vom 03. bis 24.09.2026 ist Chronik.
