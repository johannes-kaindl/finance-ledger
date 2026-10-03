import { App, Modal, Notice, Setting, normalizePath, setIcon } from 'obsidian';
import type { KontenConfig } from '../core/config/konten';
import { previewCsv, type CsvPreviewResult } from '../core/import/preview';
import { kontenSourceFor } from '../obsidian/kontenSource';
import { runNativeImport } from '../obsidian/nativeImport';
import { ObsidianVaultPort } from '../obsidian/vault-port';
import { loadKonten, loadKontenConfig, type KontoSpec } from '../state/konten';
import type { PluginData } from '../types/plugin-data';
import { notConfiguredMessage, type ResolvedFinancePaths } from '../state/financePaths';
import { t } from '../i18n/strings';

/**
 * Das Vorschau-Ergebnis je Datei.
 *
 * Trug bis 2026-10-03 die snake_case-Form der `check-csv`-JSON-Ausgabe des
 * Python-Importers; seit die Vorschau im Plugin selbst läuft, ist es die Form
 * des Kerns (`core/import/preview`).
 */
export type CheckCsvResult = CsvPreviewResult;

export interface ImportCSVModalAccessor {
  loadData: () => Promise<PluginData>;
  saveData: (data: PluginData) => Promise<void>;
}

export interface ImportCSVModalDeps {
  /** Triggered after a successful import — should refresh open finance views. */
  onImportSuccess?: () => Promise<void>;
}


export class ImportCSVModal extends Modal {
  private files: File[] = [];
  private kontoZuordnung: Map<File, KontoSpec> = new Map();
  private previewData: Map<File, CheckCsvResult> = new Map();
  private konten: KontoSpec[] = [];
  private kontenConfig: KontenConfig | null = null;
  private fileListEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private actionsEl: HTMLElement | null = null;
  private importBtn: HTMLButtonElement | null = null;
  private previewBtn: HTMLButtonElement | null = null;

