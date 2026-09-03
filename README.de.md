# Finance Ledger

> [🇬🇧 English](README.md) · 🇩🇪 Deutsch

Obsidian-Plugin, das hledger-Journale als filterbare Tabellen mit Saldo- und
Kategorie-Dashboards, Transaktions-Triage und Categorizer-Rule-Verwaltung rendert —
gespeist von einem begleitenden Python-Importer.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/finance-ledger?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/finance-ledger/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%20%7C%20Desktop%2BMobile-lightgrey)

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/hero.png" width="640" alt="Obsidian mit geöffneter Konto-Notiz links und dem Finance-Hub rechts: eine filterbare Buchungstabelle mit Datum, Empfänger, Konto-Chips, Beträgen und Tags.">

> Plugin-ID: `finance-ledger` (bis 2026-06-10: `finance`).

## Status

**Stand 2026-08-17 — Importer-Port, Etappen E0–E3:** Der eingebaute Import erzeugt
`journal.ledger`, `accounts.ledger`, `opening_balances.ledger` **und** die Konto- und
Vertrags-Notizen — ohne Python. Dabei fasst er nur an, was er selbst erzeugt hat:
`anfangssaldo_eur`, `created`, fremde Frontmatter-Felder und alles unterhalb des
`AUTO-GENERATED`-Markers überleben jeden Lauf. Belegt durch `npm run smoke:gui` gegen ein
laufendes Obsidian (21/21; Gegenprobe mit ausgebautem Patch-Pfad 15/20). Berichte und
Dimensions-Notizen (E4–E7) laufen weiterhin über den Importer-Subprozess.

**Davor, Stand 2026-08-04 — Etappen E0+E1:** Der CSV-Import läuft **im Plugin selbst**
(TypeScript, ohne Python-Subprozess). Belegt per Byte-Vergleich gegen den Python-Importer
über echte Daten: `journal.ledger` identisch (1.576 Buchungen, 12 CSVs). Wiederholbar mit
`npm run parity`.

**Stand 2026-06-10 (nach Phase 1 des Publikations-Tracks):** Slices 1–10 und das
F15-Design-System gemergt. Mobile-Readiness (`Platform.isMobile`-Guards) und Design-System
(KSP-Palette + Finance-Tokens + Light-Mode) integriert.

**Slice-10 Detail-Pages-Layer:** Der Importer schreibt 7 zusätzliche Wikilink-Achsen, 2 neue
Notizklassen (Transaktionstypen + Mandate) und eine Lebensbereich-Schicht in den Vault.
Plugin-Code unverändert (tolerant gegen erweiterte Notizschemas).

**Tests:** 682 grün. **Bundle-Größe:** ~165 kB (`main.js`).

## Funktionen

### Ansichten

- **Ledger Viewer** — sortier- und filterbare Tabelle aller Buchungen aus `journal.ledger`,
  mit Klick-Navigation zu Kategorie-, Konto- und Empfänger-Notizen
- **Saldo-Übersicht** — **Stand-Am-aware**: zeigt `Anfangssaldo (Stand-Am pro Konto) +
  Buchungen nach diesem Datum`. Buchungen vor dem Stand-Am werden gefiltert, damit der
  Bootstrap-Ablauf nichts doppelt zählt. Konten ohne `anfangssaldo_eur:` bekommen einen
  TBC-Marker.
- **Kategorie-Übersicht** — hierarchisches Aggregat aller Kategorien mit Anteil in Prozent
- **TBC-Triage** — alle `:tbc:`-Buchungen mit einer Ein-Klick-Aktion: *Konto zuweisen,
  Categorizer-Regel speichern, Tag entfernen*
- **Finance-Dashboard** — Fünf-Karten-Übersicht (Saldi, TBC-Rückstand, Wiederkehrendes,
  größte Ausgabenkategorien, Vertrags-Auflauf)

### Aktionen

