import { describe, expect, it } from "vitest";
import { createImporterContext } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import {
	categorizerRuleWikilink,
	empfaengerWikilink,
	jahresberichtWikilink,
	kategorieWikilink,
	kontoWikilink,
	monatsberichtWikilink,
	parseMonatsberichtLabel,
	parseQuartalsberichtLabel,
	quartalsberichtWikilink,
} from "../../../src/core/notes/wikilinks";

const konten = parseKontenConfig({
	konten: [
		{
			id: "hauptkonto",
			iban: "DE1",
			ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto",
			bank: "Sparkasse",
			konto_typ: "giro",
			konto_rolle: "hauptkonto",
			csv_schema: "camt52",
			inhaber: "Max Mustermann",
		},
	],
});

const ctx = createImporterContext({ konten, notesPrefix: "Finanzplan" });

describe("kategorieWikilink", () => {
	it("baut den Link mit Title-Case als Vorgabe-Anzeige", () => {
		expect(kategorieWikilink(ctx, "lebensmittel")).toBe(
			"[[Finanzplan/45-Kategorien/lebensmittel|Lebensmittel]]",
		);
	});

	it("macht aus Unterstrichen im Anzeigenamen Leerzeichen", () => {
		expect(kategorieWikilink(ctx, "essen_auswaerts")).toBe(
			"[[Finanzplan/45-Kategorien/essen_auswaerts|Essen Auswaerts]]",
		);
	});

	it("übernimmt eine ausdrückliche Anzeige unverändert", () => {
		expect(kategorieWikilink(ctx, "essen_auswaerts", { display: "Essen auswärts" })).toBe(
			"[[Finanzplan/45-Kategorien/essen_auswaerts|Essen auswärts]]",
		);
	});

	it("normalisiert Leerzeichen im Suffix zu Unterstrichen", () => {
		expect(kategorieWikilink(ctx, "Essen Auswaerts", { display: "Essen" })).toBe(
			"[[Finanzplan/45-Kategorien/essen_auswaerts|Essen]]",
		);
	});
});

describe("empfaengerWikilink", () => {
	it("leitet Slug und Anzeige aus dem Ledger-Konto ab", () => {
		expect(empfaengerWikilink(ctx, "Ausgaben:Essen_Auswaerts:Restaurant")).toBe(
			"[[Finanzplan/60-Empfänger/ausgaben-essen-auswaerts-restaurant|Restaurant]]",
		);
	});

	it("übernimmt eine ausdrückliche Anzeige", () => {
		expect(
			empfaengerWikilink(ctx, "Ausgaben:Tech_Abos:KI:Anthropic", {
				display: "Anthropic – Claude",
			}),
		).toBe(
			"[[Finanzplan/60-Empfänger/ausgaben-tech-abos-ki-anthropic|Anthropic – Claude]]",
		);
	});
});

describe("categorizerRuleWikilink", () => {
	it("baut den Link aus dem Regel-Muster", () => {
		expect(categorizerRuleWikilink(ctx, "anthropic")).toBe(
			"[[Finanzplan/55-Categorizer-Rules/anthropic|anthropic]]",
		);
	});

	it("macht Leerzeichen im Muster zu Bindestrichen", () => {
		expect(categorizerRuleWikilink(ctx, "Deutsche Bahn")).toBe(
			"[[Finanzplan/55-Categorizer-Rules/deutsche-bahn|Deutsche Bahn]]",
		);
	});
});

describe("kontoWikilink", () => {
	it("schneidet die Dateiendung ab und nutzt den Rest als Anzeige", () => {
		expect(kontoWikilink(ctx, "Konto 01 – Hauptkonto Sparkasse.md")).toBe(
			"[[Finanzplan/10-Konten/Konto 01 – Hauptkonto Sparkasse|Konto 01 – Hauptkonto Sparkasse]]",
		);
	});
});

describe("Berichts-Links", () => {
	it("baut den Monatsbericht mit zweistelligem Monat", () => {
		expect(monatsberichtWikilink(ctx, 2026, 4)).toBe(
			"[[Finanzplan/40-Monatsberichte/2026-04 Monatsbericht|2026-04]]",
		);
		expect(monatsberichtWikilink(ctx, 2026, 1)).toContain("2026-01");
	});

	it("baut den Quartalsbericht", () => {
		expect(quartalsberichtWikilink(ctx, 2026, 2)).toBe(
			"[[Finanzplan/70-Quartalsberichte/2026-Q2 Quartalsbericht|2026-Q2]]",
		);
	});

	it("baut den Jahresbericht", () => {
		expect(jahresberichtWikilink(ctx, 2025)).toBe(
			"[[Finanzplan/80-Jahresberichte/2025 Jahresbericht|2025]]",
		);
	});
});

describe("forTable", () => {
	it("escapet den Alias-Trenner, damit die Tabellenzelle nicht zerbricht", () => {
		expect(kategorieWikilink(ctx, "lebensmittel", { forTable: true })).toBe(
			"[[Finanzplan/45-Kategorien/lebensmittel\\|Lebensmittel]]",
		);
	});

	it("lässt den Trenner ohne die Option roh", () => {
		expect(kategorieWikilink(ctx, "lebensmittel")).not.toContain("\\|");
	});

	it("gilt für jeden Link-Bauer", () => {
		const opts = { forTable: true } as const;
		expect(empfaengerWikilink(ctx, "Ausgaben:X:Y", opts)).toContain("\\|");
		expect(categorizerRuleWikilink(ctx, "x", opts)).toContain("\\|");
		expect(kontoWikilink(ctx, "K.md", opts)).toContain("\\|");
		expect(monatsberichtWikilink(ctx, 2026, 4, opts)).toContain("\\|");
		expect(quartalsberichtWikilink(ctx, 2026, 1, opts)).toContain("\\|");
		expect(jahresberichtWikilink(ctx, 2025, opts)).toContain("\\|");
	});
});

describe("Ordner aus dem Kontext", () => {
	it("folgt abweichend eingestellten Ordnernamen", () => {
		const eigener = createImporterContext({
			konten,
			notesPrefix: "Geld",
			folders: { kategorien: "Kategorien", empfaenger: "Wer" },
		});

		expect(kategorieWikilink(eigener, "lebensmittel")).toBe(
			"[[Geld/Kategorien/lebensmittel|Lebensmittel]]",
		);
		expect(empfaengerWikilink(eigener, "Ausgaben:Rewe")).toBe(
			"[[Geld/Wer/ausgaben-rewe|Rewe]]",
		);
		expect(kontoWikilink(eigener, "K.md")).toBe("[[Geld/10-Konten/K|K]]");
	});
});

describe("Perioden-Etiketten", () => {
	it("liest ein Monats-Etikett", () => {
		expect(parseMonatsberichtLabel("2026-04")).toEqual({ year: 2026, month: 4 });
		expect(parseMonatsberichtLabel("2025-12")).toEqual({ year: 2025, month: 12 });
	});

	it("liest ein Quartals-Etikett", () => {
		expect(parseQuartalsberichtLabel("2026-Q2")).toEqual({
			year: 2026,
			quarter: 2,
		});
	});

	it("wirft bei einem Etikett, das keines ist", () => {
		expect(() => parseMonatsberichtLabel("April 2026")).toThrow();
		expect(() => parseQuartalsberichtLabel("2026-2")).toThrow();
	});
});