  constructor(
    app: App,
    private readonly accessor: ImportCSVModalAccessor,
    private readonly getPaths: () => ResolvedFinancePaths,
    private readonly deps: ImportCSVModalDeps = {},
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-import-csv-modal');
    contentEl.createEl('h3', { text: t('modal.importCsv.title') });

    const kontenDeps = { loadConfig: kontenSourceFor(this.app, this.getPaths().kontenFile) };
    try {
      this.kontenConfig = await loadKontenConfig(kontenDeps);
      this.konten = await loadKonten(kontenDeps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      contentEl.createEl('p', { text: t('notice.accountsLoadFailed', msg), cls: 'fl-error fl-fs-md' });
      return;
    }

    if (this.konten.length === 0) {
      contentEl.createEl('p', { text: t('modal.importCsv.noAccounts'), cls: 'fl-error fl-fs-md' });
      return;
    }

    const fileSetting = new Setting(contentEl)
      .setName(t('modal.importCsv.selectFiles.name'))
      .setDesc(t('modal.importCsv.selectFiles.desc'));
    const fileInput = fileSetting.controlEl.createEl('input', { type: 'file' });
    fileInput.setAttribute('multiple', 'multiple');
    fileInput.setAttribute('accept', '.CSV,.csv');
    fileInput.addEventListener('change', () => this.handleFileSelection(fileInput));

    // Die Bank bietet rund zehn Export-Formate an, verarbeitet wird eines davon.
    // Der Hinweis spart das Nachschlagen im Download-Menü.
    contentEl.createEl('p', { text: t('modal.importCsv.formatHint'), cls: 'fl-muted fl-fs-sm' });

    this.fileListEl = contentEl.createDiv({ cls: 'finance-import-csv-files fl-mt-2' });

    this.previewEl = contentEl.createDiv({ cls: 'finance-import-csv-preview' });

    this.actionsEl = contentEl.createDiv({ cls: 'fl-row-actions' });

    this.previewBtn = this.actionsEl.createEl('button', { text: t('modal.importCsv.previewBtn'), cls: 'fl-grow' });
    this.previewBtn.disabled = true;
    this.previewBtn.onclick = () => void this.runPreview();

    this.importBtn = this.actionsEl.createEl('button', { text: t('modal.importCsv.importBtn'), cls: 'fl-grow mod-cta' });
    this.importBtn.disabled = true;
    this.importBtn.onclick = () => void this.runImport();

    const cancelBtn = this.actionsEl.createEl('button', { text: t('common.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // ── File Selection ─────────────────────────────────────────────────────

  private handleFileSelection(input: HTMLInputElement): void {
    const fileList = input.files;
    if (!fileList) return;
    this.files = Array.from(fileList);
    this.kontoZuordnung.clear();
    this.previewData.clear();

    for (const file of this.files) {
      const detected = autoDetectKonto(file.name, this.konten);
      if (detected) this.kontoZuordnung.set(file, detected);
    }

    this.renderFileList();
    this.updateActionState();
  }

  private renderFileList(): void {
    if (!this.fileListEl) return;
    this.fileListEl.empty();
    if (this.files.length === 0) {
      this.fileListEl.createEl('p', { text: t('modal.importCsv.noFiles'), cls: 'fl-empty' });
      return;
    }

    for (const file of this.files) {
      const currentSelection = this.kontoZuordnung.get(file);
      new Setting(this.fileListEl)
        .setName(file.name)
        .addDropdown(dd => {
          dd.addOption('', t('modal.importCsv.selectAccountPlaceholder'));
          for (const k of this.konten) dd.addOption(k.id, `${k.id} (${k.bank})`);
          if (currentSelection) dd.setValue(currentSelection.id);
          dd.onChange(value => {
            const found = this.konten.find(k => k.id === value);
            if (found) this.kontoZuordnung.set(file, found);
            else this.kontoZuordnung.delete(file);
            this.previewData.delete(file);
            this.updateActionState();
            this.renderPreviewSection();
          });
        });
    }
  }

  private updateActionState(): void {
    const hasFiles = this.files.length > 0;
    const anyMapped = this.files.some(f => this.kontoZuordnung.has(f));
    // Die Vorschau braucht je Datei ein Konto (`check-csv --konto`) — mindestens eine
    // Zuordnung muss also stehen. Der Import selbst braucht die Zuordnung NICHT: er
    // reicht den Umsatz-Ordner an den Importer, der die Konten aus dem Dateiinhalt
    // liest. Ihn daran zu hindern, schützt nichts und blockiert nur.
    if (this.previewBtn) this.previewBtn.disabled = !hasFiles || !anyMapped;
    if (this.importBtn) this.importBtn.disabled = !hasFiles;
  }

  // ── Preview ────────────────────────────────────────────────────────────

  private async runPreview(): Promise<void> {
    // Kein Platform-Guard mehr: die Vorschau parst den Inhalt der gewählten Datei
    // im Plugin und vergleicht ihn gegen die CSVs im Umsatzordner — kein Subprozess,
    // keine Temp-Datei, also auch kein Grund, Mobilgeräte auszuschließen.
    if (!this.previewBtn || !this.importBtn) return;
    const konten = this.kontenConfig;
    if (!konten) return;
    this.previewBtn.disabled = true;
    this.importBtn.disabled = true;
    const originalText = this.previewBtn.textContent ?? t('modal.importCsv.previewBtn');
    this.previewBtn.textContent = t('modal.importCsv.checking');

    const vault = new ObsidianVaultPort(this.app);
    const umsatzDir = this.getPaths().umsatzDir;

    try {
      let skipped = 0;
      for (const file of this.files) {
        const konto = this.kontoZuordnung.get(file);
        if (!konto) {
          // Nicht blockieren: die übrigen Dateien bekommen trotzdem ihre Vorschau,
          // am Ende sagt eine Sammel-Notice, was ausgelassen wurde.
          skipped += 1;
          continue;
        }
        try {
          this.previewData.set(file, await previewCsv({
            vault,
            umsatzDir,
            incoming: { name: file.name, bytes: await file.arrayBuffer() },
            konto,
            konten,
          }));
        } catch (err) {
          new Notice(t('notice.previewFailed', file.name, err instanceof Error ? err.message : String(err)));
        }
      }
      if (skipped > 0) new Notice(t('notice.previewSkippedUnmapped', skipped));
      this.renderPreviewSection();
    } finally {
      this.previewBtn.disabled = false;
      // Der Import bleibt frei — er braucht die Zuordnung nicht (s. updateActionState).
      this.importBtn.disabled = false;
      this.previewBtn.textContent = originalText;
    }
  }

  private renderPreviewSection(): void {
    if (!this.previewEl) return;
    this.previewEl.empty();
    if (this.previewData.size === 0) {
      this.previewEl.createSpan({ text: t('modal.importCsv.noPreviewYet'), cls: 'fl-muted' });
      return;
    }
    for (const [file, result] of this.previewData) {
      const row = this.previewEl.createDiv({ cls: 'fl-py-1' });
      const range = result.dateRange;
      const summary = t(
        'modal.importCsv.previewSummary',
        file.name,
        result.neu,
        result.duplikate,
        range?.first ?? '—',
        range?.last ?? '—',
        result.kontoMatch,
      );
      row.createSpan({ text: summary });
      if (result.warnings.length > 0) {
        const warn = row.createDiv({ cls: 'fl-warning fl-fs-sm' });
        setIcon(warn.createSpan({ cls: 'fl-inline-icon' }), 'alert-triangle');
        warn.createSpan({ text: result.warnings.join('; ') });
      }
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────

  private async runImport(): Promise<void> {
    // Kein Platform-Guard mehr: die CSVs wandern über den Vault-Adapter in den
    // Umsatzordner und der Importlauf selbst ist der node-freie Kern. Der Weg über
    // den Python-Subprozess war der einzige Grund, warum der Import desktop-only war.
    if (!this.getPaths().isConfigured) {
      new Notice(notConfiguredMessage());
      return;
    }
    if (!this.importBtn || !this.previewBtn) return;
    this.importBtn.disabled = true;
    this.previewBtn.disabled = true;
    const originalText = this.importBtn.textContent ?? t('modal.importCsv.importBtn');
    this.importBtn.textContent = t('modal.importCsv.importing');

    try {
      const data = await this.accessor.loadData();

      // Über den Vault-Adapter schreiben statt über das Dateisystem: braucht weder
      // `basePath` noch `File.path` (seit Electron 32 weg) und bleibt vault-relativ.
      const adapter = this.app.vault.adapter;
      const targetDir = normalizePath(this.getPaths().umsatzDir);
      if (!(await adapter.exists(targetDir))) {
        await adapter.mkdir(targetDir);
      }

      let copied = 0;
      for (const file of this.files) {
        const dest = normalizePath(`${targetDir}/${file.name}`);
        await adapter.writeBinary(dest, await file.arrayBuffer());
        copied += 1;
      }

      // Die abgelegten CSVs sind jetzt Teil des Umsatzordners — der Lauf liest sie
      // dort, zusammen mit dem Bestand, und entdoppelt über Dateigrenzen hinweg.
      const result = await runNativeImport({ app: this.app, paths: this.getPaths() });

      const updated: PluginData = {
        ...data,
        lastReimportTimestamp: new Date().toISOString(),
        rulesAddedSinceReimport: 0,
      };
      await this.accessor.saveData(updated);

      // Die Zahlen stammen jetzt aus dem Lauf selbst, nicht mehr aus der Vorschau:
      // sie gelten für den gesamten Umsatzordner und sind damit die Wahrheit, an der
      // sich die geschriebenen Dateien messen lassen.
      new Notice(t('notice.importSuccess', t(
        'modal.importCsv.summary.withCounts',
        copied,
        result.transactionCount,
        result.duplicatesSkipped,
      )));
      if (result.incompleteRules.length > 0) {
        new Notice(t(
          'notice.rebuildIncompleteRules',
          String(result.incompleteRules.length),
          result.incompleteRules.join(', '),
        ));
      }
      this.close();
      if (this.deps.onImportSuccess) await this.deps.onImportSuccess();
    } catch (err) {
      new Notice(t('notice.importError', err instanceof Error ? err.message : String(err)));
    } finally {
      this.importBtn.disabled = false;
      this.previewBtn.disabled = false;
      this.importBtn.textContent = originalText;
    }
  }
}

// ── Pure helper (exported for tests) ─────────────────────────────────────

/** Ziffernfolgen unter 4 Stellen treffen zu leicht zufällig (Tag, Monat, Version). */
const MIN_MATCH_DIGITS = 4;

/**
 * Wie gut passt ein Konto zu einem Dateinamen? 0 = gar nicht, sonst die Anzahl der
 * belegenden Ziffern (längerer Treffer schlägt kürzeren).
 *
 * Verglichen werden **Ziffern**, nicht Zeichen. Der frühere Zeichenvergleich der letzten
 * 10 IBAN-Stellen traf keine einzige reale Datei: deutsche IBANs füllen die Kontonummer
 * links mit Nullen auf (`0000481907`), die Sparkasse-Dateinamen tragen sie ohne
 * (`…-481907-…`). Bei Kreditkarten kam hinzu, dass die Konfiguration mit Sternchen
 * maskiert (`4000 **** **** 0729`), der Dateiname aber mit Unterstrichen.
 */
function kontoMatchScore(iban: string, fileDigits: string): number {
  const ibanDigits = iban.replace(/\D/g, '');
  if (ibanDigits.length < MIN_MATCH_DIGITS) return 0;

  // Maskierte Kartennummer: nur der erste und letzte sichtbare Block stehen im Dateinamen.
  if (/[*_xX]{2,}/.test(iban)) {
    const head = ibanDigits.slice(0, 4);
    const tail = ibanDigits.slice(-4);
    const hit = head.length === 4 && tail.length === 4
      && fileDigits.includes(head) && fileDigits.includes(tail);
    return hit ? head.length + tail.length : 0;
  }

  // Reguläre IBAN: Kontonummer = letzte 10 Ziffern, ohne die auffüllenden Nullen.
  const kontonummer = ibanDigits.slice(-10).replace(/^0+/, '');
  if (kontonummer.length < MIN_MATCH_DIGITS) return 0;
  return fileDigits.includes(kontonummer) ? kontonummer.length : 0;
}

/**
 * Ordnet eine CSV anhand ihres Dateinamens einem Konto zu — reine Bequemlichkeit:
 * der Import selbst leitet die Konten aus dem Dateiinhalt ab, eine Fehlzuordnung hier
 * kann also keine falschen Buchungen erzeugen. Bei Gleichstand lieber nichts vorauswählen.
 */
export function autoDetectKonto(fileName: string, konten: KontoSpec[]): KontoSpec | null {
  const fileDigits = fileName.replace(/\D/g, '');
  if (!fileDigits) return null;

  let best = 0;
  let winners: KontoSpec[] = [];
  for (const k of konten) {
    const score = kontoMatchScore(k.iban, fileDigits);
    if (score === 0) continue;
    if (score > best) {
      best = score;
      winners = [k];
    } else if (score === best) {
      winners.push(k);
    }
  }
  return winners.length === 1 ? winners[0] : null;
}
