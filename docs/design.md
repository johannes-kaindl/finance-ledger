# Plugin-Design-System — High-Level

Dieses Dokument erklärt die **drei Schichten** des Plugin-Designs und die Regeln, wann welche Token-Quelle genutzt wird. Konkrete Token-Werte: [`design/README.md`](design/README.md).

## Drei Schichten

```
┌─────────────────────────────────────────────────────────┐
│  1. Obsidian-Theme-Layer                                 │
│  Vom User-Theme geliefert. Ändert sich pro Workspace.    │
│  Vars: --background-primary, --text-normal, --font-text  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. Plugin-Layout-Layer                                  │
│  Strukturelle Tokens fürs Plugin (--fl-space-*,          │
│  --fl-radius-*, --fl-ease-*, --fl-dur-*).                │
│  Theme-agnostic — definiert in styles.css.               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. Finance-Domain-Layer                                 │
│  Semantische Finance-Tokens (--fl-txn-*, --fl-acct-*,    │
│  --fl-card-*-top). Foundation: KSP-Signal-Palette.       │
│  Light-Mode-Korrekturen unter body.theme-light.          │
└─────────────────────────────────────────────────────────┘
```

## Wann welche Token-Quelle nutzen?

### Obsidian-CSS-Variablen (immer wenn möglich)

Für alles, was **kein finance-spezifisches Konzept** ist — Hintergründe, Text-Farben, Borders, Fonts, Modal-Surfaces, Form-Elemente.

| Use-Case | Obsidian-Var |
|----------|--------------|
| App-Hintergrund | `var(--background-primary)` |
| Card-/Panel-Hintergrund | `var(--background-secondary)` |
| Modal-Backdrop | `var(--background-modifier-cover)` |
| Input-Feld-Hintergrund | `var(--background-modifier-form-field)` |
| Body-Text | `var(--text-normal)` |
| Sekundär-Text | `var(--text-muted)` |
| Meta/Faint-Text | `var(--text-faint)` |
| Standard-Border | `var(--background-modifier-border)` |
| Hover-Border | `var(--background-modifier-border-hover)` |
| Lese-Font | `var(--font-text)` |
| UI-Font | `var(--font-interface)` |
| Mono-Font (Code/Money) | `var(--font-monospace)` |
| Interactive-Akzent (Buttons, Links) | `var(--interactive-accent)` |

**Warum?** Plugin passt sich automatisch jedem User-Theme an. Kein Theme-Konflikt, kein hardcoded Look.

### `--fl-*`-Tokens (für Finance-Semantik)

Wenn ein Konzept **finance-spezifisch** ist und Obsidian keinen passenden Var hat:

| Use-Case | `--fl-*`-Token |
|----------|----------------|
| Geld-Eingang / Credit | `var(--fl-txn-credit)` |
| Geld-Ausgang / Debit | `var(--fl-txn-debit)` |
| Uncategorized / TBC | `var(--fl-txn-tbc)` |
| Reconciled / gematcht | `var(--fl-txn-reconciled)` |
| Self-Transfer | `var(--fl-txn-transfer)` |
| Recurring / wiederkehrend | `var(--fl-txn-recurring)` |
| Orphan-Tx / fehlende Counterparty | `var(--fl-txn-orphan)` |
| Future-dated | `var(--fl-txn-future)` |
| Asset-Account-Akzent | `var(--fl-acct-asset)` |
| Liability-Account-Akzent | `var(--fl-acct-liability)` |
| Income-Account-Akzent | `var(--fl-acct-income)` |
| Expense-Account-Akzent | `var(--fl-acct-expense)` |
| Equity-Account-Akzent | `var(--fl-acct-equity)` |
| Card-Top-Border (Deadline) | `var(--fl-card-deadline-top)` |
| Card-Top-Border (TBC) | `var(--fl-card-tbc-top)` |
| Card-Top-Border (Balance) | `var(--fl-card-balance-top)` |
| Card-Top-Border (Trend) | `var(--fl-card-trend-top)` |
| Card-Top-Border (Orphan) | `var(--fl-card-orphan-top)` |
| Money-Display Tabular-Figures | `var(--fl-num-feat)` |

### `--fl-*` Strukturelle Tokens

