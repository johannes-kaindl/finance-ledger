import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLedger } from '../../src/parser/ledger';
import { aggregateAccountSaldos } from '../../src/aggregator/saldo';

const FIXTURE = readFileSync(
  join(__dirname, '../fixtures/sample-journal.ledger'),
  'utf-8'
);

describe('A2.3 aggregateAccountSaldos', () => {
  const txs = parseLedger(FIXTURE);
  const saldos = aggregateAccountSaldos(txs);

  it('returns only Aktiva: accounts', () => {
    expect(saldos.length).toBeGreaterThanOrEqual(2);
    saldos.forEach(s => expect(s.account).toMatch(/^Aktiva:/));
  });

  it('includes Sparkasse Hauptkonto with correct sum', () => {
    const hk = saldos.find(s => s.account === 'Aktiva:Bank:Sparkasse:Hauptkonto');
    expect(hk).toBeDefined();
    // 7 Postings: -9.46 -42.86 +60.00 -2264.18 +1418.88 -17.99 -110.67 = -966.28
    expect(hk!.saldoEur).toBeCloseTo(-966.28, 2);
    expect(hk!.postingCount).toBe(7);
  });

  it('includes Sparkasse Visa with correct sum', () => {
    const visa = saldos.find(s => s.account === 'Aktiva:Bank:Sparkasse:Visa');
    expect(visa).toBeDefined();
    expect(visa!.saldoEur).toBeCloseTo(2264.18, 2);
    expect(visa!.postingCount).toBe(1);
  });

  it('is sorted by saldoEur descending', () => {
    for (let i = 0; i < saldos.length - 1; i++) {
      expect(saldos[i].saldoEur).toBeGreaterThanOrEqual(saldos[i + 1].saldoEur);
    }
  });

  it('lastDate is a valid ISO date', () => {
    saldos.forEach(s => expect(s.lastDate).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('returns empty array for empty transaction list', () => {
    expect(aggregateAccountSaldos([])).toEqual([]);
  });
});

describe('F2.4 Visa-Saldo-Diagnose', () => {
  it('Visa-Account: Sammel-Lastschrift +100 minus Kauf -30 ergibt saldoEur = +70', () => {
    const txs = [
      {
        date: '2025-08-01', counterparty: 'Sammel-Lastschrift', tags: [], quelle: null, verwendungszweck: null,
        postings: [
          { account: 'Aktiva:Bank:Sparkasse:Hauptkonto', amountEur: -100 },
          { account: 'Aktiva:Kredit:Visa', amountEur: 100 },
        ],
      },
      {
        date: '2025-08-05', counterparty: 'Visa-Kauf', tags: [], quelle: null, verwendungszweck: null,
        postings: [
          { account: 'Aktiva:Kredit:Visa', amountEur: -30 },
          { account: 'Ausgaben:Foo', amountEur: 30 },
        ],
      },
    ];
    const result = aggregateAccountSaldos(txs);
    const visa = result.find(s => s.account === 'Aktiva:Kredit:Visa');
    expect(visa).toBeDefined();
    expect(visa!.saldoEur).toBeCloseTo(70, 2);
  });
});

// --- Slice-8 Burst-B: Stand-Am-aware Saldo ---

describe('Stand-Am-aware Saldo (Slice-8 Burst-B)', () => {
  function tx(date: string, account: string, amount: number) {
    return {
      date,
      counterparty: 'T',
      tags: [],
      quelle: null,
      verwendungszweck: null,
      postings: [
        { account, amountEur: amount },
        { account: 'Ausgaben:Foo', amountEur: -amount },
      ],
    };
  }

  it('Anfangssaldo + nur Tx nach Stand-Am addiert (Bootstrap-Scenario)', () => {
    // Bootstrap: Anfangssaldo 1000.00 zum 2026-05-10 (= aktueller Bank-Saldo)
    // Tx vor Stand-Am sind schon im Anfangssaldo enthalten — würden doppelt
    // zählen. Tx nach Stand-Am müssen draufkommen.
    const openings = new Map([
      [
        'Aktiva:Bank:Sparkasse:Hauptkonto',
        { amount: 1000.0, standAm: '2026-05-10' },
      ],
    ]);
    const txs = [
      tx('2025-08-01', 'Aktiva:Bank:Sparkasse:Hauptkonto', -50), // vor Stand-Am
      tx('2026-05-10', 'Aktiva:Bank:Sparkasse:Hauptkonto', -30), // = Stand-Am
      tx('2026-05-11', 'Aktiva:Bank:Sparkasse:Hauptkonto', 200), // nach Stand-Am
      tx('2026-05-15', 'Aktiva:Bank:Sparkasse:Hauptkonto', -75), // nach Stand-Am
    ];
    const result = aggregateAccountSaldos(txs, openings);
    const hk = result.find(
      s => s.account === 'Aktiva:Bank:Sparkasse:Hauptkonto'
    );
    expect(hk).toBeDefined();
    // 1000 + 200 - 75 = 1125 (Tx vor/am 2026-05-10 ausgefiltert)
    expect(hk!.saldoEur).toBeCloseTo(1125.0, 2);
    expect(hk!.hasOpeningBalance).toBe(true);
    expect(hk!.standAm).toBe('2026-05-10');
    expect(hk!.postingCount).toBe(2); // nur die 2 Tx nach Stand-Am
  });

  it('Konto ohne Opening-Balance: Fallback Tx-Sum komplett (= pre-Slice-8-Bug-State, markiert)', () => {
    const openings = new Map<
      string,
      { amount: number; standAm: string }
    >(); // leer
    const txs = [
      tx('2025-08-01', 'Aktiva:Bank:Sparkasse:Hauptkonto', -50),
      tx('2026-05-15', 'Aktiva:Bank:Sparkasse:Hauptkonto', 200),
    ];
    const result = aggregateAccountSaldos(txs, openings);
    const hk = result.find(
      s => s.account === 'Aktiva:Bank:Sparkasse:Hauptkonto'
    );
    expect(hk).toBeDefined();
    expect(hk!.saldoEur).toBeCloseTo(150.0, 2); // -50 + 200 = 150 (alle Tx)
    expect(hk!.hasOpeningBalance).toBe(false);
    expect(hk!.standAm).toBeNull();
  });

  it('Mixed-Scenario: ein Konto mit Opening, eines ohne — beide korrekt', () => {
    const openings = new Map([
      [
        'Aktiva:Bank:Sparkasse:Hauptkonto',
        { amount: 500.0, standAm: '2026-05-10' },
      ],
    ]);
    const txs = [
      tx('2025-08-01', 'Aktiva:Bank:Sparkasse:Hauptkonto', -100),
      tx('2026-05-15', 'Aktiva:Bank:Sparkasse:Hauptkonto', 50),
      tx('2025-08-01', 'Aktiva:Bank:Sparkasse:Vermietung', 300),
      tx('2026-05-15', 'Aktiva:Bank:Sparkasse:Vermietung', 200),
    ];
    const result = aggregateAccountSaldos(txs, openings);
    const hk = result.find(
      s => s.account === 'Aktiva:Bank:Sparkasse:Hauptkonto'
    );
    const vm = result.find(
      s => s.account === 'Aktiva:Bank:Sparkasse:Vermietung'
    );
    expect(hk!.saldoEur).toBeCloseTo(550.0, 2); // 500 + 50 (Aug-Tx vor Stand-Am skipped)
    expect(hk!.hasOpeningBalance).toBe(true);
    expect(vm!.saldoEur).toBeCloseTo(500.0, 2); // 300 + 200 (kein Opening, alle Tx)
    expect(vm!.hasOpeningBalance).toBe(false);
  });

  it('Konto mit Opening aber ohne post-Stand-Am-Tx zeigt nur Anfangssaldo', () => {
    const openings = new Map([
      [
        'Aktiva:Bank:Sparkasse:Hauptkonto',
        { amount: 800.0, standAm: '2026-05-10' },
      ],
    ]);
    const txs = [
      tx('2025-08-01', 'Aktiva:Bank:Sparkasse:Hauptkonto', -50), // vor Stand-Am, gefiltert
    ];
    const result = aggregateAccountSaldos(txs, openings);
    const hk = result.find(
      s => s.account === 'Aktiva:Bank:Sparkasse:Hauptkonto'
    );
    expect(hk).toBeDefined();
    expect(hk!.saldoEur).toBeCloseTo(800.0, 2); // nur Anfangssaldo
    expect(hk!.postingCount).toBe(0);
    expect(hk!.lastDate).toBe('2026-05-10'); // standAm als Fallback
  });

  it('Aktiva-Konto im Opening-Map auch ohne Tx wird im Output gelistet', () => {
    const openings = new Map([
      [
        'Aktiva:Bank:Sparkasse:Visa',
        { amount: -340.51, standAm: '2026-05-10' },
      ],
    ]);
    const result = aggregateAccountSaldos([], openings);
    const visa = result.find(s => s.account === 'Aktiva:Bank:Sparkasse:Visa');
    expect(visa).toBeDefined();
    expect(visa!.saldoEur).toBeCloseTo(-340.51, 2);
    expect(visa!.hasOpeningBalance).toBe(true);
  });
});
