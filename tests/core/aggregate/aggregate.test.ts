import { describe, expect, it } from "vitest";
import {
	type Categorizer,
	aggregateTransactions,
	inMonth,
	kategorienTabelle,
	kennzahlenTabelle,
	topEmpfaenger,
	topKategorienForPie,
	zweiStellen,
} from "../../../src/core/aggregate/aggregate";
import { Money } from "../../../src/core/money";
import { fixedContext } from "./kontext";
import { fixedCat, IBAN_K1, IBAN_K3, makeCat, makeTx } from "./helpers";

// Übersetzt aus den `_aggregate_period`-Tests des Python-Importers (tests/test_monatsbericht.py).
const april = inMonth({ year: 2026, month: 4 });
const agg = (txs: ReturnType<typeof makeTx>[], cat: Categorizer, opts = {}) =>
	aggregateTransactions(txs, april, cat, opts);
const eq = (m: { toFixed: (n: number) => string }, s: string) => expect(m.toFixed(2)).toBe(s);

describe("aggregateTransactions — Grundlogik", () => {
	it("summiert Ausgaben je Kategorie", () => {
		const r = agg(
			[makeTx({ betrag: "-100.00", buchungstag: "2026-04-01" }), makeTx({ betrag: "-50.00", buchungstag: "2026-04-30" })],
			makeCat("Ausgaben:Lebensmittel:Supermarkt:REWE"),
		);
		eq(r.ausgabenGesamt, "150.00");
		eq(r.kategorie.get("lebensmittel")!, "150.00");
	});

	it("Periodenfilter ist exklusiv: Vor- und Folgemonat zählen nicht", () => {
		const r = agg(
			[
				makeTx({ betrag: "-99.00", buchungstag: "2026-03-31" }),
				makeTx({ betrag: "-10.00", buchungstag: "2026-04-01" }),
				makeTx({ betrag: "-88.00", buchungstag: "2026-05-01" }),
			],
			makeCat("Ausgaben:Lebensmittel:Supermarkt:REWE"),
		);
		eq(r.ausgabenGesamt, "10.00");
	});

	it("Selbstüberweisungen werden übersprungen", () => {
		const r = agg([makeTx({ betrag: "-200.00", buchungstag: "2026-04-05" })], makeCat("Aktiva:Bank:Sparkasse:Vermietung", ["self-transfer"]));
		eq(r.ausgabenGesamt, "0.00");
		eq(r.einnahmenGesamt, "0.00");
	});

	it("Einnahmen werden aggregiert, der Detail-Schlüssel ist der Teil ab dem dritten Segment", () => {
		const r = agg([makeTx({ betrag: "2521.80" })], makeCat("Einnahmen:Krankengeld:AOK"));
		eq(r.einnahmenGesamt, "2521.80");
		eq(r.einnahmenDetails.get("AOK")!, "2521.80");
		const tief = agg([makeTx({ betrag: "10.00" })], makeCat("Einnahmen:Miete:Wohnung:A:B"));
		expect([...tief.einnahmenDetails.keys()]).toEqual(["Wohnung:A:B"]);
		const flach = agg([makeTx({ betrag: "10.00" })], makeCat("Einnahmen:Zinsen"));
		expect([...flach.einnahmenDetails.keys()]).toEqual(["Zinsen"]);
	});

	it("Saldo und Sparquote", () => {
		const r = agg(
			[makeTx({ betrag: "1000.00", buchungstag: "2026-04-10" }), makeTx({ betrag: "-600.00", buchungstag: "2026-04-20" })],
			(tx) => (tx.betrag.gt(0) ? fixedCat("Einnahmen:Test:Gehalt") : fixedCat("Ausgaben:Lebensmittel:Supermarkt:REWE")),
		);
		eq(r.saldo, "400.00");
		expect(r.sparquoteProzent).toBe(40);
	});

	it("Sicht privat: schließt die Vermietungs-IBAN aus; Sicht Vermietung: nur diese", () => {
		const txs = [
			makeTx({ betrag: "-300.00", accountIban: IBAN_K1, buchungstag: "2026-04-05" }),
			makeTx({ betrag: "-500.00", accountIban: IBAN_K3, buchungstag: "2026-04-05" }),
		];
		const cat = makeCat("Ausgaben:Wohnen:Vermietung:Strom_EON");
		eq(agg(txs, cat, { excludeIban: IBAN_K3 }).ausgabenGesamt, "300.00");
		eq(agg(txs, cat, { onlyIban: IBAN_K3 }).ausgabenGesamt, "500.00");
	});

	it("leere Periode: Nullen, kein Absturz", () => {
		const r = agg([makeTx({ betrag: "-50.00", buchungstag: "2025-12-31" })], makeCat("Ausgaben:Lebensmittel:Supermarkt:REWE"));
		eq(r.ausgabenGesamt, "0.00");
		eq(r.einnahmenGesamt, "0.00");
		eq(r.saldo, "0.00");
		expect(r.sparquoteProzent).toBe(0);
	});

	it("Gutschrift in einem Ausgaben-Konto mindert die Kategorie", () => {
		const r = agg(
			[makeTx({ betrag: "-100.00", buchungstag: "2026-04-01" }), makeTx({ betrag: "30.00", buchungstag: "2026-04-15" })],
			makeCat("Ausgaben:Lebensmittel:Supermarkt:REWE"),
		);
		eq(r.kategorie.get("lebensmittel")!, "70.00");
		eq(r.ausgabenGesamt, "70.00");
	});

	it("fix = Wohnen + Versicherung + Kommunikation, variabel = Rest", () => {
		const mapping: Record<number, string> = {
			1: "Ausgaben:Wohnen:Privat:Strom_EnBW",
			2: "Ausgaben:Versicherung:KFZ:VW",
			3: "Ausgaben:Kommunikation:Festnetz:TK",
			4: "Ausgaben:Lebensmittel:Supermarkt:REWE",
		};
		const r = agg(
			[
				makeTx({ betrag: "-100.00", buchungstag: "2026-04-01", rawRowIdx: 1 }),
				makeTx({ betrag: "-50.00", buchungstag: "2026-04-02", rawRowIdx: 2 }),
				makeTx({ betrag: "-30.00", buchungstag: "2026-04-03", rawRowIdx: 3 }),
				makeTx({ betrag: "-20.00", buchungstag: "2026-04-04", rawRowIdx: 4 }),
			],
			(tx) => fixedCat(mapping[tx.rawRowIdx]),
		);
		eq(r.kategorie.get("fix")!, "180.00");
		eq(r.kategorie.get("variabel")!, "20.00");
	});

	it("Einmal-Ausgaben: null ohne Posten, sonst die Summe", () => {
		expect(agg([makeTx({ betrag: "-50.00", buchungstag: "2026-04-01" })], makeCat("Ausgaben:Sonstiges:Friseur")).ausgabenEinmalig).toBeNull();
		const r = agg([makeTx({ betrag: "-865.00", buchungstag: "2026-04-01" })], makeCat("Ausgaben:Sonstiges:Einmalig:Elektronik:MediaMarkt"));
		eq(r.ausgabenEinmalig!, "865.00");
	});
});

