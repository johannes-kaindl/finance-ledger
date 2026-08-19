import { it, expect, describe } from 'vitest';
import {
  filterTbcTransactions,
  filterTbcCounterpartiesWithoutRule,
  groupTbcByCounterparty,
  groupTbcAmount,
  previewMatchCount,
  buildImporterCommand,
  summarizeStderr,
} from '../../src/views/helpers';
import type { Transaction } from '../../src/parser/ledger';

function makeTx(
  counterparty: string,
  tags: string[],
  amountEur = 10.0,
): Transaction {
  return {
    date: '2025-08-01',
    counterparty,
    description: counterparty,
    tags,
    postings: [
      { account: 'Aktiva:Bank', amountEur: -amountEur, currency: 'EUR' },
      { account: 'Ausgaben:Test', amountEur: amountEur, currency: 'EUR' },
    ],
  };
}

const FIXTURES: Transaction[] = [
  makeTx('Edeka', ['tbc'], 25.0),
  makeTx('REWE', ['tbc'], 30.0),
  makeTx('Telekom', ['recurring'], 39.95),
  makeTx('Edeka Filiale 2', ['tbc'], 15.0),
  makeTx('Amazon', [], 99.0),
];

describe('filterTbcTransactions', () => {
  it('returns only tbc-tagged transactions', () => {
    const result = filterTbcTransactions(FIXTURES);
    expect(result).toHaveLength(3);
    expect(result.every(tx => tx.tags.includes('tbc'))).toBe(true);
  });

  it('returns empty array when no tbc transactions', () => {
    const nonTbc = FIXTURES.filter(tx => !tx.tags.includes('tbc'));
    expect(filterTbcTransactions(nonTbc)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterTbcTransactions([])).toHaveLength(0);
  });
});

describe('groupTbcByCounterparty', () => {
  it('groups by counterparty name', () => {
    const tbcTxs = filterTbcTransactions(FIXTURES);
    const grouped = groupTbcByCounterparty(tbcTxs);
    // 3 unique counterparties in tbc fixtures: Edeka, REWE, Edeka Filiale 2
    expect(grouped.size).toBe(3);
    expect(grouped.has('Edeka')).toBe(true);
    expect(grouped.has('REWE')).toBe(true);
    expect(grouped.has('Edeka Filiale 2')).toBe(true);
  });

  it('groups all matching counterparty txs together', () => {
    const txs = [makeTx('REWE', ['tbc']), makeTx('REWE', ['tbc']), makeTx('Edeka', ['tbc'])];
    const grouped = groupTbcByCounterparty(txs);
    expect(grouped.get('REWE')).toHaveLength(2);
    expect(grouped.get('Edeka')).toHaveLength(1);
  });

  it('result is deterministic (insertion order preserved)', () => {
    const txs = [makeTx('Z', ['tbc']), makeTx('A', ['tbc']), makeTx('M', ['tbc'])];
    const grouped = groupTbcByCounterparty(txs);
    const keys = [...grouped.keys()];
    expect(keys).toEqual(['Z', 'A', 'M']);
  });

  it('empty input → empty map', () => {
    expect(groupTbcByCounterparty([])).toEqual(new Map());
  });
});

describe('groupTbcAmount', () => {
  it('sums the positive postings across a counterparty group', () => {
    // makeTx puts +amount on Ausgaben and -amount on Aktiva:Bank.
    const group = [makeTx('Edeka', ['tbc'], 25.0), makeTx('Edeka', ['tbc'], 15.0)];
    expect(groupTbcAmount(group)).toBeCloseTo(40.0, 2);
  });

  it('ignores negative (bank-side) postings', () => {
    // A single tx contributes only its +25 leg, not the -25 leg.
    expect(groupTbcAmount([makeTx('REWE', ['tbc'], 25.0)])).toBeCloseTo(25.0, 2);
  });

  it('empty group → 0', () => {
    expect(groupTbcAmount([])).toBe(0);
  });
});

describe('filterTbcCounterpartiesWithoutRule', () => {
  it('returns all tbc txs when rules list is empty', () => {
    const result = filterTbcCounterpartiesWithoutRule(FIXTURES, []);
    expect(result).toHaveLength(3);
    expect(result.every(tx => tx.tags.includes('tbc'))).toBe(true);
  });

  it('excludes tbc tx where counterparty substring-matches rule pattern', () => {
    const rules = [{ pattern: 'edeka', aliases: [] }];
    const result = filterTbcCounterpartiesWithoutRule(FIXTURES, rules);
    expect(result).toHaveLength(1);
    expect(result[0].counterparty).toBe('REWE');
  });

  it('excludes tbc tx where counterparty matches an alias', () => {
    const rules = [{ pattern: 'supermarket', aliases: ['rewe'] }];
    const result = filterTbcCounterpartiesWithoutRule(FIXTURES, rules);
    expect(result.some(tx => tx.counterparty === 'REWE')).toBe(false);
  });

  it('non-tbc txs are never in result regardless of rule match', () => {
    const rules = [{ pattern: 'telekom', aliases: [] }];
    const result = filterTbcCounterpartiesWithoutRule(FIXTURES, rules);
    expect(result.every(tx => tx.tags.includes('tbc'))).toBe(true);
    expect(result.some(tx => tx.counterparty === 'Telekom')).toBe(false);
  });

  it('pattern matching is case-insensitive', () => {
    const rules = [{ pattern: 'EDEKA', aliases: [] }];
    const result = filterTbcCounterpartiesWithoutRule(FIXTURES, rules);
    expect(result.some(tx => tx.counterparty.toLowerCase().includes('edeka'))).toBe(false);
  });

  it('empty input → empty output', () => {
    const result = filterTbcCounterpartiesWithoutRule([], [{ pattern: 'edeka', aliases: [] }]);
    expect(result).toHaveLength(0);
  });
});

