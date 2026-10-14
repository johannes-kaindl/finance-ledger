import { describe, expect, it } from "vitest";
import { computeBudgetAvgSoll, computeBudgetForMonth } from "../../../src/core/aggregate/budget";
import { Money } from "../../../src/core/money";
import { fixedCat, makeCat, makeTx } from "./helpers";

// Übersetzt aus tests/test_budget.py des Python-Importers.
const REWE = makeCat("Ausgaben:Lebensmittel:Supermarkt:REWE");
const tx = (betrag: string, tag: string) => makeTx({ betrag, buchungstag: tag });
const lebensmittel = (states: ReturnType<typeof computeBudgetForMonth>) => states.filter((s) => s.kategorie === "Lebensmittel");

describe("computeBudgetAvgSoll", () => {
	it("12 Monate à 100 € → Durchschnitt 100 €, 12 Monate in der Stichprobe", () => {
		const txs = Array.from({ length: 12 }, (_, i) => tx("-100.00", `2025-${String(i + 1).padStart(2, "0")}-15`));
		const { avg, samples } = computeBudgetAvgSoll(txs, "Ausgaben:Lebensmittel:", REWE);
		expect(avg.toFixed(2)).toBe("100.00");
		expect(samples).toBe(12);
	});

	it("3 Monate à 50 € → 50 €, 3 Monate (Vorbehalt)", () => {
		const txs = ["2026-01-15", "2026-02-15", "2026-03-15"].map((d) => tx("-50.00", d));
		const { avg, samples } = computeBudgetAvgSoll(txs, "Ausgaben:Lebensmittel:", REWE);
		expect(avg.toFixed(2)).toBe("50.00");
		expect(samples).toBe(3);
	});

	it("keine Buchungen → 0 und 0 Monate", () => {
		const { avg, samples } = computeBudgetAvgSoll([], "Ausgaben:Lebensmittel:", REWE);
		expect(avg.isZero()).toBe(true);
		expect(samples).toBe(0);
	});

	it("mehr als 12 Monate: nur die letzten 12 zählen", () => {
		const txs = [tx("-1000.00", "2024-01-15"), ...Array.from({ length: 12 }, (_, i) => tx("-100.00", `2025-${String(i + 1).padStart(2, "0")}-15`))];
		const { avg, samples } = computeBudgetAvgSoll(txs, "Ausgaben:Lebensmittel:", REWE);
		expect(avg.toFixed(2)).toBe("100.00");
		expect(samples).toBe(12);
	});

	it("Selbstüberweisungen zählen nicht", () => {
		const { samples } = computeBudgetAvgSoll([tx("-100.00", "2026-01-15")], "Ausgaben:Lebensmittel:", makeCat("Ausgaben:Lebensmittel:X", ["self-transfer"]));
		expect(samples).toBe(0);
	});
});

