# AGENTS.md — finance-ledger

> **Workspace-Standards:** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> (am Workspace-Root, maintainer-lokal), Modell comply-or-explain. Offene Punkte für
> dieses Repo siehe Abschnitt "Offene Konventions-Punkte".

Conventions for AI agents (Claude Code, Codex, …) working on this repository.

## Project character

Obsidian-Plugin (TypeScript, esbuild), das die Outputs des Schwester-Tools
[`finance-ledger-importer`](https://git.jkaindl.de/jkaindl/finance-ledger-importer)
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

### Node-APIs nur dynamisch + geguarded

`child_process`/`fs`/`fs/promises`/`path` ausschließlich als **dynamische** Imports hinter
**`Platform.isDesktop`-Guards**. Für genau die Desktop-Integrations-Dateien lockert
`eslint.config.mjs` die generische `import/no-nodejs-modules`-Regel per `allow`-Liste;
restlicher Code bleibt voll geschützt. Der Kern (Parser/Aggregator/Views/eingebauter
Import) ist node-frei und mobile-fähig; `isDesktopOnly: false`.

### Geld-Arithmetik

**decimal.js mit ROUND_HALF_UP** — nie `Math.round`/Float-Arithmetik auf Beträgen
(`Math.round(-0.5)` ergibt `-0`; kaufmännisch wird weg von der Null gerundet, und
negative Beträge sind hier die Regel).

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

## Test-Konventionen

- Framework: **vitest**, Environment Node, obsidian-Mock via Alias (`tests/__mocks__/obsidian.ts`)
- `test.exclude` für `.claude/**` und `node_modules/**` nicht entfernen (Worktree-Schutz)
- Neues Verhalten: erst Test, dann Implementierung (TDD)
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
- [~] PROF-OBS-14 — **gegenstandslos seit 2026-09-03.** Das GitHub-Konto des Maintainers ist
      geflaggt, alle Plugins sind aus dem Community Store geflogen. Der Store ist damit kein
      Verteilungsweg mehr, und die Einreichung übers Developer Dashboard entfällt.
      Verteilung läuft jetzt über den Forgejo-Release — siehe Abschnitt „Verteilung".

## Verteilung: Forgejo-Release, nicht Community Store

**Der Store ist kein Weg mehr** (2026-09-03): Das GitHub-Konto ist geflaggt, die Plugins sind
aus dem Store entfernt, die GitHub-Actions stehen. Ein Release entsteht deshalb so:

```bash
npm run release -- <version> --no-github
```

Das erzeugt einen Forgejo-Release mit `main.js`, `manifest.json`, `styles.css` **und**
`checksums.sha256` — genau die vier Assets, die `anysource-sideloader` erwartet und prüft.
`--no-github` ist dabei kein Notbehelf, sondern die benannte Entscheidung: ohne das Flag
versucht das Skript den Mirror-Push samt Verifikation und wartet auf eine Action, die nicht
mehr läuft.

⚠️ **Was danach noch fehlt, liegt nicht in diesem Repo:** ein abonnierbarer Katalog, ohne den
das Plugin zwar installierbar, aber nicht auffindbar ist. Dach-Task *„Eigener Plugin-Katalog
fehlt — Releases sind da, aber nicht auffindbar"*.

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
