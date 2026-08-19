import { normalizePath, TFolder, type App } from 'obsidian';
import { t } from '../i18n/strings';

export interface FinancePathSettings {
  financeRoot: string;
  ledgerSubdir: string;
  journalFile: string;
  openingBalancesFile: string;
  accountsFile: string;
  rulesSubdir: string;
  basesSubdir: string;
  kategorienSubdir: string;
  empfaengerSubdir: string;
  umsatzSubdir: string;
  /** Konten-Konfiguration, relativ zum Finanzordner. */
  kontenFile: string;
  /** Vertrags-Konfiguration, relativ zum Finanzordner. Optional — fehlt sie, entstehen keine Vertrags-Notizen. */
  vertraegeFile: string;
}

export interface ResolvedFinancePaths {
  isConfigured: boolean;
  root: string;
  journal: string;
  openingBalances: string;
  accounts: string;
  rulesFolder: string;
  basesFolder: string;
  kategorienFolder: string;
  empfaengerFolder: string;
  umsatzDir: string;
  kontenFile: string;
  vertraegeFile: string;
}

/** Vault-relative path of the author's original folder — used for auto-detect migration. */
export const LEGACY_DEFAULT_ROOT = '20_Projekte/02-Aktiv/26-011 Finanzplan erstellen';

/** Shown in views when no finance root is configured. */
export function notConfiguredMessage(): string {
  return t('common.notConfigured');
}

export const DEFAULT_PATH_SETTINGS: FinancePathSettings = {
  financeRoot: '',
  ledgerSubdir: 'Ledger',
  journalFile: 'journal.ledger',
  openingBalancesFile: 'opening_balances.ledger',
  accountsFile: 'accounts.ledger',
  rulesSubdir: '55-Categorizer-Rules',
  basesSubdir: '05-Bases',
  kategorienSubdir: '45-Kategorien',
  empfaengerSubdir: '60-Empfänger',
  umsatzSubdir: 'Umsätze',
  kontenFile: 'konten.yaml',
  vertraegeFile: 'vertraege.yaml',
};

const EMPTY: ResolvedFinancePaths = {
  isConfigured: false, root: '', journal: '', openingBalances: '', accounts: '',
  rulesFolder: '', basesFolder: '', kategorienFolder: '', empfaengerFolder: '', umsatzDir: '',
  kontenFile: '', vertraegeFile: '',
};

export function resolveFinancePaths(s: FinancePathSettings): ResolvedFinancePaths {
  const root = s.financeRoot.trim();
  if (root === '') return { ...EMPTY };
  const join = (...parts: string[]): string => normalizePath(parts.join('/'));
  const ledgerDir = `${root}/${s.ledgerSubdir}`;
  return {
    isConfigured: true,
    root: normalizePath(root),
    journal: join(ledgerDir, s.journalFile),
    openingBalances: join(ledgerDir, s.openingBalancesFile),
    accounts: join(ledgerDir, s.accountsFile),
    rulesFolder: join(root, s.rulesSubdir),
    basesFolder: join(root, s.basesSubdir),
    kategorienFolder: join(root, s.kategorienSubdir),
    empfaengerFolder: join(root, s.empfaengerSubdir),
    umsatzDir: join(root, s.umsatzSubdir),
    kontenFile: join(root, s.kontenFile),
    vertraegeFile: join(root, s.vertraegeFile),
  };
}

/**
 * One-time auto-detect: if no root configured but the author's legacy folder
 * exists in this vault, adopt it. Mutates `settings`; returns true if changed.
 */
export function migrateFinanceRoot(app: App, settings: FinancePathSettings): boolean {
  if (settings.financeRoot.trim() !== '') return false;
  const f = app.vault.getAbstractFileByPath(LEGACY_DEFAULT_ROOT);
  if (f instanceof TFolder) {
    settings.financeRoot = LEGACY_DEFAULT_ROOT;
    return true;
  }
  return false;
}

/**
 * Umgebungsvariablen, die der Importer-Subprozess braucht, um im richtigen Vault zu
 * arbeiten. Ohne sie fällt er auf `~/ObsidianVault/Finanzplan` zurück: die
 * Vergleichsbasis für die Duplikat-Erkennung ist dann leer (jede Buchung gilt als
 * neu) und Journal wie Notizen landen außerhalb des Vaults — beides ohne Fehlermeldung.
 *
 * Absichtlich leer, wenn etwas fehlt: die bestehende Umgebung unverändert zu lassen
 * ist harmloser, als den Prozess auf ein halb geratenes Ziel zu schicken.
 */
export function buildImporterEnv(
  vaultBasePath: string,
  financeRootRel: string,
): Record<string, string> {
  const base = vaultBasePath.replace(/\/+$/, '');
  const root = financeRootRel.trim().replace(/^\/+|\/+$/g, '');
  if (!base || !root) return {};
  return {
    FINANCE_VAULT: `${base}/${root}`,
    FINANCE_VAULT_PREFIX: root,
  };
}

/**
 * Bequemer Zugriff auf {@link buildImporterEnv} aus einer View heraus.
 * `basePath` gibt es nur auf dem Desktop (FileSystemAdapter) — dort läuft der
 * Importer ohnehin als einziger.
 */
export function importerEnvFor(app: App, paths: ResolvedFinancePaths): Record<string, string> {
  const basePath = (app.vault.adapter as { basePath?: string }).basePath ?? '';
  return buildImporterEnv(basePath, paths.root);
}
