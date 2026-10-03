# Changelog

All notable changes to the Finance Ledger plugin. Format after
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning after
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The changelog is now written entirely in English.
- Internal design notes moved out of the repository; the user documentation is unchanged.

## [0.3.1] — 2026-10-03

### Fixed

- **Store CSS lint, second attempt: the dotted underline now runs through `border-bottom` instead of the text decoration.** The rescan of 0.3.0 reported the same feature again — and on **four** lines instead of two, namely the two longhands into which 0.3.0 had split the shorthand. Measured (`web-features` + `@mdn/browser-compat-data`): the lint rates a web feature as a whole and reports every use as soon as **one** sub-feature is listed as incomplete — here the line thickness, which was never set in the stylesheet. Splitting it up could therefore not help; it doubled the report. The replacement uses the "borders" feature, which carries no incomplete sub-feature, plus `display: inline-block`, so the line ends at the text instead of running across the full card width. The dotted look is back, which 0.3.0 had given up in favour of a solid line.

## [0.3.0] — 2026-10-03

### Changed

- **The importer subprocess is gone — the plugin no longer loads any Node module.** The import dialog, the duplicate-check preview and re-import no longer start the Python importer; they run inside the plugin. This removes both behavior warnings from the Obsidian store review (`Shell Execution` via `child_process`, `Direct Filesystem Access` via Node `fs`). Measured against the public scorecards: `medium` findings pull down the review grade, recommendations (`info`) cost nothing — all four store plugins with `child_process` that were checked sit at `Caution` or `Risks`.
- **The preview parses the chosen file itself** (`core/import/preview`) instead of creating a temporary copy outside the vault. The copy only existed because a Python process needs a file path; the content is already available in the dialog's `File` object. A file of the same name stays out of the duplicate comparison: anyone who picks an already stored CSV again should see its content and not "everything is a duplicate".
- **The account list comes from `konten.yaml` in the vault** instead of from `list-konten` in the subprocess. The dialog therefore no longer needs a checkout of the importer repo.
- **No more platform locks:** ribbon icon, command, dialog, preview, re-import and the dashboard quick actions are available on every platform. The locks hung on the subprocess. ⚠️ Not yet measured on a physical mobile device.
- **Store review CSS lint:** `ui-monospace` removed from the font fallback chain (not supported by Obsidian 1.7.4) and `text-decoration: underline dotted` split into the longhands `text-decoration-line`/`-style` (shorthand only partially supported).

### Added

- **Snapshot before every rule write**, kept by grandfather-father-son: the six newest of today, plus the oldest of each of the last seven days, four weeks and six months. The state is stored as JSON under `<finance folder>/.fl-snapshots/`; files without a timestamp in their name are never deleted. The selection is a pure function (`core/snapshot/gfs-retention.ts`), its golden table checked against an independent reference calculation.
- **The copyable importer command now carries the environment and the report flags.** Without `FINANCE_VAULT` the importer writes into its own fallback folder — with exit code 0. Since the reports and dimension notes are only produced in the CLI until the port stages E4–E7 are finished, this command is the way there.
- **Guard against Node modules in the bundle:** `tests/bundle.test.ts` checks the built `main.js` against the complete `builtinModules` list, in both loading forms and with a control check that the search pattern matches.

### Removed

- **The git auto-backup before rule writes.** It never ran: the only way to it was an `options.vaultPath` that no production caller set — 111 lines of code and nine green tests for a backup that did not take place in the product. The replacement is the snapshot through the vault API, which actually runs.
- The settings **Importer timeout** and **Path to the uv binary**. Both belonged to the subprocess. **Importer repo path** stays — it feeds the copyable command; an existence check of the path no longer takes place (it would be Node access for a display).

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

- **Help row at the top of the settings** with links to the documentation and the issue tracker (kit `help-setting`, `obsidian-kit` 0.43.0).

### Changed

- **Settings tab switched to `getSettingDefinitions()`** (`kit-obsidian/settings_walker.ts`,
  obsidian-kit@0.37.1 vendored). From Obsidian 1.13 on, all fields now appear in the
  settings search — before, `eslint-plugin-obsidianmd` flagged this as a real capability gap, not
  just a convention finding. Live preview and color-scheme tiles stay as native
  `render` hatches (part of the declarative API since 1.13.0, not a deviation). Visible
  consequence: the sections now show native separator lines between the rows (`docs/images/settings.png`
  re-recorded).
- `SettingsAccessor`/`Accessor` (`main.ts`) gain a synchronous `getData()` — Obsidian calls
  `getSettingDefinitions()` without await; reloading `data.json` on every tab open was only
  historical anyway (the settings have been in memory since `onload()`).

## [0.1.1] — 2026-09-03

### Fixed

- **Settings tab renders everything twice on the second open.** `display()` emptied the
  container synchronously but renders asynchronously after loading the settings — if Obsidian
  calls `display()` several times on open, both passes wrote into it (8 sections instead of 4).
  On the very first open the bug was invisible. Fixed with a render counter; checked against a
  running Obsidian.
