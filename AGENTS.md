# AGENTS.md — finance-ledger

> **Workspace-Standards:** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md` (am Workspace-Root, maintainer-lokal), Modell comply-or-explain.

Conventions for AI agents (Claude Code, Codex, …) working on this repository.

## Project character

Obsidian-Plugin (TypeScript, esbuild), das die Outputs des Schwester-Tools
[`26-011-finanzplan-importer`](https://git.jkaindl.de/jkaindl/26-011-finanzplan-importer)
im Vault rendert und zurückschreibt: hledger-Journal als filterbare Tabelle,
Saldo-/Kategorie-Übersichten, TBC-Triage mit Categorizer-Rules-Verwaltung
(Vault-Notes als Source-of-Truth), Dashboard, CSV-Import — wahlweise eingebaut
(mobile-fähiger TS-Kern, kein Subprozess).

**Plugin-ID:** `finance-ledger` · **Lizenz:** AGPL-3.0-or-later · **minAppVersion:** 1.8.7

## Architecture principles

### Obsidian-import-freie Module

`src/views/helpers.ts`, `src/state/`, `src/aggregator/` und `src/core/` enthalten
Business-Logik **ohne obsidian-Import** (vitest läuft in Node; `extends ItemView` würde
den Module-Load brechen). Views/Modals importieren daraus und rufen die Obsidian-API
selbst auf. **Neue Logik immer zuerst in ein obsidian-freies Modul.** Für Persistenz das
StorageAdapter-Pattern aus `state/filterState.ts` nutzen.

### Vault-Pfade zentral (Single-Source-of-Truth)

ALLE Vault-Pfade kommen aus `resolveFinancePaths(settings)` in `src/state/financePaths.ts` —
**keine hardcodierten Pfade in Views/Modals**. Konfiguration: Setting `financeRoot` (primär)
+ Unterordner-Overrides. Leerer Root → Empty-State. Neue Pfad-Bedarfe IMMER in
`financePaths.ts` ergänzen, nie als Literal in einer View.

### Ein-Frontend-Hub

EIN `FinanceHubView` (`src/views/hub/`) mit Tab-Leiste statt mehrerer `registerView`.
Muster **mount-once**: jedes Panel wird einmal gemountet, Tab-Wechsel blendet per
`is-hidden` um. Panels kennen weder Plugin noch View — Navigation über late-bound
`navigate(tabId)`-Callback; Filter-Payloads reisen über den vault-scoped
localStorage-Channel.

### Parser-Ownership

Für den Subprocess-Weg ist der Importer-CLI Source-of-Truth für CSV-Parsing und
Kategorisierung. Der eingebaute Import (`src/core/import/`) ist ein 1:1-Port und wird
per Parity-Check (`npm run parity`) gegen die Python-Referenz gehalten, solange beide
existieren.

### Keine Node-APIs — gar keine (seit 2026-10-03)

Das Plugin lädt **kein** Node-Modul, auch nicht dynamisch und auch nicht hinter einem `Platform.isDesktop`-Guard: `child_process` und Node-`fs` erzeugen im Store-Review `medium`-Befunde und drücken die Note. `tests/bundle.test.ts` prüft das gebaute `main.js` gegen die vollständige `builtinModules`-Liste. Grund, Messung und was ein Nachbarplugin tut: `docs/internal/decisions.md`.

**Was daraus folgt:** Das Plugin schreibt alle Notiz-Arten des Python-Importers selbst; er wird für keine Notiz mehr gebraucht. Der Kopier-Knopf (`buildImporterCommand`, Einstellung `importerCwd`) ist ein Rückstand, den der Master entscheidet.

### Geld-Arithmetik

**decimal.js mit ROUND_HALF_UP** — nie `Math.round`/Float-Arithmetik auf Beträgen
(`Math.round(-0.5)` ergibt `-0`; kaufmännisch wird weg von der Null gerundet, und
negative Beträge sind hier die Regel).

### Schnappschüsse nach Großvater-Vater-Sohn

Vor jedem Schreibvorgang an den Categorizer-Regeln entsteht ein Schnappschuss unter `<financeRoot>/.fl-snapshots/`, aufbewahrt nach GFS (nicht „die letzten N"), den Zeitpunkt liest der Aufrufer aus dem Dateinamen, nie aus der mtime. Unbekannte Namen bleiben liegen. Regeln und Grund: `.claude/rules/snapshots.md`.

## Commands

```bash
npm ci                  # install
npm test                # vitest (Node, obsidian-Mock via Alias)
npm run typecheck       # tsc gegen echte obsidian-Typen (CI-Gate)
npm run lint            # eslint + eslint-plugin-obsidianmd — clean halten
npm run build           # main.js (committed)
npm run deploy          # build + cp nach ${OBSIDIAN_PLUGIN_DIR}
npm run parity          # eingebauter Import gegen Python-Referenz (maintainer-lokal)
npm run smoke:gui       # GUI-Smoke gegen laufendes Obsidian (maintainer-lokal, CDP)
```

`npm run typecheck:scripts`, `parity`, `smoke:gui` und `shots` brauchen Werkzeuge aus dem
Maintainer-Workspace (`../tools/obsidian-cdp/`, Importer-Repo) und überspringen sich
bzw. scheitern außerhalb davon — CI nutzt nur `typecheck` + `test` + `build`.

## Conventions

### i18n

UI-Sprache folgt Obsidians `getLanguage()` (EN kanonisch/Fallback, DE vollständig).
Neue UI-Strings: Key + EN/DE-Eintrag in `src/i18n/strings.ts`, nie hartcodierten Text.
Ausnahme: Konto-Präfixe (`Ausgaben:`/`Einnahmen:`) in Daten/Matching bleiben hart deutsch.

### Dezimaltrenner & Tag-Format

`journal.ledger` verwendet **Punkt** (hledger-Standard). Tags stehen als `:tag1:tag2:`
auf **einer** Zeile; Pattern `/^; (:[a-z0-9_-]+)+:$/`.

### Test-Konventionen

- Framework: **vitest**, Environment Node, obsidian-Mock via Alias (`tests/__mocks__/obsidian.ts`)
- `test.exclude` für `.claude/**` und `node_modules/**` nicht entfernen (Worktree-Schutz)
- Neues Verhalten: erst Test, dann Implementierung (TDD)
- Die Typprüfung der Tests gehört ins Gate (`npm run typecheck:test`, `tsconfig.test.json`); `tests/__mocks__/obsidian.ts` hat ein explizit typisiertes `FakeEl`, `vitest.config.ts` pinnt `TZ=Europe/Berlin` (eine Zonenprobe mit `TZ=… npx vitest` misst nichts)
- Zahlenformat und Datumszeit folgen der Oberflächensprache (`numberLocale()` in `views/helpers.ts`), nie einem festen Land
- Alle Tests grün vor `git commit`; `tests/bundle.test.ts` prüft das **gebaute** main.js
  (Regressions-Guard gegen untransformierte Node-Builtin-Imports im Bundle)

### Release

`npm run release -- <version>` (`release.mjs`) setzt den Tag, erzeugt den Forgejo-Release mit `main.js`, `manifest.json`, `styles.css` **und** `checksums.sha256` (die vier Assets, die `anysource-sideloader` erwartet und prüft) und schiebt Branch und Tag per Dual-Push nach GitHub; nie `git push github` von Hand, nie `--no-github`. Die Arbeitssession meldet release-reif, die koordinierende Session fährt den Release (CORE-AGENT-14). Weg, Store-Rescan und Verlauf: `../.claude/rules/release-und-store.md`, `docs/internal/decisions.md`.

## Gotchas

Was das Plugin **nicht** tut:

- Konto-/Vertrags-Note-Schemas ändern (die besitzt der Importer)
- Categorizer-**Logik** forken — der eingebaute Import bleibt Parity-gebunden an die Referenz

## Context index

- Bevor du Notizen des Imports (`src/core/notes/`, `src/core/import/`), den Paritätsvergleich oder die Frontmatter- und Ledger-Schemas anfasst: `.claude/rules/notes-importer.md`.
- Bevor du Schnappschüsse oder ihre Rotation (`src/core/snapshot/`) änderst: `.claude/rules/snapshots.md`.
- Bevor du eine Altentscheidung (keine Node-APIs, Release-Weg und Store-Verteilung, erledigte Konventions-Punkte) übernimmst: `docs/internal/decisions.md`.
- Vor einem Release, einer Store-Einreichung oder einem Rescan: `../.claude/rules/release-und-store.md`, Skills `plugin-release-setup` und `store-rescan`.
- Bevor du den GUI-Smoke änderst oder fährst: `docs/SMOKE.md` (Checkliste); Treiber-Regeln, Instanz und Lock des Dachs: `../.claude/rules/gui-smoke-treiber.md`, `../.claude/rules/obsidian-instanz.md`, `../.claude/rules/cdp-lock.md`, `../.claude/rules/staging-vaults.md`.
- Vor UI-Arbeit: `docs/design.md` und `docs/design/` (Design-System, Tokens, Previews), `docs/UI-Cookbook.md` (Chart-Strategie, Snippets), `../UI-STANDARD.md`, `../.claude/rules/ui-bausteine.md`; vor Änderungen an `styles.css`: `../.claude/rules/store-css.md`.
- Für die vollständige Feature-Historie: `CHANGELOG.md` (maßgeblich). Specs und Pläne liegen im Vault-Cockpit im Ordner _SDD (CORE-META-14), nicht im Repo.
- Bevor du eine Regel-ID (CORE-…, PROF-OBS-…) auslegst: `_docs:CONVENTIONS.md`.

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`).
Session-Handoff unter `.remember/` (gitignored).

## Abweichungen von der Leitkonvention

Derzeit keine. *(Die CORE-META-09-Abweichung „README bleibt deutsch" ist am 2026-09-02
aufgelöst — `README.md` ist jetzt EN-kanonisch, `README.de.md` trägt die deutsche Fassung.
Beide Fassungen sind inhaltsgleich zu halten; wer eine ändert, ändert die andere mit.)*
