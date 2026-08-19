/**
 * CSV-Reader für Bank-Exporte.
 *
 * Im gesamten Ökosystem existiert kein CSV-*Leser* (apple-health hat nur einen
 * Writer), also wird hier neu gebaut. Anforderungen aus den beiden realen
 * Formaten: `;` als Trenner, RFC4180-Quoting (`""` als escaptes Quote im
 * quotierten Feld), Zeilenumbrüche innerhalb quotierter Felder, CRLF und LF.
 *
 * Der Tokenizer hält seinen Zustand über Chunk-Grenzen hinweg (Restpuffer-Muster
 * aus `apple-health/src/core/xml-tokenizer.ts`), damit große Dateien später
 * gestreamt werden können, ohne dass der Kern je eine ganze Datei im Speicher
 * halten muss. `parseCsv` ist der bequeme Einmal-Aufruf darüber.
 *
 * Abweichung von RFC4180, bewusst und wie Pythons `csv.reader`: ein `"` mitten
 * in einem *unquotierten* Feld ist ein normales Zeichen, kein Syntaxfehler —
 * Bank-Exporte enthalten das gelegentlich in Verwendungszwecken.
 */

export interface CsvOptions {
	/** Feldtrenner. Default `;` — beide Bank-Formate nutzen ihn. */
	delimiter?: string;
	/** Anführungszeichen. Default `"`. */
	quote?: string;
}

const DEFAULT_DELIMITER = ";";
const DEFAULT_QUOTE = '"';

/** Eine CSV-Zeile als Feldliste. */
export type CsvRow = string[];

/**
 * Zustandsbehafteter Reader: `push(chunk)` liefert alle Zeilen, die mit diesem
 * Chunk vollständig geworden sind; `flush()` gibt eine eventuelle letzte Zeile
 * ohne abschließenden Umbruch heraus.
 */
export class CsvTokenizer {
	private readonly delimiter: string;
	private readonly quote: string;

	private field = "";
	private row: CsvRow = [];
	private inQuotes = false;
	/** Ein `"` im quotierten Feld gesehen — noch offen, ob Escape oder Ende. */
	private pendingQuote = false;
	/** Letztes Zeichen war CR — ein direkt folgendes LF gehört dazu. */
	private pendingCr = false;
	/** Mindestens ein Zeichen oder Trenner seit Zeilenbeginn gesehen. */
	private rowStarted = false;

	constructor(options: CsvOptions = {}) {
		this.delimiter = options.delimiter ?? DEFAULT_DELIMITER;
		this.quote = options.quote ?? DEFAULT_QUOTE;
	}

	push(chunk: string): CsvRow[] {
		const rows: CsvRow[] = [];
		for (const char of chunk) {
			this.consume(char, rows);
		}
		return rows;
	}

	/** Rest herausgeben. Wirft, wenn ein quotiertes Feld nie geschlossen wurde. */
	flush(): CsvRow[] {
		if (this.pendingQuote) {
			this.pendingQuote = false;
			this.inQuotes = false;
		}
		if (this.inQuotes) {
			throw new Error("CSV endet mitten in einem quotierten Feld");
		}
		const rows: CsvRow[] = [];
		if (this.rowStarted || this.field !== "" || this.row.length > 0) {
			this.row.push(this.field);
			rows.push(this.row);
			this.row = [];
			this.field = "";
			this.rowStarted = false;
		}
		return rows;
	}

	private consume(char: string, rows: CsvRow[]): void {
		// Ein CR, dessen LF noch aussteht: das LF wird geschluckt, jedes andere
		// Zeichen bedeutet, dass das CR allein die Zeile beendet hat (alter Mac-Stil).
		if (this.pendingCr) {
			this.pendingCr = false;
			if (char === "\n") {
				return;
			}
		}

		if (this.pendingQuote) {
			this.pendingQuote = false;
			if (char === this.quote) {
				// "" innerhalb eines quotierten Feldes → ein literales Quote.
				this.field += this.quote;
				this.inQuotes = true;
				return;
			}
			this.inQuotes = false;
			// Zeichen fällt durch zur normalen Behandlung außerhalb der Quotes.
		}

		if (this.inQuotes) {
			if (char === this.quote) {
				this.pendingQuote = true;
				return;
			}
			this.field += char;
			return;
		}

		if (char === this.quote && this.field === "") {
			// Quote wirkt nur am Feldanfang — mitten im Feld ist es Inhalt.
			this.inQuotes = true;
			this.rowStarted = true;
			return;
		}

		if (char === this.delimiter) {
			this.row.push(this.field);
			this.field = "";
			this.rowStarted = true;
			return;
		}

		if (char === "\n" || char === "\r") {
			this.pendingCr = char === "\r";
			this.endRow(rows);
			return;
		}

		this.field += char;
		this.rowStarted = true;
	}

	private endRow(rows: CsvRow[]): void {
		if (!this.rowStarted && this.field === "" && this.row.length === 0) {
			// Leerzeile zwischen Datensätzen — kein Datensatz.
			return;
		}
		this.row.push(this.field);
		rows.push(this.row);
		this.row = [];
		this.field = "";
		this.rowStarted = false;
	}
}

/** Vollständigen CSV-Text in Zeilen zerlegen. */
export function parseCsv(text: string, options: CsvOptions = {}): CsvRow[] {
	const tokenizer = new CsvTokenizer(options);
	// Ein BOM würde sonst als erstes Zeichen der ersten Kopfspalte landen und
	// jeden Header-Vergleich stillschweigend scheitern lassen.
	const withoutBom = text.startsWith("﻿") ? text.slice(1) : text;
	return [...tokenizer.push(withoutBom), ...tokenizer.flush()];
}

/** Zeile ist leer (kein Feld mit Inhalt) — Bank-Exporte enden gern damit. */
export function isBlankRow(row: CsvRow): boolean {
	return row.every((cell) => cell.trim() === "");
}