describe('previewMatchCount', () => {
  it('counts tbc and non-tbc matches separately', () => {
    const result = previewMatchCount('edeka', FIXTURES);
    expect(result.tbcMatches).toBe(2); // Edeka + Edeka Filiale 2
    expect(result.nonTbcMatches).toBe(0);
  });

  it('non-tbc matches counted as side-effect warning', () => {
    const result = previewMatchCount('telekom', FIXTURES);
    expect(result.tbcMatches).toBe(0);
    expect(result.nonTbcMatches).toBe(1);
  });

  it('case-insensitive matching', () => {
    const result = previewMatchCount('REWE', FIXTURES);
    expect(result.tbcMatches).toBe(1);
  });

  it('empty pattern → zero matches', () => {
    const result = previewMatchCount('', FIXTURES);
    expect(result.tbcMatches).toBe(0);
    expect(result.nonTbcMatches).toBe(0);
  });

  it('pattern with no matches → zero matches', () => {
    const result = previewMatchCount('nichtvorhanden', FIXTURES);
    expect(result.tbcMatches).toBe(0);
    expect(result.nonTbcMatches).toBe(0);
  });
});

describe('buildImporterCommand', () => {
  // Regression: der Copy-Befehl im Import-Fehler-Modal hatte den Importer-Pfad des
  // Maintainers hartcodiert (SSOT-Verletzung + Publikations-Blocker). Er muss aus
  // der Einstellung kommen.
  it('baut den Befehl aus dem konfigurierten Pfad', () => {
    expect(buildImporterCommand('/srv/finance-ledger-importer'))
      .toBe('cd /srv/finance-ledger-importer && uv run python -m importer.cli');
  });

  it('quotet Pfade mit Leerzeichen shell-sicher', () => {
    expect(buildImporterCommand('/Users/x/My Repos/importer'))
      .toBe("cd '/Users/x/My Repos/importer' && uv run python -m importer.cli");
  });

  it('fällt bei leerem Pfad auf einen sichtbaren Platzhalter zurück, nie auf einen echten Pfad', () => {
    const cmd = buildImporterCommand('');
    expect(cmd).toContain('<');
    expect(cmd).not.toContain('/Users/');
  });

  it('enthält keinen maintainer-lokalen Pfad', () => {
    expect(buildImporterCommand('/srv/importer')).not.toContain('20_Claude');
  });
});

describe('summarizeStderr', () => {
  // Regression: bei einem Python-Traceback landeten ~40 Zeilen Stack in einer
  // Obsidian-Notice — die eigentliche Meldung stand ganz unten und war unlesbar.
  it('zieht die Schlusszeile aus einem Python-Traceback', () => {
    const stderr = [
      'Traceback (most recent call last):',
      '  File "<frozen runpy>", line 198, in _run_module_as_main',
      '  File "/pfad/cli.py", line 91, in _parse_csv',
      '    return PARSERS[schema](f)',
      'ValueError: CAMT52 Header passt nicht zu Erwartung in x.CSV',
    ].join('\n');
    const out = summarizeStderr(stderr);
    expect(out).toContain('CAMT52 Header passt nicht');
    expect(out).not.toContain('Traceback');
    expect(out).not.toContain('_run_module_as_main');
  });

  it('lässt eine bereits saubere einzeilige Meldung unverändert', () => {
    const msg = 'Falsches Dateiformat in x.CSV. Beim Bank-Download „Excel (CSV-CAMT V8)" wählen.';
    expect(summarizeStderr(msg)).toBe(msg);
  });

  it('ignoriert Leerzeilen am Ende', () => {
    expect(summarizeStderr('Fehler: kaputt\n\n\n')).toBe('Fehler: kaputt');
  });

  it('deckelt übermäßig lange Ausgaben', () => {
    const out = summarizeStderr('x'.repeat(5000));
    expect(out.length).toBeLessThanOrEqual(600);
  });

  it('liefert bei leerem stderr einen leeren String statt undefined', () => {
    expect(summarizeStderr('')).toBe('');
    expect(summarizeStderr('   \n  ')).toBe('');
  });

  it('behält mehrzeilige Meldungen ohne Traceback bei', () => {
    const msg = 'Zeile eins\nZeile zwei';
    expect(summarizeStderr(msg)).toContain('Zeile zwei');
  });
});
