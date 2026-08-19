import { Money } from "../../../src/core/money";
import type { BankTransaction } from "../../../src/core/import/transaction";

/** Buchung mit unauffälligen Vorgabewerten; Tests setzen nur, was sie prüfen. */
export function makeTx(
	overrides: Partial<BankTransaction> = {},
): BankTransaction {
	return {
		accountIban: "DE1",
		buchungstag: "2025-08-01",
		valutadatum: "2025-08-01",
		buchungstext: "LASTSCHRIFT",
		verwendungszweck: "",
		beguenstigter: "Irgendwer GmbH",
		betrag: new Money("-10.00"),
		waehrung: "EUR",
		info: "Umsatz gebucht",
		rawRowIdx: 1,
		quelle: "test.CSV",
		glaeubigerId: "",
		mandatsreferenz: "",
		kundenreferenz: "",
		sammlerreferenz: "",
		kontonummerIban: "",
		bic: "",
		...overrides,
	};
}