- **Journal aus CSVs neu aufbauen (eingebaut)** — Befehl, der `journal.ledger` und
  `accounts.ledger` direkt im Plugin erzeugt: kein Python, kein `uv`, kein Subprozess. Läuft
  auch mobil. Die Konten-Konfiguration kommt aus einer `konten.yaml` im Vault (Einstellung
  „Konten-Datei").
- **CSV-Import-Modal** (nur Desktop) — mehrere CSVs hochladen, gegen vorhandene Importe
  dedupen, anschließend den Importer-Subprozess auslösen
- **Re-Import** — startet den Python-Importer als Subprozess, mit UI-Sperre und Counter-Reset
- **Git-Auto-Backup** — Commit vor dem Schreiben, mit Lock-Retry und Detached-Head-Erkennung
- **Categorizer-Rule-Modal** — neue Pattern-Regel definieren, mit Live-Trefferzähler und
  Konflikt-Prüfung; schreibt nach `categorizer-rules/`
- **Konto-Vorschläge** — Type-Ahead aus `accounts.ledger` plus Frontmatter-Crawl, dedupliziert
- **Deep-Link-URI** — `obsidian://finance?mode=ledger&filter=…` zur Filter-Steuerung von außen

### So sieht das aus

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/dashboard.png" width="640" alt="Dashboard-Reiter mit Karten für Kontostände, letzte Aktivität, Schnellnavigation, Schnellaktionen und den größten Ausgabenkategorien des laufenden Monats.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/balances.png" width="640" alt="Balances-Reiter: je Konto Anfangssaldo mit Stichtag, Bewegung seit dem Stichtag und aktueller Stand.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/categories.png" width="640" alt="Categories-Reiter: Ausgabenkategorien als Hierarchie mit Betrag und Anteil in Prozent.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/triage.png" width="640" alt="To-classify-Reiter: vier noch nicht zugeordnete Buchungen mit Betrag und je einem Classify-Knopf, darunter die Summenzeile.">

## Wie es funktioniert

Das Plugin **rechnet nicht selbst aus Rohdaten** — es liest das hledger-Journal, das der
Importer geschrieben hat, und macht daraus Ansichten. Die eine Stelle, an der es doch
rechnet, ist der Kontostand:

### Stand-Am-aware Saldo-Logik

Das Plugin parst `opening_balances.ledger` mit einem kleinen eigenen Parser
(`src/aggregator/openingBalances.ts`):

```typescript
parseOpeningBalances(text: string): Map<account, {amount, standAm}>
```

`computeSaldo(account)` = `opening.amount + Summe(tx mit tx.date > opening.standAm)`.

Bootstrap-Ablauf: Du trägst den aktuellen Bank-Saldo und das heutige Datum ins Frontmatter
der Konto-Notiz ein (`anfangssaldo_eur` + `anfangssaldo_stand_am`). Der Importer schreibt
daraus `opening_balances.ledger`. Das Plugin filtert dann die Buchungen vor dem Stand-Am.

## Voraussetzungen

- **Obsidian 1.8.7 oder neuer**, Desktop und Mobile (`isDesktopOnly: false`).
- Ein **hledger-Journal im Vault** — `journal.ledger`, `accounts.ledger` und optional
  `opening_balances.ledger`. Ohne Journal zeigen die Ansichten nichts an.
- Für den **eingebauten** Journal-Aufbau aus CSVs: eine `konten.yaml` im Vault. Kein Python,
  kein `uv` — dieser Weg läuft auch mobil.
- Nur für den **Re-Import über das Begleit-Repo** (Berichte und Notiz-Generatoren): Desktop,
  `uv` und ein Checkout des Python-Importers.

## Installation

Dieses Plugin wird **nicht über den Community-Store verteilt**. Es liegt auf einer eigenen Forge,
und es führen zwei Wege hin.

**Empfohlen — über den [AnySource Sideloader](https://git.jkaindl.de/jkaindl/anysource-sideloader)**,
der Plugins von jeder git-Forge installiert und aktualisiert. Einmalig diesen Katalog abonnieren:

```
https://git.jkaindl.de/jkaindl/obsidian-plugin-catalog/raw/branch/main/catalog.json
```

Finance Ledger taucht danach in der Plugin-Liste des Sideloaders auf und aktualisiert sich wie
jedes andere Plugin — ohne Kopiererei, und jeder Download wird per Prüfsumme verifiziert.

**Von Hand**, wenn kein weiteres Plugin dazukommen soll:

1. `main.js`, `manifest.json` und `styles.css` aus dem
   [neuesten Release](https://git.jkaindl.de/jkaindl/finance-ledger/releases) herunterladen.
2. Nach `<vault>/.obsidian/plugins/finance-ledger/` kopieren.
3. Obsidian → Einstellungen → Community-Plugins → **Finance Ledger** aktivieren.

Updates müssen dann von Hand wiederholt werden — genau dafür gibt es den Sideloader-Weg.

Aus dem Quelltext: `npm install && npm run build` erzeugt dieselben Dateien; `npm run deploy`
legt sie direkt in ein konfiguriertes Vault (siehe *Bauen und ausliefern*).

## Verwendung

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

## Konfiguration

Einstellungen → Community-Plugins → **Finance Ledger**:

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/settings.png" width="820" alt="Die Plugin-Einstellungen: der Abschnitt „Amount display" mit Live-Vorschau (Einnahmen grün, Ausgaben rot), das Auswahlfeld für die Vorzeichen-Konvention und drei Farbschema-Kacheln (Classic ausgewählt, Monochrome, Inverted), darunter der Vault-Pfad zum Finanzprojekt-Ordner.">

- **Betragsdarstellung**: Vorzeichen-Modus (*intuitiv*: Einnahmen +, Ausgaben − ·
  *buchhalterisch*: roh nach hledger) plus Farbschema (klassisch / monochrom / invertiert)
  als Swatch-Kacheln mit Live-Vorschau. Der Fluss folgt der Einstellung, Saldi bleiben
  vorzeichen-basiert; die Farbe hängt am Konto-Typ und ist orthogonal zum Vorzeichen.
- Vault-relative Pfade zu Ledger, Konten, Verträgen und Categorizer-Rules
- `uv`-Binary-Pfad mit Auto-Detect-Fallback
- Filter-Presets (anlegen, ändern, löschen — lokal gespeichert)

## Design-System

Das Plugin nutzt drei Schichten:

- **Obsidian-CSS-Variablen** für Layout, Typografie, Rahmen und Flächen (theme-agnostisch)
- **`--fl-*`-Tokens** für finanz-spezifische Semantik (Credit-/Debit-/TBC-Farben,
  Konto-Typ-Akzente, Geld-Darstellung, Karten-Oberkanten)
- die **KSP-Signal-Palette** als Fundament der `--fl-*`-Tokens, mit Light-Mode-Korrekturen
  für AA-Kontrast

Verdrahtet in fünf Ansichten — Saldo-Übersicht, Finance-Dashboard, Ledger-View, TBC-Triage
und Kategorie-Übersicht. Geldwerte tragen `.fl-money` plus Vorzeichenfarbe, Konto-Chips eine
`data-type`-Outline, Karten eine `data-card`-Oberkante, Status-Punkte `.fl-txn-state`. Die
Light-Mode-Brücke dimmt die Signalfarben für AA-Kontrast.

Ausführliche Doku: [`docs/design.md`](docs/design.md) (Überblick und Verdrahtungsstand) und
[`docs/design/README.md`](docs/design/README.md) (kanonische Token-Dateien).

## Mobile-Status

- **Nur-Desktop-Pfade:** CSV-Import-Modal und Re-Import-Subprozess. Mobil erscheint ein
  entsprechender Hinweis.
- **Mobil ist Read-Only:** Ansichten rendern, aber es gibt keine Subprozess- oder
  Git-Aktionen.
- **Mobile Icons:** Auf iPhone und iPad sind nach dem letzten Icon-Fix teils noch Platzhalter
  sichtbar — die Diagnose steht am Desktop mit Mobile-DevTools aus.

## Der begleitende Importer

Der Python-CLI-Importer, der das Journal erzeugt, ist ein eigenes Projekt und **noch nicht
veröffentlicht**. Seine Ausgabe im Vault liegt unter `<vault>/<financeRoot>/Ledger/` plus den
Notiz-Ordnern `10-Konten`, `20-Verträge`, `30-Sparziele`, `40-Monatsberichte`,
`45-Kategorien`, `55-Categorizer-Rules`, `60-Empfänger`, `70-Quartalsberichte`,
`80-Jahresberichte` und `05-Bases`.

Alles, was das Plugin darüber hinaus braucht — den eingebauten Aufbau aus CSVs — macht es
selbst.

### Notiz-Schema der Ausgabe (Marker-System)

Alle vom Importer geschriebenen Notizen (Konto, Bericht, Kategorie, Empfänger, Regel) nutzen
ein Marker-Muster, das Nutzer-Änderungen schützt:

```
---
Frontmatter
---
<vom Nutzer editierbarer Kopf>

<!-- BEGIN: AUTO-GENERATED -->
Auto-Abschnitt (Tabellen, Mermaid-Charts, Bases-Embeds, Verweise)
<!-- END: AUTO-GENERATED -->

## 📌 Notizen
Nutzer-Zone — bleibt bei jedem erneuten Lauf unangetastet.
```

Dazu: Mermaid-Charts (Pie für Top-Kategorien, Bar und xy-Line für Trends) und
zusammenklappbare Bases-Embeds in `[!quote]`-Callouts.

### Budget-Schicht

Monatsberichte tragen einen Budget-Abschnitt: Soll (12-Monats-Mittel) / Ist / Prognose
(lineare Hochrechnung) / Differenz / Ampel (🟢 unter 90 % vom Soll, 🟡 90–110 %, 🔴 über
110 %). Ein Vorbehalt erscheint, wenn das Mittel auf weniger als 12 Monaten beruht.

## Bauen und ausliefern

```bash
npm install                # einmalig
npm test                   # vitest run (682 grün)
npm run build              # esbuild → main.js (Repo-Root)
npm run dev                # esbuild --watch (Sourcemap inline, kein Minify)
npm run deploy             # build + manifest.json, main.js, styles.css ins Vault kopieren
```

`npm run deploy` kopiert in das per Umgebungsvariable gesetzte Ziel:

```bash
export OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/finance-ledger"
npm run deploy
```

Danach in Obsidian: Einstellungen → Community-Plugins → Safe Mode aus → **Finance Ledger**
aktivieren. Bei Updates erneut `npm run deploy` und das Plugin neu laden (aus- und
einschalten oder `Cmd+R`).

## Repo-Layout

| Pfad | Zweck |
|------|-------|
| `src/` | TypeScript-Quellen (Views, UI, Parser, Resolver, State, Types, Utils, Aggregator, Categorizer-Rules) |
| `src/aggregator/openingBalances.ts` | Stand-Am-aware Parser für `opening_balances.ledger` |
| `src/aggregator/saldo.ts` | Stand-Am-aware `computeSaldo` |
| `tests/` | Vitest-Specs (682 Tests grün) |
| `docs/design/` | kanonische Quelle des Design-Systems |
| `docs/design.md` | Überblick über das Design-System |
| `styles.css` | Plugin-Styles mit Tokens und Utilities |
| `manifest.json` | Obsidian-Plugin-Manifest (id: `finance-ledger`) |
| `main.js` | esbuild-Ausgabe (committet, wie bei Obsidian-Plugins üblich) |
| `package.json` | npm-Scripts |
| `esbuild.config.mjs` | Bundle-Konfiguration |
| `vitest.config.ts` | Test-Konfiguration |
| `tsconfig.json` | TypeScript-Konfiguration |
| `AGENTS.md` | Architektur-Konventionen für Coding-Agenten |
| `CHANGELOG.md` | Release-Notes |

## Lizenz

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE))
- **Dokumentation und Text:** CC BY-SA 4.0 ([`LICENSE-DOCS`](LICENSE-DOCS))

Copyright © 2026 Johannes Kaindl.
