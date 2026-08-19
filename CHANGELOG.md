# Changelog

Alle nennenswerten Änderungen am Finance-Ledger-Plugin. Format nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

_Noch keine Änderungen seit dem letzten Release._

## [0.1.0] — 2026-05-11

Erstes veröffentlichtes Release. Bündelt die gesamte Vor-Release-Entwicklung
(Slices 1–10 + F15 Design-Wiring) zu einer konsolidierten Erstversion.

### Added

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
