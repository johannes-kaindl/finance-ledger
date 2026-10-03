# Changelog

Alle nennenswerten Änderungen am Finance-Ledger-Plugin. Format nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [0.3.1] — 2026-10-03

### Fixed

- **Store-CSS-Lint, zweiter Anlauf: die gepunktete Unterstreichung läuft jetzt über `border-bottom` statt über die Textdekoration.** Der Rescan von 0.3.0 meldete dasselbe Feature erneut — und zwar an **vier** Zeilen statt zwei, nämlich an den beiden Langformen, in die 0.3.0 den Shorthand zerlegt hatte. Gemessen (`web-features` + `@mdn/browser-compat-data`): Der Lint bewertet ein web-feature als Ganzes und meldet jede Verwendung, sobald **ein** Teilfeature als unvollständig geführt wird — hier die Linienstärke, die im Stylesheet nie gesetzt war. Das Zerlegen konnte deshalb nicht helfen, es hat die Meldung verdoppelt. Der Ersatz nutzt das Feature „borders", das kein unvollständiges Teilfeature trägt, plus `display: inline-block`, damit die Linie am Text endet statt über die volle Kartenbreite zu laufen. Die gepunktete Optik ist damit zurück, die 0.3.0 zugunsten einer durchgezogenen Linie aufgegeben hatte.

## [0.3.0] — 2026-10-03

### Changed

- **Der Importer-Subprozess ist weg — das Plugin lädt kein Node-Modul mehr.** Import-Dialog, Anti-Duplikat-Vorschau und Re-Import starten nicht mehr den Python-Importer; sie laufen im Plugin. Damit entfallen im Obsidian-Store-Review beide Behavior-Warnungen (`Shell Execution` über `child_process`, `Direct Filesystem Access` über Node-`fs`). Gemessen an den öffentlichen Scorecards: `medium`-Befunde drücken die Review-Note, Recommendations (`info`) kosten nichts — alle vier geprüften Store-Plugins mit `child_process` liegen auf `Caution` oder `Risks`.
- **Die Vorschau parst die gewählte Datei selbst** (`core/import/preview`), statt eine Temp-Kopie außerhalb des Vaults anzulegen. Die Kopie gab es nur, weil ein Python-Prozess einen Dateipfad braucht; der Inhalt liegt im `File`-Objekt des Dialogs ohnehin vor. Die gleichnamige Datei bleibt aus dem Duplikat-Vergleich: wer eine schon abgelegte CSV erneut wählt, soll ihren Inhalt sehen und nicht „alles Doppelungen".
- **Die Konto-Liste kommt aus `konten.yaml` im Vault** statt aus `list-konten` im Subprozess. Der Dialog braucht damit keinen Checkout des Importer-Repos mehr.
- **Keine Plattform-Sperren mehr:** Ribbon-Icon, Kommando, Dialog, Vorschau, Re-Import und die Dashboard-Schnellaktionen sind auf jeder Plattform verfügbar. Die Sperren hingen am Subprozess. ⚠️ Auf einem physischen Mobilgerät noch nicht nachgemessen.
- **CSS-Lint des Store-Reviews:** `ui-monospace` aus der Schrift-Fallback-Kette entfernt (von Obsidian 1.7.4 nicht unterstützt) und `text-decoration: underline dotted` in die Langformen `text-decoration-line`/`-style` zerlegt (Shorthand nur teilweise unterstützt).

### Added

- **Schnappschuss vor jedem Regel-Schreibvorgang**, aufbewahrt nach Großvater-Vater-Sohn: die sechs neuesten von heute, dazu je der älteste der letzten sieben Tage, vier Wochen und sechs Monate. Der Stand liegt als JSON unter `<Finanzordner>/.fl-snapshots/`; Dateien ohne Zeitstempel im Namen werden nie gelöscht. Die Auswahl ist eine pure Funktion (`core/snapshot/gfs-retention.ts`), ihre Golden-Tabelle gegen eine unabhängige Referenzrechnung geprüft.
- **Der kopierbare Importer-Befehl trägt jetzt die Umgebung und die Berichts-Flags.** Ohne `FINANCE_VAULT` schreibt der Importer in seinen eigenen Fallback-Ordner — mit Exit-Code 0. Da die Berichte und Dimensions-Notizen bis zum Abschluss der Port-Etappen E4–E7 nur im CLI entstehen, ist dieser Befehl der Weg dorthin.
- **Wächter gegen Node-Module im Bundle:** `tests/bundle.test.ts` prüft das gebaute `main.js` gegen die vollständige `builtinModules`-Liste, in beiden Ladeformen und mit Gegenprobe, dass das Suchmuster trifft.

### Removed