Für Plugin-interne Layout-Konsistenz:

| Token | Wert |
|-------|------|
| `--fl-space-1..7` | 4 / 8 / 12 / 16 / 24 / 32 / 48 px |
| `--fl-radius-sm/md/lg/xl/full` | 3 / 6 / 10 / 14 / 999 px |
| `--fl-ease-signal/ghost/pulse` | Motion-Curves |
| `--fl-dur-fast/base/slow` | 120 / 200 / 360 ms |

## Utility-Classes

In `styles.css` definiert, in View-Code adoptierbar:

### `.fl-money` — Geldbetrag-Display

```html
<span class="fl-money is-credit">+1.234,56 EUR</span>
<span class="fl-money is-debit">-39,95 EUR</span>
<span class="fl-money is-zero">0,00 EUR</span>
```

- Mono-Font (`var(--font-monospace)`)
- Tabular-Numerals (`tabular-nums lining-nums`)
- Klassen-Modifier `.is-credit` / `.is-debit` / `.is-zero` setzen Farbe

### `.fl-acct-chip` — Account-Type-Chip

```html
<span class="fl-acct-chip" data-type="asset">Hauptkonto</span>
<span class="fl-acct-chip" data-type="liability">Visa</span>
```

- Border-Color via `data-type`-Attribut
- Pillen-Form mit `--fl-radius-full`

### `.fl-txn-state` — Status-Indikator-Dot

```html
<span class="fl-txn-state" data-state="tbc"></span> Pending review
```

- Kleiner Punkt (8x8px), Color via `data-state`

### `.fl-card` — Typed Card

```html
<div class="fl-card" data-card="deadline">
  <h3>Vodafone-Vertrag</h3>
  <p>Fällig 2026-06-15</p>
</div>
```

- Top-Border-Akzent via `data-card`-Attribut

## Light-Mode-Verhalten

- **Surface/FG/Border** schalten automatisch via Obsidian-Vars (`body.theme-light` triggert Obsidians eigene Var-Werte) — Plugin macht NICHTS dafür.
- **Signal-Farben** (`--fl-signal-*`) werden im Plugin-`styles.css` unter `body.theme-light` gedämpft (z.B. `#d4203a` → `#b8142d` für besseren AA-Kontrast auf warmem Papier-Hintergrund).
- **Finance-Tokens** (`--fl-txn-*`, `--fl-acct-*`) brauchen kein eigenes Light-Override — sie referenzieren `--fl-signal-*` und folgen automatisch.

## Wie wird ein neues Token hinzugefügt?

1. **Identifizieren** — gibt es ein Obsidian-Var, das passt? Wenn ja, einfach nutzen, keinen `--fl-*`-Token anlegen.
2. **Wenn finance-spezifisch:** in [`docs/design/finance-tokens.css`](design/finance-tokens.css) als canonical-Eintrag dokumentieren (Source-of-Truth).
3. **In `styles.css`** den `--fl-*`-prefixed Token unter Layer 2 (Finance-Domain) hinzufügen.
4. **Light-Mode prüfen** — wenn der Token von `--fl-signal-*` ableitet, ist er automatisch dabei. Wenn er einen eigenen Wert hat, prüfe AA-Kontrast und ergänze `body.theme-light`-Variant.
5. **Wenn neue Utility-Class:** in `styles.css` Layer 4 hinzufügen + in dieser Doku unter „Utility-Classes" dokumentieren.

## Aktueller Wiring-Stand (post Slice-9 F15)

KSP-Tokens + Utility-Classes sind in **5 Views** appliziert (commit `b7443e8`, Tags `26-011-finanzplan-plugin-pre/post-f15-design-wiring`):

| View | Adoption |
|---|---|
| `SaldoOverviewView` | `.fl-money` mit `is-credit/is-debit/is-zero`, `.fl-acct-chip` mit `data-type`-Outline, Stand-Am-TBC-Marker mit ember-orange |
| `FinanceDashboardView` | `.fl-card` mit `data-card`-Top-Border (Saldo = pearl, Activity + Top-Categories = spectre) |
| `LedgerView` | `.fl-money` tabular-figures + sign-color |
| `TBCTriageView` | `.fl-txn-state` ember-Dots für `:tbc:`-Tx |
| `CategoryOverviewView` | `.fl-money` Anteil-%-tabular + `.fl-acct-chip` für Top-Kategorie-Chips |

