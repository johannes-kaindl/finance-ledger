# Finance Ledger

> 🇬🇧 English · [🇩🇪 Deutsch](README.de.md)

An Obsidian plugin that renders hledger journals as filterable tables with balance and
category dashboards, transaction triage and categorizer-rule management — fed by a
companion Python importer.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/finance-ledger?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/finance-ledger/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%20%7C%20Desktop%2BMobile-lightgrey)

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/hero.png" width="640" alt="Obsidian with an account note open on the left and the Finance hub on the right: a filterable transaction table with date, payee, account chips, amounts and tags.">

> Plugin ID: `finance-ledger` (until 2026-06-10: `finance`).

## Status

**As of 2026-08-17 — importer port, stages E0–E3:** the built-in import now writes
`journal.ledger`, `accounts.ledger`, `opening_balances.ledger` **and** the account and
contract notes — without Python. It only touches what it produced itself: `anfangssaldo_eur`,
`created`, foreign frontmatter fields and everything below the `AUTO-GENERATED` marker
survive every run. Verified by `npm run smoke:gui` against a running Obsidian (21/21;
control run with the patch path removed: 15/20). Reports and dimension notes (E4–E7) still
go through the importer subprocess.

**Before that, as of 2026-08-04 — stages E0+E1:** CSV import runs **inside the plugin
itself** (TypeScript, no Python subprocess). Verified byte-for-byte against the Python
importer on real data: `journal.ledger` identical (1,576 transactions, 12 CSVs).
Reproducible with `npm run parity`.

**As of 2026-06-10 (post phase 1 of the publication track):** slices 1–10 plus the F15
design system merged. Mobile readiness (`Platform.isMobile` guards) and the design system
(KSP palette + finance tokens + light mode) integrated.

**Slice-10 detail-pages layer:** the importer writes 7 additional wikilink axes, 2 new note
classes (transaction types + mandates) and a life-area layer into the vault. Plugin code
unchanged (tolerant of extended note schemas).

**Tests:** 682 green. **Bundle size:** ~165 kB (`main.js`).

## Features

### Views

- **Ledger viewer** — sortable and filterable table of every transaction in `journal.ledger`,
  with click-through navigation to category, account and payee notes
- **Balance overview** — **as-of-aware**: shows `opening balance (as-of date per account) +
  transactions after that date`. Transactions before the as-of date are filtered out, so the
  bootstrap workflow never double-counts. Accounts without `anfangssaldo_eur:` get a TBC marker.
- **Category overview** — hierarchical aggregate of all categories with percentage share
- **TBC triage** — every `:tbc:` transaction with a one-click action: *assign account, save
  categorizer rule, remove tag*
- **Finance dashboard** — five-card overview (balances, TBC backlog, recurring items, top
  spending categories, upcoming contract payments)

### Actions

- **Rebuild journal from CSVs (built-in)** — a command that produces `journal.ledger` and
  `accounts.ledger` inside the plugin: no Python, no `uv`, no subprocess. Works on mobile too.
  Account configuration comes from a `konten.yaml` in the vault (setting: *accounts file*).
- **CSV import modal** (desktop only) — upload several CSVs, deduplicate against previous
  imports, then trigger the importer subprocess
- **Re-import** — runs the Python importer via subprocess, with a UI lock and counter reset
- **Git auto-backup** — pre-write commit with lock retry and detached-head detection
- **Categorizer rule modal** — define a new pattern rule with a live match counter and
  conflict check; writes to `categorizer-rules/`
- **Account suggestions** — type-ahead built from `accounts.ledger` plus a frontmatter crawl,
  deduplicated
- **Deep-link URI** — `obsidian://finance?mode=ledger&filter=…` to drive the filters from outside

### What it looks like

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/dashboard.png" width="640" alt="Dashboard tab with cards for account balances, recent activity, quick navigation, quick actions and the largest spending categories of the current month.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/balances.png" width="640" alt="Balances tab: per account the opening balance with its as-of date, the movement since that date and the current balance.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/categories.png" width="640" alt="Categories tab: spending categories as a hierarchy with amount and percentage share.">

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/triage.png" width="640" alt="To-classify tab: four unassigned transactions with amount and a Classify button each, with the total row below.">

## How it works