- **Das git-Auto-Backup vor dem Regel-Schreiben.** Es lief nie: der einzige Weg dorthin war ein `options.vaultPath`, das kein Produktiv-Aufrufer setzte — 111 Zeilen Code und neun grüne Tests für eine Sicherung, die im Produkt nicht stattfand. Ersatz ist der Schnappschuss über die Vault-API, der tatsächlich läuft.
- Die Einstellungen **Importer-Timeout** und **Pfad zur uv-Binary**. Beide gehörten zum Subprozess. **Importer-Repo-Pfad** bleibt — er speist den kopierbaren Befehl; eine Existenzprüfung des Pfades findet nicht mehr statt (sie wäre Node-Zugriff für eine Anzeige).

## [0.2.2] — 2026-10-02

### Fixed

- Store review of 0.2.1: `styles.css` carried a stray `` `.trim(); `` line after the hub styles (CSS lint error). Removed.
- Store review of 0.2.1: the CSV preview's temporary-copy helper loaded `fs/promises`, `os` and `path` without a `Platform.isDesktop` guard; the scanner reported the three dynamic imports as warnings. The helper now exits early on mobile like the importer and the git backup already do.
- Store review of 0.2.1: the build no longer depends on the `builtin-modules` package; the list of Node built-ins comes from `node:module`. The bundle is unchanged.

## [0.2.1] — 2026-10-02

### Added

- The GitHub release now also carries a ready-to-unpack `finance-ledger.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

## [0.2.0] — 2026-09-26

### Added

- **Hilfe-Zeile oben in den Einstellungen** mit Links auf die Dokumentation und den Issue-Tracker (Kit `help-setting`, `obsidian-kit` 0.43.0).

### Changed

- **Einstellungen-Tab auf `getSettingDefinitions()` umgestellt** (`kit-obsidian/settings_walker.ts`,
  obsidian-kit@0.37.1 vendoriert). Ab Obsidian 1.13 erscheinen alle Felder jetzt in der
  Settings-Suche — vorher fand `eslint-plugin-obsidianmd` das als echten Fähigkeitsmangel, nicht
  nur als Konventionsbefund. Live-Vorschau und Farbschema-Kacheln bleiben als native
  `render`-Hatches erhalten (Teil der deklarativen API seit 1.13.0, keine Abweichung). Sichtbare
  Folge: die Abschnitte zeigen jetzt native Trennlinien zwischen den Zeilen (`docs/images/settings.png`
  neu aufgenommen).
- `SettingsAccessor`/`Accessor` (`main.ts`) bekommen ein synchrones `getData()` — Obsidian ruft
  `getSettingDefinitions()` ohne await auf, ein Reload von `data.json` je Tab-Öffnen war ohnehin
  nur historisch (die Einstellungen liegen seit `onload()` bereits im Speicher).

## [0.1.1] — 2026-09-03

### Fixed

- **Einstellungen-Tab rendert beim zweiten Öffnen alles doppelt.** `display()` leerte den
  Container synchron, rendert aber asynchron nach dem Laden der Einstellungen — ruft Obsidian
  `display()` beim Öffnen mehrfach, schrieben beide Durchgänge hinein (8 Abschnitte statt 4).
  Beim allerersten Öffnen war der Fehler unsichtbar. Behoben über einen Render-Zähler; gegen ein
  laufendes Obsidian gegengeprüft.
- **Mehrzeilige Hinweistexte in generierten Vertrags-Notizen brachen aus ihrem Callout aus.**
  `note_extra_warning` und `rolle_beschreibung` wurden mit nur einem `> ` ins Template gesetzt,
  wodurch alles ab der zweiten Zeile als nackter Text neben dem Callout stand. Behoben mit dem
  Wechsel auf die Kit-Fassung von `wrapCallout` (obsidian-kit 0.27.0), zwei Regressionstests.

### Changed

- **README ist jetzt englisch-kanonisch**, die deutsche Fassung liegt als `README.de.md`
  daneben (beide mit Sprachumschalter). Dazu ein sechstes Bild, das den Einstellungen-Tab zeigt.
- **Vier Module aus `obsidian-kit` 0.27.0 vendoriert** (`callout`, `sha256`, `clipboard`, `hub`)
  statt lokaler Nachbauten; drei ältere Pins nachgezogen. Kein Verhaltensunterschied außer den
  oben genannten Fixes.


## [0.1.0] — 2026-08-20

Erstes veröffentlichtes Release. Bündelt die gesamte Vor-Release-Entwicklung
(Slices 1–10, F15 Design-Wiring, F1/F2, Hub-Migration und den eingebauten
CSV-Import) zu einer konsolidierten Erstversion.

### Added

- **Finance-Hub** (`FinanceHubView`) — EINE View mit Tab-Leiste statt fünf
  Einzel-Views; mount-once-Panels (Filter/Scroll überleben Tab-Wechsel),
  Panel-Navigation über late-bound Callback.
- **Eingebauter CSV-Import** — vollständiger TypeScript-Port des Importer-Kerns
  (CSV-Parser CAMT52/Visa, Kategorisierung, Journal-/Accounts-/Opening-Balances-
  Schreiber), mobile-fähig ohne Node-APIs; Geld-Arithmetik über decimal.js mit
  kaufmännischer Rundung; per Parity-Check byte-gleich zur Python-Referenz gehalten.
