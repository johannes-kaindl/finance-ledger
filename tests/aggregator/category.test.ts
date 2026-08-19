import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLedger, type Transaction } from '../../src/parser/ledger';
import { aggregateCategoryTotals } from '../../src/aggregator/category';

function tx(account: string, amountEur: number): Transaction {
  return { date: '2025-01-01', counterparty: 'Test', tags: [], quelle: null, verwendungszweck: null, postings: [{ account, amountEur }] };
}

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/sample-journal.ledger'),
  'utf-8'
);

describe('A2.5 aggregateCategoryTotals', () => {
  const txs = parseLedger(FIXTURE);

  describe('prefix "Ausgaben:"', () => {
    // Nach F2.6-Fix: prefixFilter='Ausgaben:' → 1 Top-Level-Knoten "Ausgaben" mit Sub-Kategorien als Kinder
    const nodes = aggregateCategoryTotals(txs, 'Ausgaben:');
    const ausgaben = nodes[0];

    it('returns 1 top-level "Ausgaben" node', () => {
      expect(nodes).toHaveLength(1);
      expect(ausgaben.account).toBe('Ausgaben');
    });

    it('Ausgaben has 5 sub-category children', () => {
      expect(ausgaben.children).toHaveLength(5);
    });

    it('children are sorted by totalEur descending', () => {
      const ch = ausgaben.children!;
      for (let i = 0; i < ch.length - 1; i++) {
        expect(ch[i].totalEur).toBeGreaterThanOrEqual(ch[i + 1].totalEur);
      }
    });

    it('Kommunikation is highest-totalEur child', () => {
      expect(ausgaben.children![0].account).toBe('Ausgaben:Kommunikation');
      expect(ausgaben.children![0].totalEur).toBeCloseTo(110.67, 2);
    });

    it('Unkategorisiert child has negative totalEur', () => {
      const unk = ausgaben.children!.find(n => n.account === 'Ausgaben:Unkategorisiert');
      expect(unk).toBeDefined();
      expect(unk!.totalEur).toBeCloseTo(-60.00, 2);
    });

    it('percentOfTotal is set on the Ausgaben node', () => {
      expect(typeof ausgaben.percentOfTotal).toBe('number');
    });

    it('sub-category sum equals parent totalEur (recursive)', () => {
      function check(node: { totalEur: number; children?: typeof node[] }): void {
        if (node.children && node.children.length > 0) {
          const childSum = node.children.reduce((a, c) => a + c.totalEur, 0);
          expect(childSum).toBeCloseTo(node.totalEur, 2);
          node.children.forEach(check);
        }
      }
      check(ausgaben);
    });

    it('Kommunikation has Festnetz child hierarchy', () => {
      const komm = ausgaben.children!.find(n => n.account === 'Ausgaben:Kommunikation')!;
      expect(komm.children?.length).toBeGreaterThanOrEqual(1);
      const festnetz = komm.children?.find(c => c.account === 'Ausgaben:Kommunikation:Festnetz');
      expect(festnetz).toBeDefined();
      expect(festnetz!.totalEur).toBeCloseTo(110.67, 2);
    });
  });

  describe('prefix "Einnahmen:"', () => {
    // Nach F2.6-Fix: 1 Top-Level-Knoten "Einnahmen" mit Sub-Kategorien als Kinder
    const nodes = aggregateCategoryTotals(txs, 'Einnahmen:');
    const einnahmen = nodes[0];

    it('returns 1 top-level "Einnahmen" node', () => {
      expect(nodes).toHaveLength(1);
      expect(einnahmen.account).toBe('Einnahmen');
    });

    it('Krankengeld is a child with negative totalEur (Einnahmen-Konvention)', () => {
      const kg = einnahmen.children?.find(n => n.account === 'Einnahmen:Krankengeld');
      expect(kg).toBeDefined();
      expect(kg!.totalEur).toBeCloseTo(-1418.88, 2);
    });
  });

  describe('prefix "" (alle)', () => {
    const nodes = aggregateCategoryTotals(txs, '');

    it('returns top-level account segments (Aktiva, Ausgaben, Einnahmen)', () => {
      expect(nodes.length).toBeGreaterThanOrEqual(3);
      const names = nodes.map(n => n.account);
      expect(names).toContain('Aktiva');
      expect(names).toContain('Ausgaben');
      expect(names).toContain('Einnahmen');
    });
  });

  it('returns empty array for empty transaction list', () => {
    expect(aggregateCategoryTotals([], 'Ausgaben:')).toEqual([]);
  });
});

