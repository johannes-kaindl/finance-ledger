/**
 * Parser für Sparkasse CAMT.52 v8 CSV (Latin-1, Semikolon-getrennt).
 *
 * Port von `parsers/camt52.py`. Die Bytes kommen von außen — welches Encoding
 * gilt, entscheidet `core/text/decode`, nicht dieser Parser.
 */

import { parseCsv, isBlankRow, type CsvRow } from "../../csv/reader";
import { parseGermanDate } from "../../dates";
import { InputFormatError } from "../../errors";
import { parseGermanDecimal } from "../../money";
import { describeUnexpectedFormat } from "../formatHints";
import {
	emptyTransactionFields,
	type BankTransaction,
} from "../transaction";

export const CAMT52_DELIMITER = ";";
export const CAMT52_INFO_GEBUCHT = "Umsatz gebucht";
export const CAMT52_INFO_VORGEMERKT = "Umsatz vorgemerkt";

export const CAMT52_HEADER = [
	"Auftragskonto",
	"Buchungstag",
	"Valutadatum",
	"Buchungstext",
	"Verwendungszweck",
	"Glaeubiger ID",
	"Mandatsreferenz",
	"Kundenreferenz (End-to-End)",
	"Sammlerreferenz",
	"Lastschrift Ursprungsbetrag",
	"Auslagenersatz Ruecklastschrift",
	"Beguenstigter/Zahlungspflichtiger",
	"Kontonummer/IBAN",
	"BIC (SWIFT-Code)",
	"Betrag",
	"Waehrung",
	"Info",
] as const;

/** Anzahl Zeichen des Dateianfangs, die in eine Fehlermeldung einfließen. */
const HEAD_FOR_DIAGNOSIS = 400;

export interface Camt52ParseResult {
	transactions: BankTransaction[];
	/** Übersprungene vorgemerkte Buchungen — für den Import-Report. */
	skippedVorgemerkt: number;
}

/**
 * Liest eine CAMT.52-CSV.
 *
 * `filename` ist der Dateiname (ohne Pfad): er landet im `; quelle:`-Kommentar
 * jeder Buchung und geht in die Catch-all-Kategorie ein.
 */
export function parseCamt52(
	text: string,
	filename: string,
): Camt52ParseResult {
	const rows = parseCsv(text, { delimiter: CAMT52_DELIMITER });
	const transactions: BankTransaction[] = [];
	let skippedVorgemerkt = 0;

	const header = rows[0];
	if (!header) {
		return { transactions, skippedVorgemerkt };
	}
	assertHeader(header, text, filename);

	rows.slice(1).forEach((row, index) => {
		if (row.length === 0 || isBlankRow(row)) {
			return;
		}
		const rawRowIdx = index + 1;
		const info = cell(row, 16);

		// Vorgemerkte Buchungen sind nicht final — Datum und Betrag können sich
		// ändern, das Valutadatum ist oft leer. Beim nächsten Import erscheinen
		// sie als „Umsatz gebucht" mit stabilem Hash.
		if (info === CAMT52_INFO_VORGEMERKT) {
			skippedVorgemerkt++;
			return;
		}

		transactions.push({
			...emptyTransactionFields(),
			accountIban: cell(row, 0),
			buchungstag: parseGermanDate(cell(row, 1)),
			valutadatum: parseGermanDate(cell(row, 2)),
			buchungstext: cell(row, 3),
			verwendungszweck: cell(row, 4),
			glaeubigerId: cell(row, 5),
			mandatsreferenz: cell(row, 6),
			kundenreferenz: cell(row, 7),
			sammlerreferenz: cell(row, 8),
			beguenstigter: cell(row, 11),
			kontonummerIban: cell(row, 12),
			bic: cell(row, 13),
			betrag: parseGermanDecimal(cell(row, 14)),
			waehrung: cell(row, 15),
			info,
			rawRowIdx,
			quelle: filename,
		});
	});

	return { transactions, skippedVorgemerkt };
}

/**
 * Prüft die Kopfzeile.
 *
 * Der häufigste Grund für eine Abweichung ist kein Datenfehler, sondern ein
 * Bedienfehler beim Download — deshalb keine rohe Spaltenliste, sondern eine
 * Diagnose, die sagt, was zu tun ist.
 */
function assertHeader(header: CsvRow, text: string, filename: string): void {
	const matches =
		header.length === CAMT52_HEADER.length &&
		CAMT52_HEADER.every((expected, i) => header[i] === expected);
	if (matches) {
		return;
	}
	throw new InputFormatError(
		`Falsches Dateiformat in ${filename}. ` +
			describeUnexpectedFormat(text.slice(0, HEAD_FOR_DIAGNOSIS), header),
	);
}

function cell(row: CsvRow, index: number): string {
	return (row[index] ?? "").trim();
}
