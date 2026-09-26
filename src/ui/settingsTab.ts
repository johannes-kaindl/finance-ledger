import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Platform,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from 'obsidian';
import type { PluginData } from '../types/plugin-data';
import type { FinancePathSettings } from '../state/financePaths';
import { formatMoneyAmount, type ColorScheme } from '../views/helpers';
import { t } from '../i18n/strings';
import { githubHelpUrls, helpSettingDefinition } from '../vendor/kit-obsidian/help-setting';
import {
  renderSettingDefinitions,
  settingBodyHost,
  type SettingControlHost,
} from '../vendor/kit-obsidian/settings_walker';

export type SettingsAccessor = {
  /** Synchron, weil `getSettingDefinitions()` synchron sein muss (Obsidian ≥1.13
   *  ruft es beim Öffnen ohne await auf) — `main.ts` hält `pluginData` bereits
   *  geladen im Speicher, ein erneutes `loadData()` je Öffnen war nur historisch. */
  getData: () => PluginData;
  saveData: (data: PluginData) => Promise<void>;
};

const COLOR_SCHEMES: ReadonlyArray<{ id: ColorScheme; nameKey: string; descKey: string }> = [
  { id: 'classic', nameKey: 'settings.colorScheme.classic.name', descKey: 'settings.colorScheme.classic.desc' },
  { id: 'monochrome', nameKey: 'settings.colorScheme.monochrome.name', descKey: 'settings.colorScheme.monochrome.desc' },
  { id: 'inverted', nameKey: 'settings.colorScheme.inverted.name', descKey: 'settings.colorScheme.inverted.desc' },
];

// Beispielbeträge für die Live-Vorschau (hledger-Rohvorzeichen).
const PREVIEW_INCOME_RAW = -2500;
const PREVIEW_EXPENSE_RAW = 900;

/** Reine Text-Pfadfelder (kein `financeRoot` — das bekommt Placeholder + eigenen Platz). */
const ADVANCED_PATH_FIELDS: ReadonlyArray<{ key: keyof FinancePathSettings; nameKey: string; placeholder: string }> = [
  { key: 'ledgerSubdir', nameKey: 'settings.field.ledgerSubdir', placeholder: 'Ledger' },
  { key: 'journalFile', nameKey: 'settings.field.journalFile', placeholder: 'journal.ledger' },
  { key: 'openingBalancesFile', nameKey: 'settings.field.openingBalancesFile', placeholder: 'opening_balances.ledger' },
  { key: 'accountsFile', nameKey: 'settings.field.accountsFile', placeholder: 'accounts.ledger' },
  { key: 'rulesSubdir', nameKey: 'settings.field.rulesSubdir', placeholder: '55-Categorizer-Rules' },
  { key: 'basesSubdir', nameKey: 'settings.field.basesSubdir', placeholder: '05-Bases' },
  { key: 'kategorienSubdir', nameKey: 'settings.field.kategorienSubdir', placeholder: '45-Kategorien' },
  { key: 'empfaengerSubdir', nameKey: 'settings.field.empfaengerSubdir', placeholder: '60-Empfänger' },
  { key: 'umsatzSubdir', nameKey: 'settings.field.umsatzSubdir', placeholder: 'Umsätze' },
  { key: 'kontenFile', nameKey: 'settings.kontenFile.name', placeholder: 'konten.yaml' },
  { key: 'vertraegeFile', nameKey: 'settings.vertraegeFile.name', placeholder: 'vertraege.yaml' },
];

/**
 * Settings-Tab auf `getSettingDefinitions()` (Kit-Walker `settings_walker.ts`,
 * obsidian-kit@0.37.1) — ab Obsidian 1.13 erscheinen die Felder damit in der
 * Settings-Suche; darunter zeichnet `display()` dieselbe Struktur mit der
 * klassischen `Setting`-API nach (Fallback-Pfad des Walkers). EINE Wahrheit
 * (`getSettingDefinitions()`), kein zweiter Baum, der auseinanderlaufen kann.
 *
 * Live-Vorschau und Farbschema-Kacheln bleiben `render`-Hatches — das ist ein
 * natives Feld von `SettingDefinitionItem` seit Obsidian 1.13.0
 * (`SettingDefinitionRender.render`), keine UI-STANDARD-Abweichung: beide
 * Renderpfade (nativ wie Walker-Fallback) rufen dieselbe Hatch-Funktion auf.
 */
