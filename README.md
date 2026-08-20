# Finance Ledger

Obsidian-Plugin, das hledger-Journale als filterbare Tabellen mit Saldo-/Kategorie-Dashboards, Transaktions-Triage und Categorizer-Rule-Verwaltung rendert — gespeist vom Sister-Repo `26-011-finanzplan-importer`.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/finance-ledger?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/finance-ledger/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%20%7C%20Desktop%2BMobile-lightgrey)

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/hero.png" width="600" alt="Obsidian mit geöffneter Konto-Notiz links und dem Finance-Hub rechts: eine filterbare Buchungstabelle mit Datum, Empfänger, Konto-Chips, Beträgen und Tags.">

> Plugin-ID: `finance-ledger` (bis 2026-06-10: `finance`). Veröffentlichungs-Roadmap siehe AGENTS.md.

## Status

**Stand 2026-06-10 (post Phase 1 Publikations-Track):** Slices 1–10 + F15-Design-System gemergt. Mobile-Readiness (Platform.isMobile-Guards) + Design-System (KSP + Finance-Tokens + Light-Mode) integriert.

**Vitest:** 676 grün. **Plugin-Size:** ~161kb (`main.js`). **Importer-Tests:** 425 grün.

**Stand 2026-08-17 — Importer-Port, Etappen E0–E3:** Der eingebaute Import erzeugt `journal.ledger`, `accounts.ledger`, `opening_balances.ledger` **und** die Konto- und Vertrags-Notizen — ohne Python. Dabei fasst er nur an, was er selbst erzeugt hat: `anfangssaldo_eur`, `created`, eigene Frontmatter-Felder und alles unterhalb des `AUTO-GENERATED`-Markers überleben jeden Lauf. Belegt durch `npm run smoke:gui` gegen ein laufendes Obsidian (21/21; Gegenprobe mit ausgebautem Patch-Pfad 15/20). Berichte und Dimensions-Notizen (E4–E7) laufen weiterhin über den Importer-Subprozess.

**Davor, Stand 2026-08-04 — Etappen E0+E1:** Der CSV-Import läuft jetzt auch **im Plugin selbst** (TypeScript, ohne Python-Subprozess). Belegt per Byte-Vergleich gegen den Python-Importer über echte Daten: `journal.ledger` identisch (1.576 Buchungen, 12 CSVs). Wiederholbar mit `npm run parity`. Die Berichts- und Notiz-Generatoren (E3–E7) laufen weiterhin über den Importer-Subprozess.

**Slice-10 Detail-Pages-Layer:** Importer schreibt 7 zusätzliche Wikilink-Achsen + 2 neue Note-Klassen (Tx-Typen + Mandate) + Lebensbereich-Schicht in den Vault. Plugin-Code unverändert (tolerant gegen erweiterte Note-Schemas).

## Features

### Views

- **Ledger Viewer** — sortier-/filterbare Tabelle aller Buchungen aus `journal.ledger`, mit Click-Nav zu Kategorie-/Konto-/Empfänger-Notes
- **Saldo Overview** — **Stand-Am-aware** (Slice-8-B): zeigt `Anfangssaldo (Stand-Am pro Konto) + Tx ab Stand-Am`. Tx vor Stand-Am gefiltert (keine Doppelzählung im Bootstrap-Workflow). Plus TBC-Marker für Konten ohne `anfangssaldo_eur:`.
- **Category Overview** — hierarchisches Aggregat aller Kategorien mit Anteil-%
- **TBC Triage** — alle `:tbc:`-Buchungen mit Quick-Action „Account zuweisen + Categorizer-Rule speichern + Tag entfernen"
- **Finance Dashboard** — 5-Card-Übersicht (Saldi, TBC-Backlog, Recurring, Top-Spend-Kategorien, Vertrags-Auflauf)

### Aktionen

