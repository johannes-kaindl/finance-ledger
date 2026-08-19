/**
 * Mini-Parser für `opening_balances.ledger`.
 *
 * Extrahiert pro Posting-Block (`<YYYY-MM-DD> * Eröffnungsbilanz <konto>`)
 * den ersten Aktiva-Posting-Account + EUR-Wert + Stand-Am-Datum.
 *
 * Stand-Am-aware (Slice-8 Burst-B): Returns Map<account, {amount, standAm}>,
 * damit der Plugin-Saldo-View Tx vor dem per-Konto-Stichtag ausfiltern kann
 * (Bootstrap-Workflow: Anfangssaldo = aktueller Bank-Saldo + heutiges Datum,
 * Tx vor heute schon im Anfangssaldo enthalten — keine Doppelzählung).
 *
 * Nicht ein Full-Hledger-Parser: Comment-Lines (`;`-Prefix) werden geskippt,
 * Eigenkapital-Gegenposting wird ignoriert (nur das erste Posting pro Block
 * = der Konto-Saldo zählt).
 */

export interface OpeningBalance {
  amount: number;
  standAm: string; // ISO YYYY-MM-DD
}

const HEADER_RE = /^(\d{4}-\d{2}-\d{2})\s+\*\s+Eröffnungsbilanz/;
const POSTING_RE = /^\s+(\S+(?:\s+\S+)*?)\s+(-?\d+(?:\.\d+)?)\s+EUR\s*$/;

export function parseOpeningBalances(text: string): Map<string, OpeningBalance> {
  const result = new Map<string, OpeningBalance>();
  const lines = text.split('\n');

  let currentStandAm: string | null = null;
  let captureFirstPosting = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trimStart().startsWith(';')) continue;
    if (line.trim() === '') {
      currentStandAm = null;
      captureFirstPosting = false;
      continue;
    }

    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      currentStandAm = headerMatch[1];
      captureFirstPosting = true;
      continue;
    }

    if (currentStandAm && captureFirstPosting) {
      const postingMatch = line.match(POSTING_RE);
      if (postingMatch) {
        const account = postingMatch[1].trim();
        const amount = parseFloat(postingMatch[2]);
        // Skip Eigenkapital-Gegenposting (kein Aktiva/Passiva-Konto-Saldo)
        if (!account.startsWith('Eigenkapital:')) {
          result.set(account, { amount, standAm: currentStandAm });
          captureFirstPosting = false;
        }
      }
    }
  }

  return result;
}