describe("Sparquote: Pythons round(x, 1) auf dem Float", () => {
	const quote = (einnahme: string, ausgabe: string): number => {
		const cat = (tx: ReturnType<typeof makeTx>) => (tx.betrag.gt(0) ? fixedCat("Einnahmen:X:Y") : fixedCat("Ausgaben:Lebensmittel:S"));
		return aggregateTransactions([makeTx({ betrag: einnahme }), makeTx({ betrag: `-${ausgabe}` })], april, cat).sparquoteProzent;
	};
	it("gewöhnlich auf eine Stelle", () => {
		expect(quote("3000.00", "2000.00")).toBe(33.3);
		expect(quote("3000.00", "1000.00")).toBe(66.7);
	});
	it("echter Gleichstand (exakt darstellbar) geht auf die gerade Stelle wie in Python: 12.25 → 12.2, 18.75 → 18.8", () => {
		// 12.25 %: saldo/einnahmen = 0.1225 → einnahmen 400, saldo 49
		expect(quote("400.00", "351.00")).toBe(12.2);
		// 18.75 %: 3/16
		expect(quote("1600.00", "1300.00")).toBe(18.8);
	});
	it("nicht exakt darstellbarer Gleichstand folgt dem Wert des Floats: 0.35 liegt unter dem Tie → 0.3", () => {
		// 0.35 %: saldo 7, einnahmen 2000
		expect(quote("2000.00", "1993.00")).toBe(0.3);
	});
	it("negative Sparquote", () => {
		expect(quote("1000.00", "1100.00")).toBe(-10);
	});
});

describe("zweiStellen", () => {
	it("ROUND_HALF_UP: bei Gleichstand weg von der Null", () => {
		expect(zweiStellen(new Money("1.005")).toFixed(2)).toBe("1.01");
		expect(zweiStellen(new Money("-1.005")).toFixed(2)).toBe("-1.01");
	});
});

