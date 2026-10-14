import { describe, it, expect } from 'vitest';
import { DATE_PRESETS, presetRange, transactionsInRange } from '../../src/views/dateRange';
import type { Transaction } from '../../src/parser/ledger';

describe('presetRange', () => {
  it('Monat: voller Kalendermonat, auch Schaltjahr-Februar und Monatsenden mit 30 Tagen', () => {
    expect(presetRange('thisMonth', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('thisMonth', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetRange('thisMonth', '2026-04-30')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });
  it('Vormonat über den Jahreswechsel', () => {
    expect(presetRange('lastMonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('lastMonth', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('Quartal: Q1 bis Q4, Grenzen inklusive', () => {
    expect(presetRange('thisQuarter', '2026-03-31')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(presetRange('thisQuarter', '2026-04-01')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(presetRange('thisQuarter', '2026-11-15')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });
  it('Jahr und Vorjahr', () => {
    expect(presetRange('thisYear', '2026-10-14')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('lastYear', '2026-01-01')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('Alle: offen auf beiden Seiten', () => {
    expect(presetRange('all', '2026-10-14')).toEqual({ from: '', to: '' });
  });
  it('jedes Preset liefert from <= to oder beides leer', () => {
    for (const p of DATE_PRESETS) {
      const r = presetRange(p, '2026-07-09');
      expect(r.from === '' ? r.to === '' : r.from <= r.to).toBe(true);
    }
  });
});

describe('transactionsInRange', () => {
  const tx = (date: string): Transaction => ({ date, counterparty: 'x', postings: [], tags: [], quelle: null, verwendungszweck: null });
  const all = [tx('2026-01-31'), tx('2026-02-01'), tx('2026-02-28'), tx('2026-03-01')];

  it('Grenzen sind eingeschlossen', () => {
    expect(transactionsInRange(all, { from: '2026-02-01', to: '2026-02-28' }).map((t) => t.date)).toEqual(['2026-02-01', '2026-02-28']);
  });
  it('offene Seiten', () => {
    expect(transactionsInRange(all, { from: '2026-02-28', to: '' }).map((t) => t.date)).toEqual(['2026-02-28', '2026-03-01']);
    expect(transactionsInRange(all, { from: '', to: '2026-01-31' }).map((t) => t.date)).toEqual(['2026-01-31']);
    expect(transactionsInRange(all, { from: '', to: '' })).toBe(all);
  });
  it('leerer Treffer ist eine leere Liste, kein Absturz', () => {
    expect(transactionsInRange(all, { from: '2030-01-01', to: '2030-12-31' })).toEqual([]);
  });
});
