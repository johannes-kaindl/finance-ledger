import { App, Plugin, PluginSettingTab, Setting, Notice, Platform } from 'obsidian';
import type { PluginData } from '../types/plugin-data';
import type { FinancePathSettings } from '../state/financePaths';
import { formatMoneyAmount, type ColorScheme } from '../views/helpers';
import { t } from '../i18n/strings';

export type SettingsAccessor = {
  loadData: () => Promise<PluginData>;
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

export class FinanceSettingTab extends PluginSettingTab {
  private readonly accessor: SettingsAccessor;
  private readonly refreshHub: () => void;

  constructor(app: App, plugin: Plugin, accessor: SettingsAccessor, refreshHub: () => void) {
    super(app, plugin);
    this.accessor = accessor;
    this.refreshHub = refreshHub;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    let data: PluginData;
    void this.accessor.loadData().then(d => {
      data = d;
      this.renderSettings(containerEl, data);
    });
  }

  private renderSettings(containerEl: HTMLElement, data: PluginData): void {
    this.renderDisplaySection(containerEl, data);

    new Setting(containerEl).setName(t('settings.heading.vaultPaths')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.financeRoot.name'))
      .setDesc(t('settings.financeRoot.desc'))
      .addText(text => {
        text.setValue(data.financeRoot);
        text.setPlaceholder('Finance');
        text.onChange(async (value) => {
          data.financeRoot = value.trim();
          await this.accessor.saveData(data);
        });
      });

    new Setting(containerEl)
      .setName(t('settings.heading.advancedPaths'))
      .setDesc(t('settings.advancedPaths.desc'))
      .setHeading();

    const advanced: ReadonlyArray<{ key: keyof FinancePathSettings; nameKey: string; placeholder: string }> = [
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
    for (const field of advanced) {
      new Setting(containerEl)
        .setName(t(field.nameKey))
        .addText(text => {
          text.setValue(data[field.key]);
          text.setPlaceholder(field.placeholder);
          text.onChange(async (value) => {
            data[field.key] = value.trim();
            await this.accessor.saveData(data);
          });
        });
    }

    new Setting(containerEl).setName(t('settings.heading.importerIntegration')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.importerCwd.name'))
      .setDesc(t('settings.importerCwd.desc'))
      .addText(text => {
        text.setValue(data.importerCwd);
        text.setPlaceholder('/absolute/path/to/finance-ledger-importer');
        text.onChange(async (value) => {
          const trimmed = value.trim();
          // Desktop: validate via fs. Mobile: no fs — persist value unvalidated.
          if (Platform.isDesktop) {
            const { existsSync } = await import('fs');
            const path = (await import('path')).default;
            if (!existsSync(path.join(trimmed, 'pyproject.toml'))) {
              new Notice(t('notice.importerPathNotFound', trimmed));
              return;
            }
          }
          data.importerCwd = trimmed;
          await this.accessor.saveData(data);
        });
      });

    new Setting(containerEl)
      .setName(t('settings.importerTimeout.name'))
      .setDesc(t('settings.importerTimeout.desc'))
      .addText(text => {
        text.setValue(String(data.importerTimeoutMs));
        text.onChange(async (value) => {
          const parsed = parseInt(value, 10);
          if (isNaN(parsed) || parsed < 10_000) {
            new Notice(t('notice.importerTimeoutTooLow'));
            return;
          }
          data.importerTimeoutMs = parsed;
          await this.accessor.saveData(data);
        });
      });

    new Setting(containerEl)
      .setName(t('settings.uvBinaryPath.name'))
      .setDesc(t('settings.uvBinaryPath.desc'))
      .addText(text => {
        text.setValue(data.uvBinaryPath ?? '');
        text.setPlaceholder('/usr/local/bin/uv');
        text.onChange(async (value) => {
          const trimmed = value.trim();
          if (Platform.isDesktop && trimmed) {
            const { existsSync } = await import('fs');
            if (!existsSync(trimmed)) {
              new Notice(t('notice.uvBinaryNotFound', trimmed));
              return;
            }
          }
          data.uvBinaryPath = trimmed;
          await this.accessor.saveData(data);
        });
      });
  }

  /**
   * F1 — „Finanzansicht & Darstellung": Vorzeichen-Modus + Farbschema
   * (Swatch-Kacheln) mit Live-Vorschau. Nutzt denselben `formatMoneyAmount`-
   * Helper wie die Panels → Vorschau == Realität. Änderungen refreshen offene
   * Hub-Views sofort.
   */
  private renderDisplaySection(containerEl: HTMLElement, data: PluginData): void {
    const save = async (): Promise<void> => {
      await this.accessor.saveData(data);
      this.refreshHub();
    };

    new Setting(containerEl).setName(t('settings.heading.amountDisplay')).setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: t('settings.amountDisplay.desc'),
    });

    // Live preview (re-rendered on every change).
    const preview = containerEl.createDiv({ cls: 'fl-display-preview' });
    const previewRows: ReadonlyArray<{ labelKey: string; raw: number; ctx: 'income' | 'expense' }> = [
      { labelKey: 'settings.preview.income', raw: PREVIEW_INCOME_RAW, ctx: 'income' },
      { labelKey: 'settings.preview.expense', raw: PREVIEW_EXPENSE_RAW, ctx: 'expense' },
    ];
    const renderPreview = (): void => {
      preview.empty();
      for (const r of previewRows) {
        const row = preview.createDiv({ cls: 'fl-display-preview-row' });
        row.createSpan({ text: t(r.labelKey) });
        const { text, tone } = formatMoneyAmount(r.raw, r.ctx, data);
        row.createSpan({ cls: `fl-money is-${tone}`, text });
      }
    };

    // Sign convention.
    new Setting(containerEl)
      .setName(t('settings.signMode.name'))
      .setDesc(t('settings.signMode.desc'))
      .addDropdown(dd => {
        dd.addOption('intuitive', t('settings.signMode.intuitive'));
        dd.addOption('accounting', t('settings.signMode.accounting'));
        dd.setValue(data.signMode);
        dd.onChange(async (value) => {
          data.signMode = value as PluginData['signMode'];
          renderPreview();
          await save();
        });
      });

    // Color scheme — clickable swatch tiles instead of a dropdown.
    const schemeSetting = new Setting(containerEl)
      .setName(t('settings.colorScheme.name'))
      .setDesc(t('settings.colorScheme.desc'));
    const tiles = schemeSetting.controlEl.createDiv({ cls: 'fl-swatch-tiles' });
    const tileEls = new Map<ColorScheme, HTMLElement>();
    const markSelected = (): void => {
      for (const [id, el] of tileEls) el.toggleClass('is-selected', id === data.colorScheme);
    };
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
      tile.onclick = async (): Promise<void> => {
        data.colorScheme = scheme.id;
        markSelected();
        renderPreview();
        await save();
      };
      tileEls.set(scheme.id, tile);
    }

    markSelected();
    renderPreview();
  }
}
