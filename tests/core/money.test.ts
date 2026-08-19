import { describe, expect, it } from "vitest";
import {
	formatGermanAmount,
	formatGermanEuro,
	formatJournalAmount,
	Money,
	parseGermanDecimal,
	roundToCents,
	sumMoney,
} from "../../src/core/money";

describe("parseGermanDecimal", () => {
	it("liest Komma als Dezimaltrenner", () => {
		expect(parseGermanDecimal("-39,95").toString()).toBe("-39.95");
	});

	it("wirft Tausenderpunkte weg", () => {
		expect(parseGermanDecimal("1.307,60").toString()).toBe("1307.6");
		expect(parseGermanDecimal("1.234.567,89").toString()).toBe("1234567.89");
	});

	it("akzeptiert Vorzeichen und Leerraum", () => {
		expect(parseGermanDecimal("  +42,00 ").toString()).toBe("42");
		expect(parseGermanDecimal("0,00").isZero()).toBe(true);
	});

	it("wirft bei unlesbarem Betrag statt still NaN zu liefern", () => {
		expect(() => parseGermanDecimal("")).toThrow();
		expect(() => parseGermanDecimal("k.A.")).toThrow(/nicht lesbar/);
	});
});

describe("Rundung", () => {
	// Der Grund für decimal.js: Math.round(-0.5) ergibt -0, Python rundet
	// ROUND_HALF_UP weg von der Null. Negative Beträge sind hier die Regel.
	it("rundet bei Gleichstand weg von der Null — auch negativ", () => {
		expect(roundToCents(new Money("0.005")).toFixed(2)).toBe("0.01");
		expect(roundToCents(new Money("-0.005")).toFixed(2)).toBe("-0.01");
		expect(roundToCents(new Money("-2.675")).toFixed(2)).toBe("-2.68");
	});

	it("weicht damit von Math.round ab", () => {
		expect(Math.round(-0.5)).toBe(-0); // Referenz: genau das wollen wir nicht
		expect(roundToCents(new Money("-0.5")).toFixed(1)).toBe("-0.5");
		expect(new Money("-0.5").toDecimalPlaces(0).toString()).toBe("-1");
	});

	it("summiert exakt, wo Fließkomma driftet", () => {
		expect(0.1 + 0.2).not.toBe(0.3); // Referenz
		const sum = sumMoney([new Money("0.1"), new Money("0.2")]);
		expect(sum.toFixed(2)).toBe("0.30");
	});

	it("liefert für die leere Liste 0", () => {
		expect(sumMoney([]).isZero()).toBe(true);
	});
});

describe("Formatierung", () => {
	it("schreibt ins Journal mit Punkt (hledger-Standard)", () => {
		expect(formatJournalAmount(new Money("-39.95"))).toBe("-39.95");
		expect(formatJournalAmount(new Money("1307.6"))).toBe("1307.60");
	});

	it("schreibt in Notizen deutsch mit Tausenderpunkt", () => {
		expect(formatGermanAmount(new Money("1234.5"))).toBe("1.234,50");
		expect(formatGermanAmount(new Money("-1234567.89"))).toBe("-1.234.567,89");
		expect(formatGermanAmount(new Money("0"))).toBe("0,00");
		expect(formatGermanEuro(new Money("-1996.86"))).toBe("-1.996,86 €");
	});

	it("gruppiert erst ab vier Stellen", () => {
		expect(formatGermanAmount(new Money("999"))).toBe("999,00");
		expect(formatGermanAmount(new Money("1000"))).toBe("1.000,00");
	});

	it("ist roundtrip-stabil gegen parseGermanDecimal", () => {
		for (const raw of ["-39,95", "1.307,60", "0,00", "-1.234.567,89"]) {
			expect(formatGermanAmount(parseGermanDecimal(raw))).toBe(
				raw.replace(/^\+/, ""),
			);
		}
	});
});
