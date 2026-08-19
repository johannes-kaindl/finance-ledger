import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type { Transaction } from '../parser/ledger';
import { loadCategorizerRules } from '../categorizer-rules/loader';
import { createCategorizerRule, slugifyPattern } from '../categorizer-rules/writer';
import { previewMatchCount } from '../views/helpers';
import { loadAccountSuggestions } from '../categorizer-rules/accountSuggestions';
import type { ResolvedFinancePaths } from '../state/financePaths';
import { t } from '../i18n/strings';

export interface RuleModalParams {
  counterparty: string;
  allTransactions: Transaction[];
  onSuccess: () => Promise<void>;
}

export class CategorizerRuleModal extends Modal {
  private readonly params: RuleModalParams;

  constructor(app: App, params: RuleModalParams, private readonly getPaths: () => ResolvedFinancePaths) {
    super(app);
    this.params = params;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: t('modal.categorizerRule.title') });

    // Pattern input
    let patternInput!: HTMLInputElement;
    new Setting(contentEl)
      .setName(t('modal.categorizerRule.pattern.name'))
      .setDesc(t('modal.categorizerRule.pattern.desc'))
      .addText(text => {
        text.setValue(this.params.counterparty.toLowerCase());
        patternInput = text.inputEl;
      });

    // Pattern-Type dropdown
    let typeSelect!: HTMLSelectElement;
    new Setting(contentEl)
      .setName(t('modal.categorizerRule.patternType.name'))
      .addDropdown(dd => {
        dd.addOption('substring', t('modal.categorizerRule.patternType.substring'))
          .addOption('paypal-sub', t('modal.categorizerRule.patternType.paypalSub'))
          .setValue('substring');
        typeSelect = dd.selectEl;
      });

    // Account input with type-ahead datalist
    const datalistId = `cat-rule-account-suggestions-${Date.now()}`;
    let accountInput!: HTMLInputElement;
    new Setting(contentEl)
      .setName(t('modal.categorizerRule.account.name'))
      .setDesc(t('modal.categorizerRule.account.desc'))
      .addText(text => {
        // Beispiel-Konto-Präfix bleibt Deutsch (Daten-Konvention, F1) — kein t().
        text.setPlaceholder('Ausgaben:...');
        text.inputEl.setAttribute('list', datalistId);
        accountInput = text.inputEl;
      });
    const datalist = contentEl.createEl('datalist');
    datalist.id = datalistId;

    const basePath = (this.app.vault.adapter as { basePath?: string }).basePath ?? '';
    loadAccountSuggestions(this.app, basePath, this.getPaths().accounts)
      .then(({ accounts }) => {
        for (const account of accounts) {
          datalist.createEl('option').value = account;
        }
      })
      .catch(() => {
        new Notice(t('notice.accountSuggestionsFailed'));
      });

    // Tags input
    let tagsInput!: HTMLInputElement;
    new Setting(contentEl)
      .setName(t('modal.categorizerRule.tags.name'))
      .setDesc(t('modal.categorizerRule.tags.desc'))
      .addText(text => { tagsInput = text.inputEl; });

    // Aliases input
    let aliasesInput!: HTMLInputElement;
    new Setting(contentEl)
      .setName(t('modal.categorizerRule.aliases.name'))
      .setDesc(t('modal.categorizerRule.aliases.desc'))
      .addText(text => { aliasesInput = text.inputEl; });

    // Notes input
    let notesInput!: HTMLInputElement;
    new Setting(contentEl)
      .setName(t('modal.categorizerRule.note.name'))
      .setDesc(t('modal.categorizerRule.note.desc'))
      .addText(text => { notesInput = text.inputEl; });

    // Live preview section
    const preview = contentEl.createDiv({ cls: 'fl-surface' });

    const conflictEl = preview.createDiv();
    const matchEl = preview.createDiv();
    const slugEl = preview.createDiv();

    // Buttons declared before updatePreview so the closure can disable btnSave
    const btnRow = contentEl.createDiv({ cls: 'fl-row-actions' });

    const btnSave = btnRow.createEl('button', { text: t('modal.categorizerRule.saveRule'), cls: 'fl-grow mod-cta' });

    const updatePreview = () => {
      const pattern = patternInput.value.trim();
      if (!pattern) {
        conflictEl.setText('');
        matchEl.setText('');
        slugEl.setText('');
        btnSave.disabled = false;
        return;
      }

      const existing = loadCategorizerRules(this.app);
      const allRules = [...existing.counterpartyRules, ...existing.paypalRules];

      // Slug pre-check
      const baseSlug = slugifyPattern(pattern);
      const existingSlugs = new Set(allRules.map(r => r.noteFile.replace(/\.md$/, '')));
      const patternType = typeSelect.value as 'substring' | 'paypal-sub';
      const effectiveSlug =
        patternType === 'paypal-sub' && existingSlugs.has(baseSlug)
          ? `${baseSlug}-pp`
          : baseSlug;

      const slugFileExists = !!this.app.vault.getAbstractFileByPath(`${this.getPaths().rulesFolder}/${effectiveSlug}.md`);
      slugEl.toggleClass('fl-error', slugFileExists);
      slugEl.empty();
      if (slugFileExists) {
        setIcon(slugEl.createSpan({ cls: 'fl-inline-icon' }), 'alert-triangle');
        slugEl.createSpan({ text: t('modal.categorizerRule.slugExists', `${effectiveSlug}.md`) });
        const openLink = slugEl.createSpan({ cls: 'fl-link-affordance', text: t('modal.categorizerRule.openExisting') });
        openLink.onclick = () => {
          void this.app.workspace.openLinkText(`${this.getPaths().rulesFolder}/${effectiveSlug}.md`, '', false);
          this.close();
        };
      } else {
        slugEl.setText(t('modal.categorizerRule.slug', effectiveSlug));
      }

      const { tbcMatches, nonTbcMatches } = previewMatchCount(pattern, this.params.allTransactions);
      matchEl.empty();
      matchEl.createSpan({ text: t('modal.categorizerRule.matches', tbcMatches) });
      if (nonTbcMatches > 0) {
        setIcon(matchEl.createSpan({ cls: 'fl-inline-icon fl-warning' }), 'alert-triangle');
        matchEl.createSpan({ cls: 'fl-warning', text: t('modal.categorizerRule.reclassified', nonTbcMatches) });
      }

      const allPatterns = allRules.flatMap(r => [r.pattern, ...r.aliases]);
      const hasPatternConflict = allPatterns.includes(pattern);

      conflictEl.toggleClass('fl-error', hasPatternConflict);
      conflictEl.toggleClass('fl-success', !hasPatternConflict);
      conflictEl.empty();
      if (hasPatternConflict) {
        setIcon(conflictEl.createSpan({ cls: 'fl-inline-icon' }), 'alert-triangle');
        conflictEl.createSpan({ text: t('modal.categorizerRule.patternConflict') });
      } else {
        setIcon(conflictEl.createSpan({ cls: 'fl-inline-icon' }), 'check');
        conflictEl.createSpan({ text: t('modal.categorizerRule.noCollision') });
      }

      btnSave.disabled = slugFileExists || hasPatternConflict;
    };

    typeSelect.onchange = updatePreview;
    patternInput.oninput = updatePreview;
    updatePreview();
    btnSave.onclick = async () => {
      const pattern = patternInput.value.trim();
      const ledgerAccount = accountInput.value.trim();

      if (!pattern || !ledgerAccount) {
        new Notice(t('notice.rulePatternRequired'));
        return;
      }

      const patternType = typeSelect.value as 'substring' | 'paypal-sub';
      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      const aliases = aliasesInput.value.split(',').map(a => a.trim()).filter(Boolean);

      try {
        const existingRules = loadCategorizerRules(this.app);
        const result = await createCategorizerRule(
          this.app,
          this.getPaths().rulesFolder,
          { pattern, patternType, ledgerAccount, tags, aliases, notes: notesInput.value.trim() || undefined },
          existingRules,
        );

        if (result.conflicts.length > 0) {
          const conflictMsg = result.conflicts.map(c => `"${c.pattern}" (${c.fileA})`).join(', ');
          new Notice(t('notice.ruleSavedConflicts', conflictMsg), 8000);
        } else {
          new Notice(t('notice.ruleSaved', result.slug, result.priority));
        }

        this.close();
        await this.params.onSuccess();
      } catch (err) {
        new Notice(t('notice.genericError', err instanceof Error ? err.message : String(err)));
      }
    };

    const btnCancel = btnRow.createEl('button', { text: t('common.cancel') });
    btnCancel.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