The plugin **does not compute from raw data** — it reads the hledger journal the importer
wrote and turns it into views. The one place where it does compute is the account balance:

### As-of-aware balance logic

The plugin parses `opening_balances.ledger` with a small dedicated parser
(`src/aggregator/openingBalances.ts`):

```typescript
parseOpeningBalances(text: string): Map<account, {amount, standAm}>
```

`computeSaldo(account)` = `opening.amount + Sum(tx where tx.date > opening.standAm)`.

Bootstrap workflow: you put the current bank balance and today's date into the account
note's frontmatter (`anfangssaldo_eur` + `anfangssaldo_stand_am`). The importer turns that
into `opening_balances.ledger`. The plugin then filters out transactions before the as-of date.

## Requirements

- **Obsidian 1.8.7 or newer**, desktop and mobile (`isDesktopOnly: false`).
- An **hledger journal in the vault** — `journal.ledger`, `accounts.ledger` and optionally
  `opening_balances.ledger`. Without a journal the views show nothing.
- For the **built-in** journal rebuild from CSVs: a `konten.yaml` in the vault. No Python,
  no `uv` — this path works on mobile as well.
- Only for the **re-import through the companion repository** (reports and note generators):
  desktop, `uv`, and a checkout of the Python importer.

## Install

This plugin is **not distributed through the community store**. It lives on its own forge, and
there are two ways to get it.

