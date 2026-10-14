import { endOfMonth, splitIsoDate, type IsoDate } from '../core/dates';
import type { Transaction } from '../parser/ledger';

/** Ein Zeitrahmen; ein leeres Ende heißt „offen“ (wie `dateFrom`/`dateTo` im Ledger-Filter). */
export interface DateRange {
  from: IsoDate | '';
  to: IsoDate | '';
}

export type DatePreset = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'lastYear' | 'all';

export const DATE_PRESETS: readonly DatePreset[] = ['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'lastYear', 'all'];

const pad2 = (n: number): string => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): IsoDate => `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
const monthRange = (y: number, m: number): DateRange => ({ from: iso(y, m, 1), to: endOfMonth(y, m) });

/**
 * Der Zeitrahmen eines Presets, gerechnet von `today` (lokaler Tag). Reine Zeichenketten-Rechnung wie
 * der Importer-Kern (`core/dates.ts`): keine `Date`-Konstruktion, also keine Zone, die einen Tag verschiebt.
 * Monats- und Quartalsenden sind die vollen Kalenderenden, nicht „bis heute“ — Buchungen mit späterem
 * Datum (Daueraufträge) gehören zum Monat, in dem sie datiert sind.
 */
export function presetRange(preset: DatePreset, today: IsoDate): DateRange {
  const { year, month } = splitIsoDate(today);
  switch (preset) {
    case 'thisMonth':
      return monthRange(year, month);
    case 'lastMonth':
      return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1);
    case 'thisQuarter': {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: iso(year, first, 1), to: endOfMonth(year, first + 2) };
    }
    case 'thisYear':
      return { from: iso(year, 1, 1), to: iso(year, 12, 31) };
    case 'lastYear':
      return { from: iso(year - 1, 1, 1), to: iso(year - 1, 12, 31) };
    case 'all':
      return { from: '', to: '' };
  }
}

/** Buchungen im Zeitrahmen, Grenzen eingeschlossen (dieselbe Regel wie `filterRows` im Ledger). */
export function transactionsInRange(transactions: Transaction[], range: DateRange): Transaction[] {
  if (range.from === '' && range.to === '') return transactions;
  return transactions.filter((tx) => !(range.from !== '' && tx.date < range.from) && !(range.to !== '' && tx.date > range.to));
}
