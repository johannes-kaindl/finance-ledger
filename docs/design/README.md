# Finance Plugin — Design System

Dieses Verzeichnis ist die **Single-Source-of-Truth** für das Plugin-Design-System.
Es kombiniert das Kuro Signal Protocol (KSP) mit einem Finance-Ledger-Layer.

## Was ist canonical, was ist Reference?

| Datei / Ordner | Status | Zweck |
|----------------|--------|-------|
| `ksp-tokens.css` | **canonical** (Foundation) | KSP-Signal-Palette, Void-Skala, Surfaces, Type-Scale, Spacing, Radii, Motion |
| `finance-tokens.css` | **canonical** (Domain) | Finance-Layer: TXN-States, Account-Types, Typed-Card-Top-Borders, `.fl-money` |
| `light-mode.css` | **canonical** (Theme-Variant) | Light-Mode-Override für Signals + Surfaces |
| `system-reference.html` | **reference** | Visuelle Vorschau (nicht ins Plugin gebundelt) — öffnen in Browser für Token-Showcase |
| `previews/*.jsx` | **reference** | React-Komponenten-Specs, die das visuelle Verhalten dokumentieren |
| `assets/*.jpeg` | **reference** | Mood-Boards, Screenshots, Inspiration |

> **Wichtig:** Die canonical CSS-Files in diesem Ordner sind **dokumentierende Source-of-Truth**. Der **tatsächliche Plugin-Build** liest sie nicht direkt — die für das Plugin relevanten Tokens werden in `../../styles.css` (Plugin-Repo-Root) gepflegt, prefixed mit `--fl-*` und an Obsidians CSS-Variablen angepasst.

## Architektur — drei Schichten

```
┌─────────────────────────────────────────────────────────┐
│  Obsidian-Theme-Layer  (von Obsidian/User-Theme)         │
│  --background-primary, --text-normal, --font-text, ...   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Plugin-Layout-Layer  (in plugin styles.css)             │
│  Mappt Obsidian-Vars auf Layout — theme-agnostic         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Finance-Domain-Layer  (in plugin styles.css, --fl-*)    │
│  Credit/Debit/TBC-Farben, Account-Akzente, Money-Format  │
│  Foundation: KSP-Signal-Palette                          │
└─────────────────────────────────────────────────────────┘
```

**Regel:**
- Brauchst du Background, Text, Border, Spacing, Font? → **Obsidian-Var** (`var(--text-normal)`, `var(--background-secondary)`, ...)
- Brauchst du finance-spezifische Semantik (Geldfluss-Richtung, Account-Typ, TXN-State)? → **`--fl-*`-Token** (`var(--fl-txn-credit)`, `var(--fl-acct-asset)`, ...)

## Wie wird das Design-System integriert?

1. **Plugin liest tokens NICHT direkt aus diesem Ordner** — Obsidian erlaubt nur eine `styles.css` neben `main.js`. Tokens werden nach `../../styles.css` (Plugin-Repo-Root) gespiegelt, dort prefixed (`--fl-*`) und an Obsidian-Vars angepasst.
2. **Diese Datei (`docs/design/`) bleibt canonical** — Änderungen an Tokens beginnen hier (z.B. neue Account-Type-Farbe), dann werden sie in `styles.css` nachgezogen.
3. **Visuelle Validierung** läuft über `system-reference.html` (statisch im Browser öffnen) — die JSX-Previews zeigen, wie Komponenten mit den Tokens aussehen sollen.

## High-Level-Doku

Siehe `../design.md` (im docs-Root) für die Plugin-seitige Erklärung: wann nutzen wir Obsidian-Vars vs. `--fl-*`-Tokens, wie wird ein neues Token hinzugefügt, etc.

## Token-Mapping-Tabelle

Vollständige Mapping-Analyse: `../../dispatch-runs/design-system-analysis.md`

## Vorschau öffnen

```bash
# system-reference.html im Browser öffnen
open docs/design/system-reference.html
```

Die Previews benötigen Internet (React + Babel via unpkg-CDN). Sie laufen außerhalb des Obsidian-Plugin-Lifecycles und dienen nur als visuelle Spec.
