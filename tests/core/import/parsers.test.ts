import { describe, expect, it } from "vitest";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { InputFormatError } from "../../../src/core/errors";
import {
	detectSchema,
	SCHEMA_CAMT52,
	SCHEMA_VISA,
} from "../../../src/core/import/detectSchema";
import {
	CAMT52_HEADER,
	parseCamt52,
} from "../../../src/core/import/parsers/camt52";
import { parseVisa } from "../../../src/core/import/parsers/visa";

const CAMT_HEAD = CAMT52_HEADER.join(";");

function camtRow(fields: Partial<Record<number, string>>): string {
	const row = Array.from({ length: 17 }, (_, i) => fields[i] ?? "");
	return row.join(";");
}

describe("parseCamt52", () => {
	it("liest eine vollständige Buchung", () => {
		const text = [
			CAMT_HEAD,
			camtRow({
				0: "DE00123456780000000001",
				1: "01.08.25",
				2: "01.08.25",
				3: "LASTSCHRIFT",
				4: "Festnetz Vertragskonto 123",
				8: "SREF-4711",
				11: "Telekom Deutschland GmbH",
				12: "DE00999",
				13: "COBADEFF",
				14: "-39,95",
				15: "EUR",
				16: "Umsatz gebucht",
			}),
		].join("\r\n");

		const { transactions } = parseCamt52(text, "auszug-camt52v8.CSV");
		expect(transactions).toHaveLength(1);
		const tx = transactions[0];
		expect(tx.buchungstag).toBe("2025-08-01");
		expect(tx.betrag.toFixed(2)).toBe("-39.95");
		expect(tx.beguenstigter).toBe("Telekom Deutschland GmbH");
		expect(tx.sammlerreferenz).toBe("SREF-4711");
		expect(tx.quelle).toBe("auszug-camt52v8.CSV");
		expect(tx.rawRowIdx).toBe(1);
	});

	// Vorgemerkte Buchungen sind nicht final: Datum und Betrag können sich noch
	// ändern, das Valutadatum ist oft leer. Beim nächsten Import kommen sie
	// als gebucht wieder — mit stabilem Hash.
	it("überspringt vorgemerkte Buchungen und zählt sie", () => {
		const text = [
			CAMT_HEAD,
			camtRow({ 1: "01.08.25", 2: "", 14: "-10,00", 16: "Umsatz vorgemerkt" }),
			camtRow({ 1: "02.08.25", 2: "02.08.25", 14: "-20,00", 16: "Umsatz gebucht" }),
		].join("\n");

		const result = parseCamt52(text, "x-camt52v8.CSV");
		expect(result.transactions).toHaveLength(1);
		expect(result.skippedVorgemerkt).toBe(1);
		// Die Zeilennummer bleibt die der Quelldatei — sie steht im Journal und
		// muss auf die echte Zeile zeigen.
		expect(result.transactions[0].rawRowIdx).toBe(2);
	});

	it("überspringt Leerzeilen", () => {
		const text = [
			CAMT_HEAD,
			camtRow({ 1: "01.08.25", 2: "01.08.25", 14: "-1,00", 16: "Umsatz gebucht" }),
			";;;;;;;;;;;;;;;;",
			"",
		].join("\n");
		expect(parseCamt52(text, "x.CSV").transactions).toHaveLength(1);
	});

	it("liefert für eine leere Datei nichts statt zu werfen", () => {
		expect(parseCamt52("", "leer.CSV").transactions).toEqual([]);
	});

	// Der häufigste Grund ist kein Datenfehler, sondern ein Griff ins falsche
	// Download-Format — die Meldung muss das sagen, nicht die Spaltenliste zeigen.
	it("erkennt das falsche Downloadformat und sagt, was zu tun ist", () => {
		expect(() => parseCamt52("Datum;Betrag;Text\n01.08.25;-1,00;x", "fremd.CSV"))
			.toThrow(InputFormatError);
		try {
			parseCamt52("Datum;Betrag;Text", "fremd.CSV");
		} catch (e) {
			expect((e as Error).message).toContain("fremd.CSV");
			expect((e as Error).message).toContain("abweichenden Spalten");
			expect((e as Error).message).toContain("CSV-CAMT V8");
		}
	});

	it("benennt XML und MT940 beim Namen", () => {
		try {
			parseCamt52('<?xml version="1.0"?><Document>', "export.CSV");
		} catch (e) {
			expect((e as Error).message).toContain("XML-Datei");
		}
		try {
			parseCamt52(":20:STARTUMSA\n:25:12345", "mt940.CSV");
		} catch (e) {
			expect((e as Error).message).toContain("MT940");
		}
	});
});

