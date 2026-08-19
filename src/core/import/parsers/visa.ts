/**
 * Parser für Sparkassen-Visa-CSV.
 *
 * Port von `parsers/sparkassen_visa.py`. Das Format hat keine Sammlerreferenz
 * und keine Gegen-IBAN; `buchungstext` und `verwendungszweck` werden aus den
 * vorhandenen Spalten **synthetisiert**, weil der Categorizer stromabwärts auf
 * genau diesen Feldern arbeitet.
 *
 * Die Header-Prüfung ist bewusst nachsichtiger als bei CAMT52: die Sparkasse
 * hat Spalten über die Jahre umbenannt, deshalb werden Spaltenzahl und
 * Kernfelder geprüft, nicht die exakte Liste.
 */

import { isBlankRow, parseCsv, type CsvRow } from "../../csv/reader";
import { parseGermanDate } from "../../dates";
import { InputFormatError } from "../../errors";
import { parseGermanDecimal } from "../../money";
import {
	emptyTransactionFields,
	type BankTransaction,
} from "../transaction";

export const VISA_DELIMITER = ";";

const EXPECTED_COL_COUNT = 16;
const REQUIRED_HEADER_FIELDS = [
	"Belegdatum",
	"Buchungsdatum",
	"Originalbetrag",
] as const;

export function parseVisa(text: string, filename: string): BankTransaction[] {
	const rows = parseCsv(text, { delimiter: VISA_DELIMITER });
	const header = rows[0];
	if (!header) {
		return [];
	}
	assertHeader(header, filename);

	const transactions: BankTransaction[] = [];
	rows.slice(1).forEach((row, index) => {
		if (row.length === 0 || isBlankRow(row)) {
			return;
		}
		const origBetrag = cellRaw(row, 3);
		const origWaehrung = cellRaw(row, 4);
		const umrechnungskurs = cellRaw(row, 5);
		const beschreibung = cell(row, 8);

		transactions.push({
			...emptyTransactionFields(),
			accountIban: cell(row, 0),
			buchungstag: parseGermanDate(cell(row, 1)),
			valutadatum: parseGermanDate(cell(row, 2)),
			buchungstext: buildBuchungstext(beschreibung, origWaehrung),
			verwendungszweck: buildVerwendungszweck({
				origBetrag,
				origWaehrung,
				kurs: umrechnungskurs,
				stadt: cellRaw(row, 9),
				referenz: cellRaw(row, 10),
				mcc: cellRaw(row, 11),
				laenderkz: cellRaw(row, 12),
			}),
			beguenstigter: beschreibung,
			betrag: parseGermanDecimal(cell(row, 6)),
			waehrung: cell(row, 7) || "EUR",
			rawRowIdx: index + 1,
			quelle: filename,
		});
	});
	return transactions;
}

/**
 * Synthetisches `buchungstext`-Feld — der Categorizer entscheidet daran, ob
 * eine Zeile Kartenabrechnung, Auslandsumsatz oder FX-Aufschlag ist.
 */
function buildBuchungstext(beguenstigter: string, origWaehrung: string): string {
	const bn = beguenstigter.trim();
	if (bn.toLowerCase() === "lastschrift") {
		return "VISA-LASTSCHRIFT";
	}
	if (bn.startsWith("2%") && bn.includes("Währung")) {
		return "VISA-FX-GEBUEHR";
	}
	const ow = origWaehrung.trim();
	if (ow !== "" && ow.toUpperCase() !== "EUR") {
		return "VISA-AUSLAND";
	}
	return "VISA-UMSATZ";
}

function buildVerwendungszweck(input: {
	origBetrag: string;
	origWaehrung: string;
	kurs: string;
	stadt: string;
	referenz: string;
	mcc: string;
	laenderkz: string;
}): string {
	const parts: string[] = [];
	const ow = input.origWaehrung.trim();
	const ob = input.origBetrag.trim();
	// Der Originalbetrag ist nur interessant, wenn wirklich umgerechnet wurde.
	if (ow !== "" && ow.toUpperCase() !== "EUR" && ob !== "" && ob !== "0,00") {
		parts.push(`ORIG ${ob} ${ow}`);
		if (input.kurs.trim() !== "") {
			parts.push(`KURS ${input.kurs.trim()}`);
		}
	}
	if (input.stadt.trim() !== "") {
		parts.push(input.stadt.trim());
	}
	if (input.referenz.trim() !== "") {
		parts.push(`REF ${input.referenz.trim()}`);
	}
	if (input.mcc.trim() !== "") {
		parts.push(`MCC ${input.mcc.trim()}`);
	}
	if (input.laenderkz.trim() !== "") {
		parts.push(`LAND ${input.laenderkz.trim()}`);
	}
	return parts.join(" / ");
}

function assertHeader(header: CsvRow, filename: string): void {
	if (header.length !== EXPECTED_COL_COUNT) {
		throw new InputFormatError(
			`Visa-CSV ${filename}: erwartet ${EXPECTED_COL_COUNT} Spalten, ` +
				`gefunden ${header.length}.`,
		);
	}
	for (const required of REQUIRED_HEADER_FIELDS) {
		if (!header.some((column) => column.includes(required))) {
			throw new InputFormatError(
				`Visa-CSV ${filename}: Pflichtfeld '${required}' nicht im Header.`,
			);
		}
	}
}

function cell(row: CsvRow, index: number): string {
	return (row[index] ?? "").trim();
}

/** Rohwert ohne Trim — die Bauteile des Verwendungszwecks trimmen selbst. */
function cellRaw(row: CsvRow, index: number): string {
	return row[index] ?? "";
}
