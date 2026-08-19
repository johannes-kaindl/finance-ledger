import type { Transaction } from '../parser/ledger';
import type { OpeningBalance } from './openingBalances';

export interface AccountSaldo {
  account: string;
  saldoEur: number;
  postingCount: number;
  lastDate: string;
  hasOpeningBalance: boolean;
  standAm: string | null;
}

/**
 * Stand-Am-aware Saldo-Aggregation (Slice-8 Burst-B).
 *
 * Wenn `openingBalances`-Map übergeben:
 *   - Pro Konto wird `opening.amount` als Start-Saldo verwendet.
 *   - Nur Tx mit `tx.date > opening.standAm` werden auf den Anfangssaldo
 *     addiert (Vergangenheits-Tx schon im Anfangssaldo enthalten — keine
 *     Doppelzählung).
 *   - Konten ohne Opening-Balance fallen auf Tx-Sum-Komplett zurück
 *     (= heutiger Bug-State, aber via `hasOpeningBalance: false` markiert).
 *
 * Ohne `openingBalances`-Map:
 *   - Backward-compat: Sum aller Tx pro Aktiva-Konto (= pre-Slice-8-Verhalten).
 */
export function aggregateAccountSaldos(
  transactions: Transaction[],
  openingBalances?: Map<string, OpeningBalance>
): AccountSaldo[] {
  const map = new Map<
    string,
    {
      sum: number;
      count: number;
      lastDate: string;
      hasOpeningBalance: boolean;
      standAm: string | null;
    }
  >();

  // Seed mit allen Anfangssalden — auch wenn kein Tx das Konto später anfasst,
  // soll das Konto im Saldo-Output auftauchen.
  if (openingBalances) {
    for (const [account, ob] of openingBalances.entries()) {
      if (!account.startsWith('Aktiva:')) continue;
      map.set(account, {
        sum: ob.amount,
        count: 0,
        lastDate: ob.standAm,
        hasOpeningBalance: true,
        standAm: ob.standAm,
      });
    }
  }

  for (const tx of transactions) {
    for (const posting of tx.postings) {
      if (!posting.account.startsWith('Aktiva:')) continue;
      const opening = openingBalances?.get(posting.account);
      // Stand-Am-Filter: bei vorhandenem Anfangssaldo Tx vor Stand-Am skippen
      if (opening && tx.date <= opening.standAm) continue;

      const entry =
        map.get(posting.account) ??
        {
          sum: 0,
          count: 0,
          lastDate: '',
          hasOpeningBalance: false,
          standAm: null,
        };
      entry.sum += posting.amountEur;
      entry.count++;
      if (tx.date > entry.lastDate) entry.lastDate = tx.date;
      map.set(posting.account, entry);
    }
  }

  return [...map.entries()]
    .map(([account, { sum, count, lastDate, hasOpeningBalance, standAm }]) => ({
      account,
      saldoEur: Math.round(sum * 100) / 100,
      postingCount: count,
      lastDate,
      hasOpeningBalance,
      standAm,
    }))
    .sort((a, b) => b.saldoEur - a.saldoEur);
}
