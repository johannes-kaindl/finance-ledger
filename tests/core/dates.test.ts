import { describe, expect, it } from "vitest";
import {
	addDays,
	daysBetween,
	daysInMonth,
	endOfMonth,
	isLeapYear,
	monthKey,
	parseGermanDate,
	quarterKey,
	splitIsoDate,
} from "../../src/core/dates";

describe("parseGermanDate", () => {
	it("liest DD.MM.YY als 2000+JJ", () => {
		expect(parseGermanDate("01.08.25")).toBe("2025-08-01");
		expect(parseGermanDate("31.12.99")).toBe("2099-12-31");
	});

	it("umgeht die Date-Falle für zweistellige Jahre", () => {
		// new Date(25, 7, 1) wäre 1925 — genau deshalb rechnet der Kern mit Strings.
		expect(new Date(25, 7, 1).getFullYear()).toBe(1925); // Referenz
		expect(parseGermanDate("01.08.25").startsWith("2025")).toBe(true);
	});

	it("nimmt auch vierstellige Jahre und einstellige Tage", () => {
		expect(parseGermanDate("5.3.2026")).toBe("2026-03-05");
	});

	it("wirft bei leerem oder unerwartetem Datum", () => {
		expect(() => parseGermanDate("")).toThrow(/DD\.MM\.YY/);
		expect(() => parseGermanDate("2025-08-01")).toThrow(/DD\.MM\.YY/);
		expect(() => parseGermanDate("32.01.25")).toThrow(/existiert nicht/);
		expect(() => parseGermanDate("01.13.25")).toThrow(/außerhalb/);
	});

	it("kennt Schaltjahre", () => {
		expect(parseGermanDate("29.02.24")).toBe("2024-02-29");
		expect(() => parseGermanDate("29.02.25")).toThrow(/existiert nicht/);
	});
});

describe("Kalender-Bausteine", () => {
	it("zählt Tage im Monat", () => {
		expect(daysInMonth(2025, 2)).toBe(28);
		expect(daysInMonth(2024, 2)).toBe(29);
		expect(daysInMonth(2025, 4)).toBe(30);
		expect(daysInMonth(2025, 12)).toBe(31);
	});

	it("kennt die 100/400-Regel", () => {
		expect(isLeapYear(2000)).toBe(true);
		expect(isLeapYear(1900)).toBe(false);
		expect(isLeapYear(2024)).toBe(true);
	});

	it("liefert Monatsende und Perioden-Schlüssel", () => {
		expect(endOfMonth(2025, 2)).toBe("2025-02-28");
		expect(monthKey("2025-08-01")).toBe("2025-08");
		expect(quarterKey("2025-01-31")).toBe("2025-Q1");
		expect(quarterKey("2025-08-01")).toBe("2025-Q3");
		expect(quarterKey("2025-12-31")).toBe("2025-Q4");
	});

	it("zerlegt ISO-Daten und meldet Unsinn", () => {
		expect(splitIsoDate("2025-08-01")).toEqual({
			year: 2025,
			month: 8,
			day: 1,
		});
		expect(() => splitIsoDate("01.08.2025")).toThrow(/Kein ISO-Datum/);
	});
});

describe("daysBetween", () => {
	it("zählt über Monats- und Jahresgrenzen", () => {
		expect(daysBetween("2025-08-01", "2025-08-31")).toBe(30);
		expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
		expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // Schalttag dazwischen
		expect(daysBetween("2025-08-31", "2025-08-01")).toBe(-30);
	});

	it("ist zeitzonenfrei — keine Sommerzeit-Verschiebung", () => {
		// Die Umstellung liegt in dieser Spanne; mit Date-Differenzen käme 0,958… heraus.
		expect(daysBetween("2025-03-29", "2025-03-31")).toBe(2);
		expect(daysBetween("2025-10-25", "2025-10-27")).toBe(2);
	});
});

describe("addDays", () => {
	it("zählt Tage vorwärts über eine Monatsgrenze", () => {
		expect(addDays("2026-05-10", 30)).toBe("2026-06-09");
	});

	it("zählt rückwärts", () => {
		expect(addDays("2026-06-09", -30)).toBe("2026-05-10");
	});

	it("trifft den Schalttag", () => {
		expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
	});

	it("überspringt Jahreswechsel", () => {
		expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
		expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
	});

	it("ist die Umkehrung von daysBetween", () => {
		expect(daysBetween("2026-05-10", addDays("2026-05-10", 91))).toBe(91);
	});
});
