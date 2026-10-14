import { describe, expect, it } from "vitest";
import {
	detectTxTyp,
	FIX_FELDER,
	KATEGORIE_MAPPING,
	lebensbereichFor,
	LEBENSBEREICH_SLUGS,
	TX_TYP_DISPLAY,
	TX_TYP_KLASSEN,
} from "../../../src/core/aggregate/kategorien";

describe("detectTxTyp (aus test_tx_typ_notes.py)", () => {
	it.each([
		["FOLGELASTSCHRIFT", "lastschrift"],
		["SEPA-ELV-LASTSCHRIFT", "lastschrift"],
		["DIGITALE KARTE (APPLE PAY)", "karte"],
		["KARTENZAHLUNG", "karte"],
		["GUTSCHRIFT UEBERWEISUNG", "ueberweisung_ein"],
		["ECHTZEIT-GUTSCHRIFT", "ueberweisung_ein"],
		["GUTSCHRIFT UEBERWEISUNG DAUERAUFTRAG", "ueberweisung_ein"],
		["ONLINE-UEBERWEISUNG", "ueberweisung_aus"],
		["ENTGELTABSCHLUSS", "bank_intern"],
		["EIGENE KREDITKARTENABRECHNUNG", "bank_intern"],
		["", "sonstiges"],
		["IRGENDWAS", "sonstiges"],
	])("%s → %s", (text, typ) => {
		expect(detectTxTyp(text)).toBe(typ);
	});

	it("Groß-/Kleinschreibung egal; die spezifischere Regel zuerst (Abschluss vor Karte)", () => {
		expect(detectTxTyp("kartenzahlung")).toBe("karte");
		expect(detectTxTyp("KARTE ABSCHLUSS")).toBe("bank_intern");
	});
});

describe("Vokabular", () => {
	it("jede Kategorie hat einen Lebensbereich; Unbekanntes fällt auf sonstiges (auch „constructor“)", () => {
		for (const [suffix] of KATEGORIE_MAPPING) expect(LEBENSBEREICH_SLUGS).toContain(lebensbereichFor(suffix));
		expect(lebensbereichFor("neue_kategorie")).toBe("sonstiges");
		expect(lebensbereichFor("constructor")).toBe("sonstiges");
		expect(lebensbereichFor("lebensmittel")).toBe("lebenshaltung");
	});

	it("17 Kategorien in fester Reihenfolge, die festen Kosten sind eine Teilmenge", () => {
		expect(KATEGORIE_MAPPING).toHaveLength(17);
		expect(KATEGORIE_MAPPING[0][0]).toBe("wohnen");
		const suffixe = new Set(KATEGORIE_MAPPING.map(([s]) => s));
		for (const f of FIX_FELDER) expect(suffixe.has(f)).toBe(true);
	});

	it("jede Tx-Typ-Klasse hat einen Anzeigenamen", () => {
		for (const k of TX_TYP_KLASSEN) expect(TX_TYP_DISPLAY[k]).toBeTruthy();
	});
});