Neue Views adoptieren das Pattern direkt (siehe nächster Abschnitt).

## Wie wird ein neuer View an das Design-System gekoppelt?

1. View benutzt **Obsidian-Vars** für alle Surfaces/Typography/Borders.
2. **Money-Beträge** bekommen `class="fl-money"` + ggf. `is-credit` / `is-debit`.
3. **Account-Labels** als `class="fl-acct-chip" data-type="asset|liability|income|expense|equity"`.
4. **Status-Anzeigen** als `class="fl-txn-state" data-state="…"`.
5. **Card-Container** als `class="fl-card" data-card="deadline|tbc|balance|trend|orphan"`.

## SVG-Icon-Härtung (Mobile-Continuity)

Layer 6 in `styles.css` setzt für alle Plugin-Container:

```css
fill: currentColor;
color: currentColor;
display: inline-block;
vertical-align: middle;
```

Das verhindert Icon-Platzhalter auf iOS, wo `currentColor`-Inheritance manchmal scheitert. Wenn ein neuer View Icons darstellt, sollte sein Container-Selector ergänzt werden.

## Referenz

- Token-Werte canonical: [`docs/design/`](design/README.md)
- Token-Mapping-Analyse: maintainer-lokales Arbeitsdokument (nicht Teil dieses Repos)
- Visuelle Vorschau: `docs/design/system-reference.html` (im Browser öffnen)

## Stand-Am-aware Saldo (Slice-8)

Plugin liest seit Slice-8 `opening_balances.ledger` zusätzlich zu `journal.ledger`. Pro Konto wird ein Anfangssaldo + Stand-Am-Datum extrahiert (vom Importer aus Konto-Note-Frontmatter geschrieben).

```typescript
// src/aggregator/openingBalances.ts
parseOpeningBalances(text): Map<account, {amount, standAm}>

// src/aggregator/saldo.ts
computeSaldo(account) = opening.amount + Sum(tx where tx.date > opening.standAm)
```

**SaldoOverviewView** zeigt:
- Saldo-Spalte: korrekter Bank-Saldo (Anfangssaldo + Tx ab Stand-Am)
- Stand-Am-Spalte: per-Konto-Datum oder orange "TBC"-Marker (User-Hint zum Bootstrap)
- Tx ab Stand-Am Spalte: Anzahl Tx im Aggregator (statt aller Tx)

**Bootstrap-Workflow:** User trägt aktuellen Bank-Saldo + heutiges Datum in Konto-Note (Properties-Editor) — Importer schreibt daraus echte Postings in `opening_balances.ledger`, Plugin filtert Tx vor Stand-Am.

## Marker-System + Mermaid (Slice-9)

Plugin selbst nutzt **kein** Marker-System (Plugin-Output ist UI, nicht persistente Files). Aber: Plugin-Views (SaldoOverviewView, FinanceDashboardView) **lesen** Importer-Output-Notes mit Marker — die User-Edit-Sections unter dem END-Marker werden ignoriert beim Tx-Parsing.

**Mermaid-Charts** in Importer-Notes (Pie/Bar/xy-Line) rendert Obsidian nativ. Plugin braucht keinen Mermaid-Code — die Charts erscheinen in Bericht-Notes via Bases-Embed oder direkt im Body.

**Bases-Embeds** in Importer-Notes nutzen Obsidian-Bases-Plugin (`![[<base>#<view-name>]]`). Pro Bericht-Note 1-2 collapsible `[!quote]-`-Callouts mit Embed (siehe `body_template.render_collapsible_callout`).

## Slice-Konvention-Patterns

- Stand-Am-aware-Logik mit per-Konto-Stichtag (statt globalem)
- User-Edit-Schutz für Bootstrap-Werte (analog zu `aliases:`/`sticker:`)
- Locale-Toleranz im Importer (deutsche Notation → kanonisch normalisiert)
- Marker-System (`<!-- BEGIN/END: AUTO-GENERATED -->`) für sauberen User-Edit-Bereich in Importer-Output-Notes
