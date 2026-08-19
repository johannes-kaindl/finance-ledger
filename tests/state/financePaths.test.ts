import { describe, it, expect } from 'vitest';
import {
  resolveFinancePaths,
  migrateFinanceRoot,
  DEFAULT_PATH_SETTINGS,
  LEGACY_DEFAULT_ROOT,
  type FinancePathSettings,
} from '../../src/state/financePaths';
import { TFolder } from 'obsidian';

const withRoot = (root: string): FinancePathSettings => ({ ...DEFAULT_PATH_SETTINGS, financeRoot: root });

describe('resolveFinancePaths', () => {
  it('empty root → isConfigured=false and empty paths', () => {
    const p = resolveFinancePaths(DEFAULT_PATH_SETTINGS);
    expect(p.isConfigured).toBe(false);
    expect(p.journal).toBe('');
    expect(p.rulesFolder).toBe('');
  });

  it('whitespace-only root counts as not configured', () => {
    expect(resolveFinancePaths(withRoot('   ')).isConfigured).toBe(false);
  });

  it('derives all sub-paths by convention from the root', () => {
    const p = resolveFinancePaths(withRoot('Finance'));
    expect(p.isConfigured).toBe(true);
    expect(p.root).toBe('Finance');
    expect(p.journal).toBe('Finance/Ledger/journal.ledger');
    expect(p.openingBalances).toBe('Finance/Ledger/opening_balances.ledger');
    expect(p.accounts).toBe('Finance/Ledger/accounts.ledger');
    expect(p.rulesFolder).toBe('Finance/55-Categorizer-Rules');
    expect(p.basesFolder).toBe('Finance/05-Bases');
    expect(p.kategorienFolder).toBe('Finance/45-Kategorien');
    expect(p.empfaengerFolder).toBe('Finance/60-Empfänger');
    expect(p.umsatzDir).toBe('Finance/Umsätze');
    expect(p.kontenFile).toBe('Finance/konten.yaml');
    expect(p.vertraegeFile).toBe('Finance/vertraege.yaml');
  });

  it('respects an override for the contracts file', () => {
    const p = resolveFinancePaths({ ...DEFAULT_PATH_SETTINGS, financeRoot: 'F', vertraegeFile: 'meine-vertraege.yaml' });
    expect(p.vertraegeFile).toBe('F/meine-vertraege.yaml');
  });

  it('respects per-subfolder overrides', () => {
    const p = resolveFinancePaths({ ...DEFAULT_PATH_SETTINGS, financeRoot: 'F', ledgerSubdir: 'led', journalFile: 'j.ledger' });
    expect(p.journal).toBe('F/led/j.ledger');
  });
});

function fakeApp(existingFolderPath: string | null) {
  return {
    vault: {
      getAbstractFileByPath: (p: string) => {
        if (p === existingFolderPath) { const f = new TFolder(); f.path = p; return f; }
        return null;
      },
    },
  } as unknown as import('obsidian').App;
}

describe('migrateFinanceRoot', () => {
  it('sets financeRoot to the legacy folder when present and root is empty', () => {
    const s = { ...DEFAULT_PATH_SETTINGS };
    const changed = migrateFinanceRoot(fakeApp(LEGACY_DEFAULT_ROOT), s);
    expect(changed).toBe(true);
    expect(s.financeRoot).toBe(LEGACY_DEFAULT_ROOT);
  });

  it('does nothing when legacy folder is absent', () => {
    const s = { ...DEFAULT_PATH_SETTINGS };
    expect(migrateFinanceRoot(fakeApp(null), s)).toBe(false);
    expect(s.financeRoot).toBe('');
  });

  it('does not overwrite an already-configured root', () => {
    const s = { ...DEFAULT_PATH_SETTINGS, financeRoot: 'My/Finance' };
    expect(migrateFinanceRoot(fakeApp(LEGACY_DEFAULT_ROOT), s)).toBe(false);
    expect(s.financeRoot).toBe('My/Finance');
  });
});
