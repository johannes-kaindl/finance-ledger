/**
 * Identität einer Buchung — Grundlage jeder Dedupe-Entscheidung.
 *
 * Port von `dedupe.py`. Ist eine Sammlerreferenz vorhanden, dominiert sie den
 * Hash: sie ist praktisch die Transaktions-ID der Bank und übersteht einen
 * erneuten Export unverändert. Sonst ein zusammengesetzter Hash aus Konto,
 * Buchungstag, Betrag und den ersten 60 Zeichen des Verwendungszwecks.
 *
 * Der Hashwert muss byte-genau dem des Python-Importers entsprechen — sonst
 * gilt beim ersten Import nach der Umstellung jede bestehende Buchung als neu.
 * Deshalb hier nichts „verbessern": nicht die Länge, nicht die Reihenfolge,
 * nicht die Kleinschreibung.
 */

import { sha256 } from "../hash/sha256";
import type { BankTransaction } from "./transaction";

/** Zeichen des Verwendungszwecks, die in den Hash eingehen. */
const VZ_PREFIX_LENGTH = 60;
/** Länge des Hex-Präfix — wie `hexdigest()[:16]` in Python. */
const HASH_LENGTH = 16;

export function txHash(tx: BankTransaction): string {
	const sref = tx.sammlerreferenz.trim();
	const payload =
		sref !== ""
			? `sref:${sref}`
			: `comp:${tx.accountIban}|${tx.buchungstag}|${formatBetragForHash(tx)}|` +
				tx.verwendungszweck.slice(0, VZ_PREFIX_LENGTH).trim().toLowerCase();
	return sha256(payload).slice(0, HASH_LENGTH);
}

/**
 * Betrag in der Schreibweise, die Pythons `f"{Decimal}"` erzeugt.
 *
 * `Decimal('-39.95')` wird zu `-39.95`, `Decimal('1307.60')` zu `1307.60` —
 * die Nachkommastellen bleiben also so erhalten, wie sie beim Parsen anfielen.
 * `decimal.js` normalisiert dagegen und würde `1307.6` liefern; genau diese
 * Differenz würde jeden Hash der Altbestände verändern.
 */
function formatBetragForHash(tx: BankTransaction): string {
	return tx.betrag.toFixed(2);
}
