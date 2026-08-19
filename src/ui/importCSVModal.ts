import { App, Modal, Notice, Platform, Setting, normalizePath, setIcon } from 'obsidian';
import { runImporter, FULL_IMPORT_ARGS } from '../categorizer-rules/spawnImporter';
import { loadKonten, type KontoSpec } from '../state/konten';
import type { PluginData } from '../types/plugin-data';
import { notConfiguredMessage, importerEnvFor, type ResolvedFinancePaths } from '../state/financePaths';
import { summarizeStderr } from '../views/helpers';
import { t } from '../i18n/strings';

export interface CheckCsvResult {
  new: number;
  duplicate: number;
  first_date: string;
  last_date: string;
  konto_match: string;
  warnings: string[];
}

export interface ImportCSVModalAccessor {
  loadData: () => Promise<PluginData>;
  saveData: (data: PluginData) => Promise<void>;
}

export interface ImportCSVModalDeps {
  /** Triggered after a successful import — should refresh open finance views. */
  onImportSuccess?: () => Promise<void>;
}

const PREVIEW_TIMEOUT_MS = 10_000;
const IMPORT_TIMEOUT_MS = 120_000;

/**
 * Der Importer ist ein Python-Prozess und braucht einen echten Dateipfad — ein `File` aus
 * dem Datei-Dialog hat aber keinen: Electron hat die `File.path`-Erweiterung in Version 32
 * entfernt (Obsidian 1.12.4 läuft auf Electron 39), und Workspace-Konvention ist ohnehin,
 * sie nie zu lesen (REGISTRY: "File.path nie lesen"). Also legen wir für die Vorschau eine
 * kurzlebige Kopie außerhalb des Vaults an und räumen sie danach wieder ab — im Vault darf
 * sie nicht landen, sonst zöge eine bloß *angesehene* CSV beim nächsten Import mit ein.
 */
async function withTempCopy<T>(file: File, fn: (absPath: string) => Promise<T>): Promise<T> {
  const { mkdtemp, writeFile, rm } = await import('fs/promises');
  const os = (await import('os')).default;
  const path = (await import('path')).default;

  const dir = await mkdtemp(path.join(os.tmpdir(), 'finance-ledger-'));
  try {
    const target = path.join(dir, file.name);
    await writeFile(target, new Uint8Array(await file.arrayBuffer()));
    return await fn(target);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export class ImportCSVModal extends Modal {
  private files: File[] = [];
  private kontoZuordnung: Map<File, KontoSpec> = new Map();
  private previewData: Map<File, CheckCsvResult> = new Map();
  private konten: KontoSpec[] = [];
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

    const data = await this.accessor.loadData();

    try {
      this.konten = await loadKonten({
        importerCwd: data.importerCwd,
        uvBinaryPath: data.uvBinaryPath || null,
      });
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
    // Desktop-only: die Vorschau startet den Importer als Subprozess und legt dafür eine
    // Temp-Datei an — beides gibt es auf Mobile nicht.
    if (!Platform.isDesktop) {
      new Notice(t('notice.importCsvDesktopOnlyShort'));
      return;
    }
    if (!this.previewBtn || !this.importBtn) return;
    this.previewBtn.disabled = true;
    this.importBtn.disabled = true;
    const originalText = this.previewBtn.textContent ?? t('modal.importCsv.previewBtn');
    this.previewBtn.textContent = t('modal.importCsv.checking');

    const data = await this.accessor.loadData();

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
        const result = await withTempCopy(file, absPath => runImporter(
          data.importerCwd,
          data.uvBinaryPath || null,
          PREVIEW_TIMEOUT_MS,
          undefined,
          ['check-csv', '--file', absPath, '--konto', konto.iban],
          importerEnvFor(this.app, this.getPaths()),
        ));
        if (result.exitCode !== 0) {
          new Notice(t('notice.previewFailed', file.name, summarizeStderr(result.stderr)));
          continue;
        }
        try {
          this.previewData.set(file, JSON.parse(result.stdout) as CheckCsvResult);
        } catch (err) {
          new Notice(t('notice.previewParseError', file.name, err instanceof Error ? err.message : String(err)));
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
      this.previewEl.createEl('span', { text: t('modal.importCsv.noPreviewYet'), cls: 'fl-muted' });
      return;
    }
    for (const [file, result] of this.previewData) {
      const row = this.previewEl.createDiv({ cls: 'fl-py-1' });
      const summary = t(
        'modal.importCsv.previewSummary',
        file.name, result.new, result.duplicate, result.first_date, result.last_date, result.konto_match,
      );
      row.createEl('span', { text: summary });
      if (result.warnings.length > 0) {
        const warn = row.createEl('div', { cls: 'fl-warning fl-fs-sm' });
        setIcon(warn.createSpan({ cls: 'fl-inline-icon' }), 'alert-triangle');
        warn.createSpan({ text: result.warnings.join('; ') });
      }
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────

  private async runImport(): Promise<void> {
    // Desktop-only (filesystem copy + subprocess). Guard = Mobile-Safety + macht
    // die dynamischen Node-Imports unten für eslint (no-nodejs-modules) erlaubt.
    if (!Platform.isDesktop) {
      new Notice(t('notice.importCsvDesktopOnlyShort'));
      return;
    }
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

      const result = await runImporter(
        data.importerCwd,
        data.uvBinaryPath || null,
        IMPORT_TIMEOUT_MS,
        undefined,
        [...FULL_IMPORT_ARGS],
        importerEnvFor(this.app, this.getPaths()),
      );

      if (result.exitCode === 0) {
        const updated: PluginData = {
          ...data,
          lastReimportTimestamp: new Date().toISOString(),
          rulesAddedSinceReimport: 0,
        };
        await this.accessor.saveData(updated);
        const newTotal = this.previewData.size > 0
          ? Array.from(this.previewData.values()).reduce((s, r) => s + r.new, 0)
          : null;
        const dupTotal = this.previewData.size > 0
          ? Array.from(this.previewData.values()).reduce((s, r) => s + r.duplicate, 0)
          : null;
        const summary = newTotal !== null && dupTotal !== null
          ? t('modal.importCsv.summary.withCounts', copied, newTotal, dupTotal)
          : t('modal.importCsv.summary.withoutCounts', copied, Math.round(result.durationMs / 1000));
        new Notice(t('notice.importSuccess', summary));
        this.close();
        if (this.deps.onImportSuccess) await this.deps.onImportSuccess();
      } else {
        new Notice(t('notice.importerFailed', summarizeStderr(result.stderr)));
      }
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
