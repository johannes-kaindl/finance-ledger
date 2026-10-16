# AGENTS.md — finance-ledger

> **Workspace-Standards:** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> (am Workspace-Root, maintainer-lokal), Modell comply-or-explain. Offene Punkte für
> dieses Repo siehe Abschnitt "Offene Konventions-Punkte".

Conventions for AI agents (Claude Code, Codex, …) working on this repository.

## Project character

Obsidian-Plugin (TypeScript, esbuild), das die Outputs des Schwester-Tools
[`26-011-finanzplan-importer`](https://git.jkaindl.de/jkaindl/26-011-finanzplan-importer)
im Vault rendert und zurückschreibt: hledger-Journal als filterbare Tabelle,
Saldo-/Kategorie-Übersichten, TBC-Triage mit Categorizer-Rules-Verwaltung
(Vault-Notes als Source-of-Truth), Dashboard, CSV-Import — wahlweise eingebaut
(mobile-fähiger TS-Kern) oder via Importer-Subprocess (Desktop).

**Plugin-ID:** `finance-ledger` · **Lizenz:** AGPL-3.0-or-later · **minAppVersion:** 1.8.7

## Architektur-Invarianten

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

**Was dadurch wegfällt:** Berichte und Dimensions-Notizen (`--all-aggregates` und die
übrigen Flags) entstehen nur noch im Importer-CLI. `buildImporterCommand` in
`views/helpers.ts` baut den vollständigen Befehl samt `FINANCE_VAULT`-Umgebung als
Kopier-Knopf — ohne die Variablen schreibt der Importer in seinen Fallback-Ordner, mit
Exit-Code 0. Die Ablösung ist der Roadmap-Task „Importer-Port", Etappen E4–E7.

### Geld-Arithmetik

**decimal.js mit ROUND_HALF_UP** — nie `Math.round`/Float-Arithmetik auf Beträgen
(`Math.round(-0.5)` ergibt `-0`; kaufmännisch wird weg von der Null gerundet, und
negative Beträge sind hier die Regel).

### Schnappschüsse nach Großvater-Vater-Sohn

Vor jedem Schreibvorgang an den Categorizer-Regeln entsteht ein Schnappschuss: eine
JSON-Datei unter `<financeRoot>/.fl-snapshots/` mit dem Stand **vor** dem Schreiben.
Aufbewahrt wird nach GFS (Policy 6 heute / 7 Tage / 4 Wochen / 6 Monate), nicht „die letzten N". Die Auswahl ist `selectGfsRetention` aus dem Kit (code-kit `rotation`, vendort nach `src/vendor/kit/rotation.ts`, seit 2026-10-12; vorher eine lokale Fassung, deren Golden-Tabellen in `tests/core/snapshot/rotation.test.ts` weiterleben). Sie ist eine pure Funktion über Zeitstempel, ohne Dateizugriff; den Zeitpunkt liest der Aufrufer aus dem Dateinamen, nicht aus der mtime: ein Sync oder ein Restore setzt mtimes neu und würde die Rotation verfälschen.

Der Schnitt stammt aus der `settings-assistant`-Spec (Entscheidung Johannes 2026-10-03). **Unbekannt heißt erhalten, und zwar strenger als das Kit:** `timeFromStampedName` findet den Stempel irgendwo im Namen, also bekämen `rules-<Stempel>.txt`, `….json.bak` und Sync-Konfliktkopien wie `… (1).json` eine Zeit und würden gelöscht. `rotationTime` in `ruleSnapshot.ts` nimmt deshalb nur Namen in die Aufbewahrung, die den Rundlauf Name → Zeit → Name bestehen (`stampedName(t, { prefix: "rules-", suffix: ".json" }) === name`); `tests/core/snapshot/ruleSnapshot.test.ts` hält das fest. Ein Stempel, der kein echter Zeitpunkt ist (Monat 13), bleibt ebenfalls liegen.

Vorgänger war ein `git commit` im Vault, der **nie lief** — der einzige Weg dorthin war ein
`options.vaultPath`, das kein Produktiv-Aufrufer setzte. Getestet war die Funktion mit neun
Tests, aufgerufen wurde sie nicht.

### i18n

UI-Sprache folgt Obsidians `getLanguage()` (EN kanonisch/Fallback, DE vollständig).
Neue UI-Strings: Key + EN/DE-Eintrag in `src/i18n/strings.ts`, nie hartcodierten Text.
Ausnahme: Konto-Präfixe (`Ausgaben:`/`Einnahmen:`) in Daten/Matching bleiben hart deutsch.

### Dezimaltrenner & Tag-Format

`journal.ledger` verwendet **Punkt** (hledger-Standard). Tags stehen als `:tag1:tag2:`
auf **einer** Zeile; Pattern `/^; (:[a-z0-9_-]+)+:$/`.

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

## Importer-Port (Stand Welle 22)

Der eingebaute Kern (`src/core/`) deckt E0–E3 ab und seit Welle 22 den Aggregations-Kern samt Budget (E4, `src/core/aggregate/`, noch nicht verdrahtet; E5–E7 hängen daran). Berichte und Dimensions-Notizen erzeugt weiterhin der Python-Importer (Referenz lokal unter `~/Archive/repos/26-011-finanzplan-importer`).

## Test-Konventionen

- Framework: **vitest**, Environment Node, obsidian-Mock via Alias (`tests/__mocks__/obsidian.ts`)
- `test.exclude` für `.claude/**` und `node_modules/**` nicht entfernen (Worktree-Schutz)
- Neues Verhalten: erst Test, dann Implementierung (TDD)
- Die Typprüfung der Tests gehört ins Gate (`npm run typecheck:test`, `tsconfig.test.json`); `tests/__mocks__/obsidian.ts` hat ein explizit typisiertes `FakeEl`, `vitest.config.ts` pinnt `TZ=Europe/Berlin` (eine Zonenprobe mit `TZ=… npx vitest` misst nichts)
- Zahlenformat und Datumszeit folgen der Oberflächensprache (`numberLocale()` in `views/helpers.ts`), nie einem festen Land
- Alle Tests grün vor `git commit`; `tests/bundle.test.ts` prüft das **gebaute** main.js
  (Regressions-Guard gegen untransformierte Node-Builtin-Imports im Bundle)

## Vault-Daten-Schemas (Kurzreferenz)

### journal.ledger-Transaktion

```
2025-08-01 * Telekom Deutschland GmbH
    ; verwendungszweck: Festnetz Vertragskonto …
    ; quelle: <csv-name> row 12
    ; :recurring:
    Aktiva:Bank:Sparkasse:Hauptkonto  -39.95 EUR
    Ausgaben:Kommunikation:Festnetz:Telekom  39.95 EUR
```

### Konto-Note-Frontmatter (Pflichtfelder)

```yaml
kategorie: konto
iban: DE…
ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto"
saldo_eur: 280.44
```

### Vertrags-Note-Frontmatter (Pflichtfelder)

```yaml
kategorie: vertrag
ledger_kategorie: "Ausgaben:Kommunikation:Festnetz:Telekom"
betrag_eur: 39.95
rhythmus: monatlich
naechste_zahlung: 2026-06-06
```

Pfad-Muster: `<vault>/<financeRoot>/20-Verträge/<Name>.md`.

## Was das Plugin NICHT tut

- Konto-/Vertrags-Note-Schemas ändern (die besitzt der Importer)
- Categorizer-**Logik** forken — der eingebaute Import bleibt Parity-gebunden an die Referenz

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`).
Session-Handoff unter `.remember/` (gitignored).

## Offene Konventions-Punkte

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

## Verteilung: Release über `release.mjs`, Store und Sideloader

Seit der Rückkehr zu GitHub (2026-09-24, Dach-AGENTS § Store-Einreichung) gelten wieder beide Wege: der Community-Store und der `anysource-sideloader`-Katalog. Ein Release entsteht mit `npm run release -- <version>`: `release.mjs` setzt den Tag, erzeugt den Forgejo-Release mit `main.js`, `manifest.json`, `styles.css` **und** `checksums.sha256` (die vier Assets, die `anysource-sideloader` erwartet und prüft) und schiebt Branch und Tag per Dual-Push nach GitHub, wo `release.yml` das GitHub-Release baut. `--no-github` wird nicht mehr verwendet (das Flag existiert in `release.mjs` weiter, steht aber in keiner `package.json`); GitHub bekommt Branch und Tag nur von `release.mjs`, nie per Hand-Push.

Releases fährt die koordinierende Session nach Freigabe, nicht die Arbeitssession (CORE-AGENT-14). Nach dem Tag steht der Review noch aus: Rescan im Developer Dashboard anstoßen (nur der Maintainer), danach `scorecard.py finance-ledger` prüfen. Die Installationswege für Nutzer stehen in `README.md` und `README.de.md`.

## Abweichungen von der Leitkonvention

Derzeit keine. *(Die CORE-META-09-Abweichung „README bleibt deutsch" ist am 2026-09-02
aufgelöst — `README.md` ist jetzt EN-kanonisch, `README.de.md` trägt die deutsche Fassung.
Beide Fassungen sind inhaltsgleich zu halten; wer eine ändert, ändert die andere mit.)*

## Kontext-Quellen (für tiefere Architektur-Recherche)

| Datei | Inhalt |
|-------|--------|
| `CHANGELOG.md` | Vollständige Feature-Historie (maßgeblich) |
| `docs/design.md` + `docs/design/` | Design-System (Tokens, Previews) |
| `docs/UI-Cookbook.md` | Chart-Strategie + Code-Snippets für künftige Features |
| `docs/SMOKE.md` | GUI-Smoke-Checkliste (maintainer-lokal automatisiert) |

Specs und Pläne liegen im Vault-Cockpit unter `_SDD/` (CORE-META-14), nicht im Repo.