**Recommended — via [AnySource Sideloader](https://git.jkaindl.de/jkaindl/anysource-sideloader)**,
which installs and updates plugins from any git forge. Subscribe to this catalog once:

```
https://git.jkaindl.de/jkaindl/obsidian-catalog/raw/branch/main/catalog.json
```

Finance Ledger then appears in the sideloader's plugin list and updates like any other plugin —
no manual copying, and every download is checksum-verified.

**By hand**, if you would rather not add another plugin:

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://git.jkaindl.de/jkaindl/finance-ledger/releases).
2. Copy them into `<vault>/.obsidian/plugins/finance-ledger/`.
3. Obsidian → Settings → Community plugins → enable **Finance Ledger**.

Updates then have to be repeated by hand — the sideloader route exists to avoid exactly that.

From source: `npm install && npm run build` produces the same files; `npm run deploy` puts
them straight into a configured vault (see *Build and deploy*).

## Usage

The pie-chart icon in the ribbon opens the dashboard. Everything else lives in the command
palette:

| Command | View |
|---|---|
| `Open finance dashboard` | five-card overview: balances, TBC backlog, recurring items, top spending, upcoming contracts |
| `Open ledger viewer` | the filterable transaction table |
| `Open balance overview` | balance per account, corrected for the as-of date |
| `Open category overview` | hierarchical category aggregate |
| `Open TBC triage` | the open `:tbc:` transactions with one-click assignment |
| `Rebuild journal from CSVs (built-in)` | rebuilds `journal.ledger` and `accounts.ledger` — no external process |
| `Import CSV` | multi-file upload with deduplication (desktop only) |

The usual loop: rebuild or import the journal → work through **TBC triage** (each assignment
also writes a categorizer rule, so the same transaction lands by itself next time) → read
the dashboard.

From outside, the plugin can be driven through
`obsidian://finance?mode=ledger&filter=…`.

## Configuration

Settings → Community plugins → **Finance Ledger**:

<img src="https://git.jkaindl.de/jkaindl/finance-ledger/raw/branch/main/docs/images/settings.png" width="820" alt="The plugin settings: an Amount display section with a live preview showing income in green and expenses in red, a sign-convention dropdown, and three colour-scheme tiles (Classic selected, Monochrome, Inverted), followed by the vault path setting for the finance project folder.">

- **Amount display**: sign mode (*intuitive*: income +, expenses − · *accounting*: raw, as in
  hledger) plus a colour scheme (classic / monochrome / inverted) shown as swatch tiles with a
  live preview. Cash flow follows the setting, balances stay sign-based; colour follows the
  account type and is orthogonal to the sign.
- Vault-relative paths to ledger, accounts, contracts and categorizer rules
- `uv` binary path, with auto-detect fallback
- Filter presets (create, edit, delete — stored locally)

## Design system

The plugin uses three layers:

- **Obsidian CSS variables** for layout, typography, borders and surfaces (theme-agnostic)
- **`--fl-*` tokens** for finance-specific semantics (credit/debit/TBC colours, account-type
  accents, money display, typed card top borders)
- the **KSP signal palette** as the foundation of the `--fl-*` tokens, with light-mode
  corrections for AA contrast

Wired into five views — balance overview, finance dashboard, ledger view, TBC triage and
category overview. Money values carry `.fl-money` plus a sign colour, account chips a
`data-type` outline, cards a `data-card` top border, status dots `.fl-txn-state`. The
light-mode bridge dims the signal colours to keep AA contrast.

Detailed documentation: [`docs/design.md`](docs/design.md) (high level plus wiring state)
and [`docs/design/README.md`](docs/design/README.md) (canonical token files).

## Mobile status

- **Desktop-only paths:** the CSV import modal and the re-import subprocess. On mobile they
  show a notice saying so.
- **Mobile is read-only:** views render, but there are no subprocess or git actions.
- **Mobile icons:** on iPhone and iPad some placeholder icons are still visible after the
  last icon fix — diagnosis is pending on a desktop with mobile dev tools.

## The companion importer

The Python CLI importer that produces the journal is a separate project and is **not
published yet**. Its output in the vault lives under `<vault>/<financeRoot>/Ledger/` plus
the note folders `10-accounts`, `20-contracts`, `30-savings-goals`, `40-monthly-reports`,
`45-categories`, `55-categorizer-rules`, `60-payees`, `70-quarterly-reports`,
`80-annual-reports` and `05-bases`.

Everything the plugin needs beyond that journal — the built-in rebuild from CSVs — it does
on its own.

### Output note schema (marker system)

Every note the importer writes (account, report, category, payee, rule) uses a marker
pattern that protects user edits:

```
---
frontmatter
---
<user-editable header>

<!-- BEGIN: AUTO-GENERATED -->
auto section (tables, mermaid charts, bases embeds, cross-references)
<!-- END: AUTO-GENERATED -->

## 📌 Notes
user edit zone — untouched on re-runs.
```

On top of that: mermaid charts (pie for top categories, bar and xy-line for trends) and
collapsible bases embeds inside `[!quote]` callouts.

### Budget layer

Monthly reports carry a budget section: target (12-month average) / actual / forecast
(linear extrapolation) / difference / traffic light (🟢 below 90 % of target, 🟡 90–110 %,
🔴 above 110 %). A caveat warning appears when the average rests on fewer than 12 months.

## Build and deploy

```bash
npm install                # once
npm test                   # vitest run (682 green)
npm run build              # esbuild → main.js (repo root)
npm run dev                # esbuild --watch (inline sourcemap, no minify)
npm run deploy             # build + copy manifest.json, main.js, styles.css into a vault
```

`npm run deploy` copies into the target set through an environment variable:

```bash
export OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/finance-ledger"
npm run deploy
```

Then in Obsidian: Settings → Community plugins → turn off safe mode → enable **Finance
Ledger**. On updates, run `npm run deploy` again and reload the plugin (toggle it off and
on, or `Cmd+R`).

## Repository layout

| Path | Purpose |
|------|---------|
| `src/` | TypeScript sources (views, ui, parser, resolver, state, types, utils, aggregator, categorizer rules) |
| `src/aggregator/openingBalances.ts` | as-of-aware parser for `opening_balances.ledger` |
| `src/aggregator/saldo.ts` | as-of-aware `computeSaldo` |
| `tests/` | vitest specs (682 tests green) |
| `docs/design/` | canonical design-system source of truth |
| `docs/design.md` | high-level design-system explanation |
| `styles.css` | plugin styles with tokens and utilities |
| `manifest.json` | Obsidian plugin manifest (id: `finance-ledger`) |
| `main.js` | esbuild output (committed, as Obsidian plugins require) |
| `package.json` | npm scripts |
| `esbuild.config.mjs` | bundle config |
| `vitest.config.ts` | test config |
| `tsconfig.json` | TypeScript config |
| `AGENTS.md` | architecture conventions for coding agents |
| `CHANGELOG.md` | release notes |

## License

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE))
- **Documentation and prose:** CC BY-SA 4.0 ([`LICENSE-DOCS`](LICENSE-DOCS))

Copyright © 2026 Johannes Kaindl.
