/**
 * Die Bankbuchung, wie sie aus einer CSV kommt.
 *
 * Entspricht dem `Transaction`-NamedTuple des Python-Importers, mit zwei
 * bewussten Änderungen: Datumsfelder sind `YYYY-MM-DD`-Strings (siehe
 * `core/dates`) und Beträge sind `Money` (siehe `core/money`). Beide Formate
 * sind genau das, was Journal und Notizen am Ende brauchen — es gibt keine
 * Zwischendarstellung, die noch konvertiert werden müsste.
 */

import type { IsoDate } from "../dates";
import type { MoneyValue } from "../money";

export interface BankTransaction {
	/** IBAN des Kontos, zu dem der Auszug gehört — bei Visa die Kartennummer. */
	accountIban: string;
	buchungstag: IsoDate;
	valutadatum: IsoDate;
	buchungstext: string;
	verwendungszweck: string;
	beguenstigter: string;
	betrag: MoneyValue;
	waehrung: string;
	info: string;
	/** Zeilennummer in der Quelldatei, 1-basiert ohne Kopfzeile. */
	rawRowIdx: number;
	/** Dateiname der Quelle — landet als `; quelle:`-Kommentar im Journal. */
	quelle: string;
	glaeubigerId: string;
	mandatsreferenz: string;
	kundenreferenz: string;
	/** Sammlerreferenz der Sparkasse — quasi Bank-Transaktions-ID, re-export-stabil. */
	sammlerreferenz: string;
	/** IBAN der Gegenseite. */
	kontonummerIban: string;
	bic: string;
}

/** Feldwerte, die jede Buchung hat; die Parser füllen nur, was ihr Format kennt. */
export function emptyTransactionFields(): Pick<
	BankTransaction,
	| "glaeubigerId"
	| "mandatsreferenz"
	| "kundenreferenz"
	| "sammlerreferenz"
	| "kontonummerIban"
	| "bic"
	| "info"
> {
	return {
		glaeubigerId: "",
		mandatsreferenz: "",
		kundenreferenz: "",
		sammlerreferenz: "",
		kontonummerIban: "",
		bic: "",
		info: "",
	};
}