- **Stammdaten-Schreiben** — Konto- und Vertrags-Notizen mit Marker-Idempotenz
  und chirurgischem Zeilen-Patch: User-Felder (`anfangssaldo_eur`, `created`,
  eigene Abschnitte) überleben jeden Import-Lauf.
- **i18n DE/EN** — folgt automatisch Obsidians Spracheinstellung
  (`getLanguage()`); EN kanonisch, DE vollständig.
- **Vorzeichen- und Farbdarstellung** (F1) — `formatMoneyAmount` mit
  konfigurierbaren Farbschemata über Theme-Variablen, Settings-Tab mit
  Dropdowns und Farb-Swatches.
- **Konto-Auto-Detect im Import-Modal** — Zuordnung CSV-Datei → Konto über
  Ziffernvergleich (führende Nullen, maskierte Kartennummern), Format-Diagnose
  mit verständlichen Hinweisen statt Traceback.
- **Ledger Viewer** (`LedgerView`) — filter- und sortierbare Buchungstabelle mit
  Klick-Navigation und Summen-Footer; hledger-Subset-Parser + Account-Resolver
  (Frontmatter-Crawl auf `ledger_account`).
- **Saldo-Übersicht** (`SaldoOverviewView`) mit `aggregateAccountSaldos` und
  Stand-Am-aware Saldo-Berechnung (`opening_balances.ledger`): „Stand-Am"-Spalte
  und TBC-Marker für Konten ohne erfassten Anfangssaldo.
- **Kategorie-Übersicht** (`CategoryOverviewView`) mit hierarchischem
  `aggregateCategoryTotals` (Modi Ausgaben/Einnahmen/Alle, Anteil-%).
- **TBC-Triage** (`TBCTriageView`) + Categorizer-Rule-Modal mit Live-Conflict-Check
  und Match-Counter; Rule-Loader/Writer (Vault-Notes als Source-of-Truth);
  Account-Suggestions via Datalist-Type-Ahead; Git-Auto-Commit-Backup vor jedem
  Schreibzugriff (Lock-Retry + Detached-Head-Erkennung).
- **Re-Import** — Importer-CLI-Subprocess-Spawn mit UI-Lock, Counter-Reset und
  konfigurierbarem `uv`-Pfad (Auto-Detect-Fallback).
- **CSV-Import-Modal** (`ImportCSVModal`) — Multi-File-Picker, Anti-Dup-Preview,
  Konto-Mapping per IBAN-Suffix.
- **Finance-Dashboard** (`FinanceDashboardView`) — fünf Cards (Saldo, Last
  Activity, Quick-Navigation, Quick-Actions, Top-Kategorien) + Ribbon-Icon.
- **Filter-Presets** — Filter-State-Persistenz und Preset-CRUD; Deep-Link
  `obsidian://finance?mode=…&filter=…` (`applyStoredState`) zur externen Steuerung.
- **Mobile-Readiness** — `Platform.isMobile`-Guards, Graceful-Degrade für
  Desktop-only-Features, `manifest.json` mit `isDesktopOnly: false`.
- **Design-System** — KSP-Signal-Palette + Finance-Tokens + Light-Mode-Bridge in
  `styles.css` (`--fl-*`), Utility- und Komponenten-Klassen (`.fl-money`,
  `.fl-acct-chip`, `.fl-txn-state`, `.fl-card` sowie View-Struktur-Klassen);
  `docs/design/` als Token-Source-of-Truth, `docs/design.md` als Architektur-Doku.
- **Tolerantes Output-Lesen** — Plugin liest erweiterte Importer-Output-Schemas
  (Tx-Typ-/Mandate-/Lebensbereich-Notes, Detail-Page-Wikilinks) ohne Code-Änderung.

### Changed

- Plugin-ID schrittweise auf `finance-ledger` umbenannt (zuvor `26-011-finanzplan`
  → `finance`); manifest + Deploy-Ziel. Die ID ist nach Community-Submission permanent.
- URI-Query-Param `action` → `mode` (`action` ist von der Obsidian-API reserviert).
- Styling vollständig klassenbasiert in `styles.css` ausgelagert (keine Inline-Styles
  mehr) — konform zur Obsidian-Plugin-Guideline.

### Fixed

- Mobile-Load: Top-Level-`node:`-Imports in dynamische, Desktop-geguardete Imports
  umgewandelt (verhinderte Plugin-Load-Failure auf Mobile).
- Modal-Slug-Pre-Check vor Submit (vermeidet späten `file already exists`-Fehler).
- TBC-Filter differenziert nach `existing-rule-match` (keine Pseudo-TBC-Gegenparteien).
- `uv`-Binary-Pfad-Setting + Auto-Detect-Fallback (behebt `ENOENT` im macOS-Renderer-PATH).
- Mobile-SVG-Icon-Härtung (`fill: currentColor` + explizites `display`) gegen
  Icon-Platzhalter auf iOS.