- **Multi-line hint texts in generated contract notes broke out of their callout.**
  `note_extra_warning` and `rolle_beschreibung` were put into the template with only one `> `,
  so everything from the second line on stood as bare text next to the callout. Fixed by
  switching to the kit version of `wrapCallout` (obsidian-kit 0.27.0), two regression tests.

### Changed

- **The README is now English-canonical**, the German version sits next to it as `README.de.md`
  (both with a language switcher). Plus a sixth image showing the settings tab.
- **Four modules from `obsidian-kit` 0.27.0 vendored** (`callout`, `sha256`, `clipboard`, `hub`)
  instead of local re-implementations; three older pins updated. No behavior difference apart from the
  fixes above.


## [0.1.0] — 2026-08-20

First published release. Bundles the entire pre-release development
(slices 1–10, F15 design wiring, F1/F2, hub migration and the built-in
CSV import) into one consolidated first version.

### Added

- **Finance hub** (`FinanceHubView`) — ONE view with a tab bar instead of five
  single views; mount-once panels (filter/scroll survive tab switches),
  panel navigation via a late-bound callback.
- **Built-in CSV import** — complete TypeScript port of the importer core
  (CSV parser CAMT52/Visa, categorization, journal/accounts/opening-balances
  writers), mobile-capable without Node APIs; money arithmetic via decimal.js with
  commercial rounding; kept byte-identical to the Python reference by a parity check.
- **Master-data writing** — account and contract notes with marker idempotency
  and surgical line patching: user fields (`anfangssaldo_eur`, `created`,
  own sections) survive every import run.
- **i18n DE/EN** — automatically follows Obsidian's language setting
  (`getLanguage()`); EN canonical, DE complete.
- **Sign and color display** (F1) — `formatMoneyAmount` with
  configurable color schemes via theme variables, settings tab with
  dropdowns and color swatches.
- **Account auto-detect in the import modal** — mapping CSV file → account via
  digit comparison (leading zeros, masked card numbers), format diagnosis
  with understandable hints instead of a traceback.
- **Ledger viewer** (`LedgerView`) — filterable and sortable transaction table with
  click navigation and totals footer; hledger subset parser + account resolver
  (frontmatter crawl on `ledger_account`).
- **Balance overview** (`SaldoOverviewView`) with `aggregateAccountSaldos` and
  as-of-aware balance calculation (`opening_balances.ledger`): "as-of" column
  and TBC marker for accounts without a recorded opening balance.
- **Category overview** (`CategoryOverviewView`) with hierarchical
  `aggregateCategoryTotals` (modes expenses/income/all, share %).
- **TBC triage** (`TBCTriageView`) + categorizer rule modal with live conflict check
  and match counter; rule loader/writer (vault notes as source of truth);
  account suggestions via datalist type-ahead; git auto-commit backup before every
  write access (lock retry + detached-HEAD detection).
- **Re-import** — importer CLI subprocess spawn with UI lock, counter reset and
  configurable `uv` path (auto-detect fallback).
- **CSV import modal** (`ImportCSVModal`) — multi-file picker, anti-dup preview,
  account mapping by IBAN suffix.
- **Finance dashboard** (`FinanceDashboardView`) — five cards (balance, last
  activity, quick navigation, quick actions, top categories) + ribbon icon.
- **Filter presets** — filter-state persistence and preset CRUD; deep link
  `obsidian://finance?mode=…&filter=…` (`applyStoredState`) for external control.
- **Mobile readiness** — `Platform.isMobile` guards, graceful degrade for
  desktop-only features, `manifest.json` with `isDesktopOnly: false`.
- **Design system** — KSP signal palette + finance tokens + light-mode bridge in
  `styles.css` (`--fl-*`), utility and component classes (`.fl-money`,
  `.fl-acct-chip`, `.fl-txn-state`, `.fl-card` as well as view structure classes);
  `docs/design/` as token source of truth, `docs/design.md` as architecture doc.
- **Tolerant output reading** — the plugin reads extended importer output schemas
  (tx-type/mandate/life-area notes, detail-page wikilinks) without code changes.

### Changed

- Plugin ID gradually renamed to `finance-ledger` (formerly `26-011-finanzplan`
  → `finance`); manifest + deploy target. The ID is permanent after community submission.
- URI query param `action` → `mode` (`action` is reserved by the Obsidian API).
- Styling fully moved into class-based `styles.css` (no inline styles
  anymore) — conforms to the Obsidian plugin guideline.

### Fixed

- Mobile load: top-level `node:` imports converted to dynamic, desktop-guarded imports
  (prevented plugin load failure on mobile).
- Modal slug pre-check before submit (avoids a late `file already exists` error).
- TBC filter differentiates by `existing-rule-match` (no pseudo-TBC counterparties).
- `uv` binary path setting + auto-detect fallback (fixes `ENOENT` in the macOS renderer PATH).
- Mobile SVG icon hardening (`fill: currentColor` + explicit `display`) against
  icon placeholders on iOS.