describe("parseVisa", () => {
	const visaHeader = [
		"Karte",
		"Belegdatum",
		"Buchungsdatum",
		"Originalbetrag",
		"Originalwährung",
		"Umrechnungskurs",
		"Buchungsbetrag",
		"Buchungswährung",
		"Beschreibung",
		"Zusatz",
		"Referenz",
		"MCC",
		"Länderkennzeichen",
		"F13",
		"F14",
		"F15",
	].join(";");

	function visaRow(fields: Partial<Record<number, string>>): string {
		return Array.from({ length: 16 }, (_, i) => fields[i] ?? "").join(";");
	}

	it("liest eine Inlandsbuchung", () => {
		const text = [
			visaHeader,
			visaRow({
				0: "4000 **** **** 0000",
				1: "02.08.25",
				2: "05.08.25",
				6: "-29,75",
				7: "EUR",
				8: "Buchhandlung Muster",
				9: "Musterstadt",
			}),
		].join("\n");

		const [tx] = parseVisa(text, "umsatz_4000____0000.CSV");
		expect(tx.buchungstag).toBe("2025-08-02");
		expect(tx.valutadatum).toBe("2025-08-05");
		expect(tx.betrag.toFixed(2)).toBe("-29.75");
		expect(tx.buchungstext).toBe("VISA-UMSATZ");
		expect(tx.verwendungszweck).toBe("Musterstadt");
	});

	// Der Categorizer entscheidet an buchungstext — deshalb sind diese drei
	// synthetischen Werte Fachlogik, nicht Formatierung.
	it("synthetisiert den Buchungstext für die Sonderfälle", () => {
		const rows = (beschreibung: string, waehrung = "") =>
			parseVisa(
				[
					visaHeader,
					visaRow({
						1: "02.08.25",
						2: "05.08.25",
						4: waehrung,
						6: "-1,00",
						8: beschreibung,
					}),
				].join("\n"),
				"x.CSV",
			)[0].buchungstext;

		expect(rows("Lastschrift")).toBe("VISA-LASTSCHRIFT");
		expect(rows("2% Auslandseinsatzentgelt Währung")).toBe("VISA-FX-GEBUEHR");
		expect(rows("Shop", "USD")).toBe("VISA-AUSLAND");
		expect(rows("Shop", "EUR")).toBe("VISA-UMSATZ");
	});

	it("baut den Verwendungszweck aus den Fremdwährungsfeldern", () => {
		const [tx] = parseVisa(
			[
				visaHeader,
				visaRow({
					1: "02.08.25",
					2: "05.08.25",
					3: "34,50",
					4: "USD",
					5: "1,1600",
					6: "-29,75",
					8: "Shop",
					9: "New York",
					10: "REF123",
					11: "5942",
					12: "US",
				}),
			].join("\n"),
			"x.CSV",
		);
		expect(tx.verwendungszweck).toBe(
			"ORIG 34,50 USD / KURS 1,1600 / New York / REF REF123 / MCC 5942 / LAND US",
		);
	});

	it("lässt den Originalbetrag weg, wenn gar nicht umgerechnet wurde", () => {
		const [tx] = parseVisa(
			[
				visaHeader,
				visaRow({
					1: "02.08.25",
					2: "05.08.25",
					3: "0,00",
					4: "EUR",
					6: "-1,00",
					8: "Shop",
					9: "Musterstadt",
				}),
			].join("\n"),
			"x.CSV",
		);
		expect(tx.verwendungszweck).toBe("Musterstadt");
	});

	it("meldet eine abweichende Spaltenzahl", () => {
		expect(() => parseVisa("a;b;c", "x.CSV")).toThrow(/16 Spalten/);
	});

	it("meldet ein fehlendes Pflichtfeld im Header", () => {
		const wrong = Array.from({ length: 16 }, (_, i) => `Spalte${i}`).join(";");
		expect(() => parseVisa(wrong, "x.CSV")).toThrow(/Belegdatum/);
	});
});

describe("detectSchema", () => {
	const konten = parseKontenConfig({
		konten: [
			{
				id: "haupt",
				iban: "DE00 1234 5678 0000 0000 01",
				ledger_account: "Aktiva:Bank:Hauptkonto",
				bank: "Sparkasse",
				konto_typ: "giro",
				konto_rolle: "hauptkonto_privat",
				csv_schema: "sparkasse_camt52",
				inhaber: "Max Mustermann",
			},
			{
				id: "visa",
				iban: "4000 **** **** 0000",
				ledger_account: "Passiva:Visa",
				bank: "Sparkasse",
				konto_typ: "kreditkarte",
				konto_rolle: "visa_daily",
				csv_schema: "sparkasse_visa",
				inhaber: "Max Mustermann",
			},
		],
	});

	it("erkennt die Karten-CSV am strukturellen Namensmuster", () => {
		expect(detectSchema("umsatz_1234________5678.CSV", konten)).toBe(SCHEMA_VISA);
		expect(detectSchema("4000-XXXX-XXXX-0000.CSV", konten)).toBe(SCHEMA_VISA);
	});

	// Genau hier lag der Defekt: ein einzelner Bindestrich zwischen zwei
	// Zifferngruppen ist im CAMT52-Namen normal und darf nicht als Karte gelten.
	it("hält die CAMT52-Datei von der Kartenerkennung fern", () => {
		expect(detectSchema("20260506-532013000-camt52v8.CSV", konten)).toBe(
			SCHEMA_CAMT52,
		);
	});

	it("lässt eine IBAN im Dateinamen alles andere überstimmen", () => {
		// Endet auf die letzten zehn IBAN-Stellen des Girokontos, trägt aber ein
		// Kartenmuster im Namen — das Konto gewinnt.
		expect(detectSchema("1234____5678_0000000001.CSV", konten)).toBe(
			SCHEMA_CAMT52,
		);
	});

	it("fällt auf das erste konfigurierte Schema zurück", () => {
		expect(detectSchema("irgendwas.CSV", konten)).toBe(SCHEMA_CAMT52);
	});
});