describe("Tabellen", () => {
	const ctx = fixedContext();
	const r = aggregateTransactions(
		[
			makeTx({ betrag: "-300.00", buchungstag: "2026-04-01", rawRowIdx: 1 }),
			makeTx({ betrag: "-100.00", buchungstag: "2026-04-02", rawRowIdx: 2 }),
			makeTx({ betrag: "2000.00", buchungstag: "2026-04-03", rawRowIdx: 3 }),
		],
		april,
		(tx) => fixedCat(tx.rawRowIdx === 1 ? "Ausgaben:Wohnen:Miete" : tx.rawRowIdx === 2 ? "Ausgaben:Online_Shopping:X" : "Einnahmen:A:Gehalt"),
	);

	it("Kennzahlen-Tabelle", () => {
		expect(kennzahlenTabelle(r)).toBe(
			["| Kennzahl | Wert |", "|---|---:|", "| Einnahmen | 2.000,00 € |", "| Ausgaben | 400,00 € |", "| Saldo | 1.600,00 € |", "| Sparquote | 80.0 % |"].join("\n"),
		);
	});

	it("Kategorien-Tabelle ohne Wikilinks: absteigend, ohne leere Kategorien, mit Summenzeile", () => {
		expect(kategorienTabelle(ctx, r, false)).toBe(
			["| Kategorie | Betrag | Anteil % |", "|---|---:|---:|", "| Wohnen | 300,00 € | 75.0% |", "| Online Shopping | 100,00 € | 25.0% |", "| **Summe** | **400,00 €** | 100% |"].join("\n"),
		);
	});

	it("Kategorien-Tabelle mit Wikilinks: der Alias-Trenner ist escaped", () => {
		const t = kategorienTabelle(ctx, r, true);
		expect(t).toContain("[[");
		expect(t).toContain("\\|Wohnen]]");
	});

	it("Kuchendiagramm: Top-N ohne leere Kategorien, absteigend", () => {
		expect(topKategorienForPie(r).map((i) => i.name)).toEqual(["Wohnen", "Online Shopping"]);
		expect(topKategorienForPie(r, 1)).toHaveLength(1);
	});
});

describe("topEmpfaenger", () => {
	const cat = (tx: ReturnType<typeof makeTx>) =>
		fixedCat(tx.beguenstigter === "Gehalt GmbH" ? "Einnahmen:A:B" : tx.beguenstigter.startsWith("Rewe") ? "Ausgaben:Lebensmittel:REWE" : "Ausgaben:Freizeit:Kino");
	const txs = [
		makeTx({ beguenstigter: "Rewe  Markt", betrag: "-30.00" }),
		makeTx({ beguenstigter: "Rewe Markt", betrag: "-20.00" }),
		makeTx({ beguenstigter: "Kino", betrag: "-60.00" }),
		makeTx({ beguenstigter: "Gehalt GmbH", betrag: "3000.00" }),
		makeTx({ beguenstigter: "", buchungstext: "DAUERAUFTRAG", betrag: "-5.00" }),
	];

	it("nach Volumen absteigend; Einnahmen fehlen; Leerraum wird normalisiert; Zahl und dominantes Konto", () => {
		const top = topEmpfaenger(txs, april, cat);
		expect(top.map((e) => [e.counterparty, e.volumen.toFixed(2), e.anzahl])).toEqual([
			["Kino", "60.00", 1],
			["Rewe Markt", "50.00", 2],
			["DAUERAUFTRAG", "5.00", 1],
		]);
		expect(top[1].ledgerAccount).toBe("Ausgaben:Lebensmittel:REWE");
	});

	it("Limit und leerer Name", () => {
		expect(topEmpfaenger(txs, april, cat, { limit: 1 })).toHaveLength(1);
		expect(topEmpfaenger([makeTx({ beguenstigter: " ", buchungstext: "", betrag: "-1.00" })], april, cat)[0].counterparty).toBe("(unbekannt)");
	});

	it("kürzt nach Codepoints auf 60 Zeichen", () => {
		const lang = "😀".repeat(70);
		const top = topEmpfaenger([makeTx({ beguenstigter: lang, betrag: "-1.00" })], april, cat);
		expect(Array.from(top[0].counterparty)).toHaveLength(60);
	});

	it("dominantes Konto: bei Gleichstand das zuerst gesehene", () => {
		const zwei = [makeTx({ beguenstigter: "X", betrag: "-10.00" }), makeTx({ beguenstigter: "X", betrag: "-10.00" })];
		let n = 0;
		const top = topEmpfaenger(zwei, april, () => fixedCat(n++ === 0 ? "Ausgaben:A:1" : "Ausgaben:B:2"));
		expect(top[0].ledgerAccount).toBe("Ausgaben:A:1");
	});
});