export class FinanceSettingTab extends PluginSettingTab implements SettingControlHost {
  private readonly accessor: SettingsAccessor;
  private readonly refreshHub: () => void;
  private previewEl: HTMLElement | null = null;
  private readonly tileEls = new Map<ColorScheme, HTMLElement>();
  private cleanupPrevious: () => void = () => {};

  constructor(app: App, plugin: Plugin, accessor: SettingsAccessor, refreshHub: () => void) {
    super(app, plugin);
    this.accessor = accessor;
    this.refreshHub = refreshHub;
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  display(): void {
    const { containerEl } = this;
    this.cleanupPrevious();
    containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(containerEl, this.getSettingDefinitions(), this, this.app);
  }

  // ── Die eine Wahrheit ────────────────────────────────────────────────────
  // Der Generic-Parameter bindet jeden `key` an ein echtes Feld von `PluginData`:
  // ein Tippfehler bricht den Build, statt zur Laufzeit stumm ins Leere zu greifen.
  getSettingDefinitions(): SettingDefinitionItem<keyof PluginData>[] {
    return [
      // §8 Hilfe-Zeile: erstes Element, vor jeder Überschrift; der Walker-Fallback zeichnet sie
      // auch für Obsidian < 1.13 (kein zweiter Aufruf in display()).
      helpSettingDefinition({
        ...githubHelpUrls('finance-ledger'),
        texts: {
          name: t('settings.help.name'),
          desc: t('settings.help.desc'),
          openDocs: t('settings.help.openDocs'),
          reportIssue: t('settings.help.reportIssue'),
        },
      }),
      {
        type: 'group',
        heading: t('settings.heading.amountDisplay'),
        items: [
          {
            name: '',
            render: (setting: Setting): (() => void) => this.renderAmountDisplayIntro(setting),
          },
          {
            name: t('settings.signMode.name'),
            desc: t('settings.signMode.desc'),
            control: {
              type: 'dropdown',
              key: 'signMode',
              options: {
                intuitive: t('settings.signMode.intuitive'),
                accounting: t('settings.signMode.accounting'),
              },
            },
          },
          {
            name: t('settings.colorScheme.name'),
            render: (setting: Setting): void => this.renderColorSchemeTiles(setting),
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.heading.vaultPaths'),
        items: [
          {
            name: t('settings.financeRoot.name'),
            desc: t('settings.financeRoot.desc'),
            control: { type: 'text', key: 'financeRoot', placeholder: 'Finance' },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.heading.advancedPaths'),
        items: [
          this.hinweisItem(t('settings.advancedPaths.desc')),
          ...ADVANCED_PATH_FIELDS.map(
            (field): SettingGroupItem<keyof PluginData> => ({
              name: t(field.nameKey),
              control: { type: 'text', key: field.key, placeholder: field.placeholder },
            }),
          ),
        ],
      },
      {
        type: 'group',
        heading: t('settings.heading.importerIntegration'),
        items: [
          {
            name: t('settings.importerCwd.name'),
            desc: t('settings.importerCwd.desc'),
            control: {
              type: 'text',
              key: 'importerCwd',
              placeholder: '/absolute/path/to/finance-ledger-importer',
            },
          },
          {
            name: t('settings.importerTimeout.name'),
            desc: t('settings.importerTimeout.desc'),
            control: { type: 'text', key: 'importerTimeoutMs' },
          },
          {
            name: t('settings.uvBinaryPath.name'),
            desc: t('settings.uvBinaryPath.desc'),
            control: { type: 'text', key: 'uvBinaryPath', placeholder: '/usr/local/bin/uv' },
          },
        ],
      },
    ];
  }

  /** Informationszeile ohne Steuerelement (Muster aus `anysource-sideloader`). */
  private hinweisItem(text: string): SettingGroupItem<keyof PluginData> {
    return { name: '', desc: text, render: (row: Setting): void => void row.setDesc(text) };
  }

  // ── SettingControlHost ───────────────────────────────────────────────────
  getControlValue(key: string): unknown {
    return (this.accessor.getData() as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const data = { ...this.accessor.getData() } as PluginData & Record<string, unknown>;

    switch (key) {
      case 'importerCwd': {
        const trimmed = String(value).trim();
        if (Platform.isDesktop) {
          const { existsSync } = await import('fs');
          const path = (await import('path')).default;
          if (!existsSync(path.join(trimmed, 'pyproject.toml'))) {
            new Notice(t('notice.importerPathNotFound', trimmed));
            return;
          }
        }
        data.importerCwd = trimmed;
        break;
      }
      case 'importerTimeoutMs': {
        const parsed = parseInt(String(value), 10);
        if (isNaN(parsed) || parsed < 10_000) {
          new Notice(t('notice.importerTimeoutTooLow'));
          return;
        }
        data.importerTimeoutMs = parsed;
        break;
      }
      case 'uvBinaryPath': {
        const trimmed = String(value).trim();
        if (Platform.isDesktop && trimmed) {
          const { existsSync } = await import('fs');
          if (!existsSync(trimmed)) {
            new Notice(t('notice.uvBinaryNotFound', trimmed));
            return;
          }
        }
        data.uvBinaryPath = trimmed;
        break;
      }
      case 'financeRoot':
        data.financeRoot = String(value).trim();
        break;
      default:
        if (isPathField(key)) {
          data[key] = String(value).trim();
        } else {
          data[key] = value;
        }
    }

    await this.accessor.saveData(data);

    if (key === 'signMode' || key === 'colorScheme') {
      this.refreshHub();
      this.updatePreview();
      if (key === 'colorScheme') this.markSelectedTile();
    }
  }

  // ── F1: Live-Vorschau + Farbschema-Kacheln ──────────────────────────────
  private renderAmountDisplayIntro(setting: Setting): () => void {
    const host = settingBodyHost(setting);
    host.createEl('p', { cls: 'setting-item-description', text: t('settings.amountDisplay.desc') });
    this.previewEl = host.createDiv({ cls: 'fl-display-preview' });
    this.updatePreview();
    return (): void => {
      this.previewEl = null;
    };
  }

  private updatePreview(): void {
    const preview = this.previewEl;
    if (!preview) return;
    const data = this.accessor.getData();
    preview.empty();
    const rows: ReadonlyArray<{ labelKey: string; raw: number; ctx: 'income' | 'expense' }> = [
      { labelKey: 'settings.preview.income', raw: PREVIEW_INCOME_RAW, ctx: 'income' },
      { labelKey: 'settings.preview.expense', raw: PREVIEW_EXPENSE_RAW, ctx: 'expense' },
    ];
    for (const r of rows) {
      const row = preview.createDiv({ cls: 'fl-display-preview-row' });
      row.createSpan({ text: t(r.labelKey) });
      const { text, tone } = formatMoneyAmount(r.raw, r.ctx, data);
      row.createSpan({ cls: `fl-money is-${tone}`, text });
    }
  }

  private renderColorSchemeTiles(setting: Setting): void {
    setting.setDesc(t('settings.colorScheme.desc'));
    const data = this.accessor.getData();
    this.tileEls.clear();
    const tiles = setting.controlEl.createDiv({ cls: 'fl-swatch-tiles' });
    for (const scheme of COLOR_SCHEMES) {
      const tile = tiles.createDiv({ cls: 'fl-swatch-tile' });
      tile.setAttribute('data-scheme', scheme.id);
      const chips = tile.createDiv({ cls: 'fl-swatch-chips' });
      const incomeTone = formatMoneyAmount(PREVIEW_INCOME_RAW, 'income', { ...data, colorScheme: scheme.id }).tone;
      const expenseTone = formatMoneyAmount(PREVIEW_EXPENSE_RAW, 'expense', { ...data, colorScheme: scheme.id }).tone;
      chips.createDiv({ cls: `fl-swatch-chip is-${incomeTone}` });
      chips.createDiv({ cls: `fl-swatch-chip is-${expenseTone}` });
      tile.createDiv({ cls: 'fl-swatch-tile-name', text: t(scheme.nameKey) });
      tile.createDiv({ cls: 'fl-swatch-tile-desc', text: t(scheme.descKey) });
      tile.onclick = (): void => {
        void this.setControlValue('colorScheme', scheme.id);
      };
      this.tileEls.set(scheme.id, tile);
    }
    this.markSelectedTile();
  }

  private markSelectedTile(): void {
    const current = this.accessor.getData().colorScheme;
    for (const [id, el] of this.tileEls) el.toggleClass('is-selected', id === current);
  }
}

function isPathField(key: string): key is keyof FinancePathSettings {
  return ADVANCED_PATH_FIELDS.some((f) => f.key === key);
}