describe('F2.5 Tree-Konsolidierung — Bug-Reproduce (muss vor Fix ROT sein)', () => {
  const txs = [
    tx('Ausgaben:Wohnen:Privat:Strom_EnBW', 10),
    tx('Ausgaben:Wohnen:Privat:Strom_EnBW', 20),
    tx('Ausgaben:Wohnen:Privat:Strom_EON', 30),
    tx('Ausgaben:Wohnen:Vermietung:HC24', 40),
    tx('Ausgaben:Versicherung:KFZ:VW', 50),
  ];

  it('liefert genau 1 Top-Level-Knoten "Ausgaben"', () => {
    const nodes = aggregateCategoryTotals(txs, 'Ausgaben:');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].account).toBe('Ausgaben');
  });

  it('Ausgaben-Knoten hat totalEur = 150', () => {
    const nodes = aggregateCategoryTotals(txs, 'Ausgaben:');
    expect(nodes[0].totalEur).toBeCloseTo(150, 2);
  });

  it('Ausgaben-Knoten hat genau 2 Kinder (Wohnen, Versicherung)', () => {
    const nodes = aggregateCategoryTotals(txs, 'Ausgaben:');
    expect(nodes[0].children).toHaveLength(2);
    const childAccounts = nodes[0].children!.map(c => c.account);
    expect(childAccounts).toContain('Ausgaben:Wohnen');
    expect(childAccounts).toContain('Ausgaben:Versicherung');
  });

  it('Wohnen hat 2 Kinder (Privat 60, Vermietung 40)', () => {
    const nodes = aggregateCategoryTotals(txs, 'Ausgaben:');
    const wohnen = nodes[0].children!.find(c => c.account === 'Ausgaben:Wohnen')!;
    expect(wohnen.totalEur).toBeCloseTo(100, 2);
    expect(wohnen.children).toHaveLength(2);
    const privat = wohnen.children!.find(c => c.account === 'Ausgaben:Wohnen:Privat')!;
    expect(privat.totalEur).toBeCloseTo(60, 2);
    const vermietung = wohnen.children!.find(c => c.account === 'Ausgaben:Wohnen:Vermietung')!;
    expect(vermietung.totalEur).toBeCloseTo(40, 2);
  });

  it('Strom_EnBW aggregiert 2 Postings zu 30', () => {
    const nodes = aggregateCategoryTotals(txs, 'Ausgaben:');
    const wohnen = nodes[0].children!.find(c => c.account === 'Ausgaben:Wohnen')!;
    const privat = wohnen.children!.find(c => c.account === 'Ausgaben:Wohnen:Privat')!;
    const strom = privat.children!.find(c => c.account === 'Ausgaben:Wohnen:Privat:Strom_EnBW')!;
    expect(strom.totalEur).toBeCloseTo(30, 2);
    expect(strom.postingCount).toBe(2);
  });
});

describe('percentOfTotal — division-by-zero guard (net-zero totals)', () => {
  // Two expense sub-categories that cancel out → the "Ausgaben" top-level total
  // is exactly 0. Without the grandTotal!==0 / node.totalEur!==0 guards, the
  // percentage would be 0/0 = NaN and poison the view.
  const txs = [tx('Ausgaben:A', 50), tx('Ausgaben:B', -50)];

  it('top-level percentOfTotal is 0, not NaN, when the grand total is zero', () => {
    const nodes = aggregateCategoryTotals(txs, '');
    const ausgaben = nodes.find(n => n.account === 'Ausgaben')!;
    expect(ausgaben.totalEur).toBe(0);
    expect(Number.isNaN(ausgaben.percentOfTotal)).toBe(false);
    expect(ausgaben.percentOfTotal).toBe(0);
  });

  it('child percentOfTotal is 0, not NaN, when the parent total is zero', () => {
    const nodes = aggregateCategoryTotals(txs, '');
    const ausgaben = nodes.find(n => n.account === 'Ausgaben')!;
    for (const child of ausgaben.children ?? []) {
      expect(Number.isNaN(child.percentOfTotal)).toBe(false);
      expect(child.percentOfTotal).toBe(0);
    }
  });
});