- **Journal aus CSVs neu aufbauen (eingebaut)** — Befehl, der `journal.ledger` + `accounts.ledger` direkt im Plugin erzeugt: kein Python, kein `uv`, kein Subprozess. Läuft auch auf Mobilgeräten. Konten-Konfiguration kommt aus `konten.yaml` im Vault (Einstellung „Konten-Datei")
- **CSV-Import-Modal** (Desktop-only) — Mehrere CSVs hochladen, gegen vorhandene Imports dedupen (Slice-7 Anti-Dup), anschließend Importer-Subprocess auslösen
- **Re-Import** — `uv run python -m importer.cli` im Sister-Repo via subprocess (mit UI-Lock + Counter-Reset)
- **Git-Auto-Backup** — pre-write-Commit mit lock-retry + detached-head-detection
- **Categorizer-Rule-Modal** — neue Pattern-Rule definieren mit Live-Match-Counter + Conflict-Check, schreibt nach `categorizer-rules/`
- **Account-Suggestions** — Type-Ahead aus `accounts.ledger` + Frontmatter-Crawl + Dedup
- **Deep-Link-URI** — `obsidian://finance?mode=ledger&filter=…` zur direkten Filter-Steuerung von außen

### So sieht das aus

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/dashboard.png" width="600" alt="Dashboard-Reiter mit Karten für Kontostände, letzte Aktivität, Schnellnavigation, Schnellaktionen und den größten Ausgabenkategorien des laufenden Monats.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/balances.png" width="600" alt="Balances-Reiter: je Konto Anfangssaldo mit Stichtag, Bewegung seit dem Stichtag und aktueller Stand.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/categories.png" width="600" alt="Categories-Reiter: Ausgabenkategorien als Hierarchie mit Betrag und Anteil in Prozent.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/triage.png" width="600" alt="To-classify-Reiter: vier noch nicht zugeordnete Buchungen mit Betrag und je einem Classify-Knopf, darunter die Summenzeile.">

## How it works

Das Plugin **rechnet nicht selbst aus Rohdaten** — es liest das hledger-Journal, das der
Importer geschrieben hat, und macht daraus Ansichten. Die eine Stelle, an der es doch
rechnet, ist der Kontostand:

### Stand-Am-aware Saldo-Logik

Plugin parst `opening_balances.ledger` via Mini-Parser (`src/aggregator/openingBalances.ts`):

```typescript
parseOpeningBalances(text: string): Map<account, {amount, standAm}>
```

`computeSaldo(account)` = `opening.amount + Sum(tx where tx.date > opening.standAm)`.

Bootstrap-Workflow: User trägt aktuellen Bank-Saldo + heutiges Datum in Konto-Note Frontmatter (`anfangssaldo_eur` + `anfangssaldo_stand_am`). Importer schreibt daraus `opening_balances.ledger`. Plugin filtert Tx vor Stand-Am.

## Requirements

- **Obsidian 1.8.7 oder neuer**, Desktop und Mobile (`isDesktopOnly: false`).
- Ein **hledger-Journal im Vault** — `journal.ledger`, `accounts.ledger` und optional
  `opening_balances.ledger`. Ohne Journal zeigen die Ansichten nichts an.
- Für den **eingebauten** Journal-Aufbau aus CSVs: eine `konten.yaml` im Vault. Kein Python,
  kein `uv` — dieser Weg läuft auch mobil.
- Nur für den **Re-Import über das Schwester-Repo** (Berichte und Notiz-Generatoren):
  Desktop, `uv` und ein Checkout von `26-011-finanzplan-importer`.

## Install

Das Plugin ist **nicht im Community-Store** (Veröffentlichungs-Roadmap siehe `AGENTS.md`),
also von Hand:

1. `main.js`, `manifest.json` und `styles.css` aus dem
   [neuesten Release](https://git.jkaindl.de/jkaindl/finance-ledger/releases) herunterladen.
2. Nach `<vault>/.obsidian/plugins/finance-ledger/` kopieren.
3. Obsidian → Einstellungen → Community-Plugins → **Finance Ledger** aktivieren.

Aus dem Quelltext: `npm install && npm run build` erzeugt dieselben Dateien; `npm run deploy`
legt sie direkt in ein konfiguriertes Vault (siehe *Build & Deploy*).

## Usage

Das Pie-Chart-Symbol in der Seitenleiste öffnet das Dashboard. Alles Weitere über die
Befehlspalette:

| Befehl | Ansicht |
|---|---|
| `Open finance dashboard` | Fünf-Karten-Übersicht: Saldi, TBC-Rückstand, Wiederkehrendes, Top-Ausgaben, Vertrags-Auflauf |
| `Open ledger viewer` | die filterbare Buchungstabelle |
| `Open balance overview` | Kontostände je Konto, Stand-Am-korrigiert |
| `Open category overview` | hierarchisches Kategorie-Aggregat |
| `Open TBC triage` | die offenen `:tbc:`-Buchungen samt Ein-Klick-Zuordnung |
| `Rebuild journal from CSVs (built-in)` | baut `journal.ledger` und `accounts.ledger` neu — ohne externen Prozess |
| `Import CSV` | Mehrfach-Upload mit Dedup (nur Desktop) |

Der übliche Ablauf: Journal aufbauen oder importieren → **TBC-Triage** abarbeiten (jede
Zuordnung schreibt zugleich eine Categorizer-Regel, damit dieselbe Buchung künftig von
selbst landet) → Dashboard lesen.

Von außen ansteuerbar ist das Plugin über
`obsidian://finance?mode=ledger&filter=…`.

## Configuration

Einstellungen → Community-Plugins → **Finance Ledger**:


- **Amount display** (F1): Vorzeichen-Modus (Intuitiv: Einnahmen +/Ausgaben − · Buchhalterisch: roh nach hledger) + Farbschema (Klassisch/Monochrom/Invertiert) als Swatch-Kacheln mit Live-Vorschau. Fluss folgt den Settings, Saldos bleiben vorzeichen-basiert; Farbe hängt am Konto-Typ (orthogonal zum Vorzeichen).
- Vault-relative Pfade zu Ledger / Konten / Verträge / Categorizer-Rules
- `uv`-Binary-Pfad mit Auto-Detect-Fallback
- Filter-Preset-CRUD (lokal persistiert)

## Design-System

Plugin nutzt einen drei-Schichten-Ansatz:

- **Obsidian-CSS-Variablen** für UI-Layout, Typography, Borders, Surfaces (theme-agnostic)
- **`--fl-*`-Tokens** für finance-spezifische Semantik (Credit/Debit/TBC-Farben, Account-Type-Akzente, Money-Display, Typed-Card-Top-Borders)
- **KSP-Signal-Palette** als Foundation der `--fl-*`-Tokens, mit Light-Mode-Korrekturen für AA-Kontrast

**F15-Wiring-Stand (Slice-9):** in 5 Views appliziert — SaldoOverview, FinanceDashboard, LedgerView, TBCTriage, CategoryOverview. Money-Werte mit `.fl-money` + sign-color, Konto-Chips mit `data-type`-Outline, Cards mit `data-card`-Top-Border, Status-Dots mit `.fl-txn-state`. Light-Mode-Bridge dimmt Signal-Farben für AA-Kontrast.

Detaillierte Doku: [`docs/design.md`](docs/design.md) (high-level + Wiring-Stand) + [`docs/design/README.md`](docs/design/README.md) (canonical token files).

## Mobile-Status

- **Desktop-only-Pfade:** CSV-Import-Modal + Re-Import-Subprocess. Mobile zeigt Notice „nur auf Desktop verfügbar".
- **Mobile = Read-Only:** Views rendern, aber keine subprocess- oder Git-Aktionen.
- **Mobile-Icons:** Auf iPhone/iPad nach letztem Mobile-Icons-Fix-Burst noch teils Platzhalter sichtbar — F14-Backlog (Diagnose pending am Desktop mit Mobile-DevTools).

## Schwester-Repo (Importer)

- **Importer:** [`finance-ledger-importer`](https://git.jkaindl.de/jkaindl/finance-ledger-importer) (Python-CLI)
- **Output im Vault:** `<vault>/<financeRoot>/Ledger/` plus 10-Konten / 20-Verträge / 30-Sparziele / 40-Monatsberichte / 45-Kategorien / 55-Categorizer-Rules / 60-Empfänger / 70-Quartalsberichte / 80-Jahresberichte / 05-Bases

### Slice-9 Output-Note-Schema (Marker-System)

Alle vom Importer geschriebenen Notes (Konto/Bericht/Kategorie/Empfänger/Rule) nutzen seit Slice-9 ein Marker-Pattern für sauberen User-Edit-Schutz:

```
---
Frontmatter
---
<user-editable header>

<!-- BEGIN: AUTO-GENERATED -->
Auto-Section (Tabellen, Mermaid-Charts, Bases-Embeds, Verweise)
<!-- END: AUTO-GENERATED -->

## 📌 Notizen / 📌 Bemerkungen
User-Edit-Zone — bleibt bei Re-Run unangetastet.
```

Plus: Mermaid-Charts (Pie für Top-Kategorien, Bar/xy-Line für Trends), collapsible Bases-Embeds in `[!quote]-`-Callouts.

### Slice-9 Budget-Layer

Monatsberichte haben jetzt eine `💰 Budget-Übersicht`-Section: Soll (12-Mon-Avg) / Ist / Prognose (lineare Hochrechnung) / Diff / Ampel (🟢 unter 90% Soll, 🟡 90-110%, 🔴 über 110%). Plus Caveat-Warning wenn Avg auf <12 Monaten basiert.

## Build & Deploy

```bash
npm install                # einmalig
npm test                   # vitest run (260 grün)
npm run build              # esbuild → main.js (Repo-Root)
npm run dev                # esbuild --watch (sourcemap inline, kein minify)
npm run deploy             # build + cp manifest.json + main.js + styles.css → Vault
```

`npm run deploy` kopiert in das per Env-Variable gesetzte Ziel (PROF-OBS-02):

```bash
export OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/finance-ledger"
npm run deploy
```

## Plugin in Obsidian aktivieren

1. `npm run deploy` im Terminal ausführen
2. Obsidian → Settings → Community Plugins → „Safe mode" deaktivieren
3. „Finance Ledger" in der Plugin-Liste aktivieren
4. Ribbon-Icon (Pie-Chart) öffnet das Dashboard, oder Command Palette → „Open Ledger Viewer / Saldo Overview / Category Overview / TBC Triage / Finance Dashboard / Finance: Import CSV"

Bei Updates: `npm run deploy` → Plugin-Reload (Toggle off/on im Plugin-Entry oder `Cmd+R`).

## Konventionen

- Repo-Naming analog zum Importer: `26-011-finanzplan-plugin`
- **Plugin-ID** im Manifest: `finance-ledger` (deployed unter `.obsidian/plugins/finance-ledger/`; bis 2026-06-10: `finance`)
- Source-Code lebt im Habitat-Repo, Plugin-Install-Spot lebt im Vault — getrennt wegen git-Domains
- Pre/Post-Phase-Tags: `26-011-plugin-pre-<change>`, `26-011-plugin-post-<change>` (Slice-7 + Mobile-Readiness)
- Slice-Tag-Konvention ab Slice-8: `26-011-finanzplan-plugin-pre/post-slice-<n>-<phase>`

## Repo-Layout

| Pfad | Zweck |
|------|-------|
| `src/` | TypeScript-Sources (views, ui, parser, resolver, state, types, utils, aggregator, categorizer-rules) |
| `src/aggregator/openingBalances.ts` | Slice-8 Stand-Am-aware Mini-Parser |
| `src/aggregator/saldo.ts` | Slice-8 Stand-Am-aware computeSaldo |
| `tests/` | Vitest-Specs (676 Tests grün) |
| `docs/design/` | Canonical Design-System Source-of-Truth |
| `docs/design.md` | High-level Design-System-Erklärung |
| `styles.css` | Plugin-styles mit Tokens + Utilities |
| `manifest.json` | Obsidian-Plugin-Manifest (id: `finance-ledger`) |
| `main.js` | esbuild-Output (committed, da Obsidian-Plugin-Convention) |
| `package.json` | npm-Scripts |
| `esbuild.config.mjs` | Bundle-Config |
| `vitest.config.ts` | Test-Config |
| `tsconfig.json` | TypeScript-Config |

## Habitat-Docs

| File | Zweck |
|------|-------|
| `AGENTS.md` | Architektur-Konventionen für CC-Agenten |
| `CHANGELOG.md` | Release-Notes (Slice-3 bis Slice-9) |

## License

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE))
- **Dokumentation/Text:** CC BY-SA 4.0 ([`LICENSE-DOCS`](LICENSE-DOCS))

Copyright © 2026 Johannes Kaindl.
