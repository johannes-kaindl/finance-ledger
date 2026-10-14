import type { CategorizationResult } from "../../../src/core/import/categorize";
import type { BankTransaction } from "../../../src/core/import/transaction";
import { emptyTransactionFields } from "../../../src/core/import/transaction";
import { Money } from "../../../src/core/money";

export const IBAN_K1 = "DE89370400440532013000";
export const IBAN_K3 = "DE89370400440532013002";

export function makeTx(over: Partial<Omit<BankTransaction, "betrag">> & { betrag?: string } = {}): BankTransaction {
	const { betrag = "-50.00", ...rest } = over;
	return {
		...emptyTransactionFields(),
		accountIban: IBAN_K1,
		buchungstag: "2026-04-15",
		valutadatum: "2026-04-15",
		buchungstext: "FOLGELASTSCHRIFT",
		verwendungszweck: "",
		beguenstigter: "TestMerchant",
		betrag: new Money(betrag),
		waehrung: "EUR",
		info: "Umsatz gebucht",
		rawRowIdx: 1,
		quelle: "test.csv",
		...rest,
	};
}

export const fixedCat = (gegenAccount: string, tags: readonly string[] = []): CategorizationResult => ({
	gegenAccount,
	tags,
	ruleName: "test",
});

/** Ein Categorizer, der immer dasselbe liefert. */
export const makeCat = (gegen: string, tags: readonly string[] = []) => (): CategorizationResult => fixedCat(gegen, tags);