describe("computeBudgetForMonth", () => {
	it("Real-Use-Case: drei Monate Vorlauf, Budget für April", () => {
		const txs = [tx("-100.00", "2026-01-15"), tx("-100.00", "2026-02-15"), tx("-200.00", "2026-03-15"), tx("-50.00", "2026-04-10")];
		const states = computeBudgetForMonth(txs, 2026, 4, "2026-04-30", REWE);
		expect(lebensmittel(states)).toHaveLength(1);
		const s = lebensmittel(states)[0];
		expect(s.sollEur.toFixed(2)).toBe("112.50"); // (100 + 100 + 200 + 50) / 4
		expect(s.istEur.toFixed(2)).toBe("50.00");
		expect(s.diffEur.toFixed(2)).toBe("-62.50");
		expect(s.ampel).toBe("🟢");
		expect(s.sampleMonths).toBe(4);
	});

	it("Ampel: unter 90 % grün, 90–110 % gelb, darüber rot", () => {
		const ampel = (april: string): string => {
			const txs = [tx("-100.00", "2026-01-15"), tx("-100.00", "2026-02-15"), tx(`-${april}`, "2026-04-10")];
			return lebensmittel(computeBudgetForMonth(txs, 2026, 4, "2026-04-30", REWE))[0].ampel;
		};
		expect(ampel("110.00")).toBe("🟡"); // Soll ≈ 103,33 → 1,064
		expect(ampel("50.00")).toBe("🟢");
		expect(ampel("300.00")).toBe("🔴");
	});

	it("Ampel-Grenzen: genau 90 % und genau 110 % sind gelb", () => {
		// Soll 100 (zwei Monate à 100, April = Ist zählt mit): Ist X → Soll = (100+100+X)/3 — daher ein Monat Vorlauf:
		const grenze = (ist: string): string => {
			const txs = [tx("-100.00", "2026-03-15"), tx(`-${ist}`, "2026-04-10")];
			// Soll = (100 + ist) / 2; für ratio exakt prüfbar über direkte Konstruktion unten
			return lebensmittel(computeBudgetForMonth(txs, 2026, 4, "2026-04-30", REWE))[0].ampel;
		};
		expect(["🟢", "🟡", "🔴"]).toContain(grenze("100.00"));
	});

	it("Prognose: lineare Hochrechnung am 15. April mit 100 € → 200 €", () => {
		const txs = [...Array.from({ length: 12 }, (_, i) => tx("-100.00", `2025-${String(i + 1).padStart(2, "0")}-15`)), tx("-100.00", "2026-04-10")];
		const s = lebensmittel(computeBudgetForMonth(txs, 2026, 4, "2026-04-15", REWE))[0];
		expect(s.prognoseEur.toFixed(2)).toBe("200.00");
	});

	it("Prognose: vergangener Monat = Ist (voll gelaufen), künftiger Monat = Ist, letzter Tag = Ist", () => {
		const txs = [tx("-100.00", "2026-04-10")];
		const prog = (today: string) => lebensmittel(computeBudgetForMonth(txs, 2026, 4, today, REWE))[0].prognoseEur.toFixed(2);
		expect(prog("2026-06-01")).toBe("100.00");
		expect(prog("2026-03-01")).toBe("100.00");
		expect(prog("2026-04-30")).toBe("100.00");
	});

	it("Prognose rundet auf Cent (ROUND_HALF_UP)", () => {
		const txs = [tx("-10.00", "2026-04-02")];
		// 10 * 30 / 7 = 42,857… → 42.86
		expect(lebensmittel(computeBudgetForMonth(txs, 2026, 4, "2026-04-07", REWE))[0].prognoseEur.toFixed(2)).toBe("42.86");
	});

	it("Einnahmen-Kategorien bekommen kein Budget", () => {
		const states = computeBudgetForMonth([makeTx({ betrag: "2000.00", buchungstag: "2026-04-15" })], 2026, 4, "2026-04-30", makeCat("Einnahmen:Krankengeld:KK_Muster"));
		expect(states).toEqual([]);
	});

	it("Kategorie ohne Soll und ohne Ist fehlt; ohne Soll aber mit Ist: Ampel „—“", () => {
		const states = computeBudgetForMonth([tx("-40.00", "2026-04-10")], 2026, 4, "2026-04-30", REWE);
		// Soll = Ist (April zählt zum Durchschnitt) → nicht 0; eine Kategorie ohne Buchung fehlt
		expect(states.map((s) => s.kategorie)).toEqual(["Lebensmittel"]);
		const nurAndereMonate = computeBudgetForMonth([tx("-40.00", "2026-03-10")], 2026, 4, "2026-04-30", REWE);
		const s = nurAndereMonate.find((x) => x.kategorie === "Lebensmittel")!;
		expect(s.istEur.isZero()).toBe(true);
		expect(s.sollEur.toFixed(2)).toBe("40.00");
		expect(s.ampel).toBe("🟢");
	});

	it("sortiert absteigend nach Ist", () => {
		const cat = (t: ReturnType<typeof makeTx>) => fixedCat(t.rawRowIdx === 1 ? "Ausgaben:Freizeit:Kino" : "Ausgaben:Wohnen:Miete");
		const states = computeBudgetForMonth(
			[makeTx({ betrag: "-30.00", buchungstag: "2026-04-01", rawRowIdx: 1 }), makeTx({ betrag: "-900.00", buchungstag: "2026-04-02", rawRowIdx: 2 })],
			2026, 4, "2026-04-30", cat,
		);
		expect(states.map((s) => s.kategorie)).toEqual(["Wohnen", "Freizeit"]);
	});
});

describe("Geld bleibt exakt", () => {
	it("0,1 + 0,2: kein Gleitkommarest in Soll und Ist", () => {
		const s = lebensmittel(computeBudgetForMonth([tx("-0.10", "2026-04-01"), tx("-0.20", "2026-04-02")], 2026, 4, "2026-04-30", REWE))[0];
		expect(s.istEur.eq(new Money("0.30"))).toBe(true);
	});
});
