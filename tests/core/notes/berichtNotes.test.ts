import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock, type ImporterContext } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { deriveOwnerNames } from "../../../src/core/import/categorize";
import { runImport } from "../../../src/core/import/pipeline";
import { buildRules } from "../../../src/core/import/rules";
import {
	alleBerichtePerioden,
	berichtPath,
	detectJahre,
	detectMonate,
	detectQuartale,
	renderBericht,
} from "../../../src/core/notes/berichtNotes";
import { fixedCat, IBAN_K1, makeTx } from "../aggregate/helpers";
import { FIX, config, importMit, makeCtx as makeGoldenCtx, vaultMitCsvs } from "./goldenVault";

/**
 * Goldmuster: ein Lauf des Python-Importers (`--all-aggregates`) auf den synthetischen Eingaben unter
 * `fixtures/berichte/` am 2026-10-16. Der TS-Lauf muss dieselben Berichte Byte für Byte liefern — das ist die
 * Abnahme von Etappe E5. Die Eingaben erzeugt `fixtures/berichte/gen.py`, alles ist erfunden.
 */
const TODAY = "2026-10-16";
const makeCtx = (today = TODAY): ImporterContext => makeGoldenCtx(today);
const importMitBerichten = (ctx: ImporterContext, vault = vaultMitCsvs()) => importMit(ctx, { berichte: true }, vault);

describe("Berichte gegen den Python-Importer (Goldmuster)", () => {
	const golden: Array<[string, string]> = [
		["Finanzplan/40-Monatsberichte/2025-10 Monatsbericht.md", "2025-10 Monatsbericht.md"],
		["Finanzplan/40-Monatsberichte/2026-04 Monatsbericht.md", "2026-04 Monatsbericht.md"],
		["Finanzplan/70-Quartalsberichte/2026-Q2 Quartalsbericht.md", "2026-Q2 Quartalsbericht.md"],
		["Finanzplan/80-Jahresberichte/2026 Jahresbericht.md", "2026 Jahresbericht.md"],
	];

	it.each(golden)("%s ist byte-gleich", async (path, name) => {
		const { files } = await importMitBerichten(makeCtx());
		expect(files.get(path)).toBe(readFileSync(join(FIX, "golden", name), "utf-8"));
	});

	it("schreibt alle Perioden mit Buchungen: 13 Monate, 5 Quartale, 2 Jahre", async () => {
		const { result, files } = await importMitBerichten(makeCtx());
		expect(result.reportsWritten).toBe(20);
		const berichte = [...files.keys()].filter((p) => /\/(40|70|80)-/.test(p));
		expect(berichte).toHaveLength(20);
	});

	it("schreibt ohne die Option keinen Bericht", async () => {
		const ctx = makeCtx();
		const { port, files } = vaultMitCsvs();
		const result = await runImport({
			vault: port,
			ctx,
			rules: buildRules(config.notes),
			ownerNames: deriveOwnerNames(ctx),
			umsatzDir: "Finanzplan/Umsätze",
			outDir: "Finanzplan/Ledger",
		});
		expect(result.reportsWritten).toBe(0);
		expect([...files.keys()].some((p) => p.includes("berichte") || /\/(40|70|80)-/.test(p))).toBe(false);
	});
});

describe("Berichte — zweiter Lauf", () => {
	it("fasst unveränderte Berichte am selben Tag nicht an", async () => {
		const ctx = makeCtx();
		const first = await importMitBerichten(ctx);
		const second = await importMitBerichten(ctx, { port: first.port, files: first.files });
		expect(second.result.reportsWritten).toBe(0);
	});

	it("zieht an einem späteren Tag nach, ohne Eigenes zu verlieren", async () => {
		const first = await importMitBerichten(makeCtx("2026-10-16"));
		const path = "Finanzplan/40-Monatsberichte/2026-04 Monatsbericht.md";
		const original = first.files.get(path) ?? "";
		// Nutzer ergänzt ein eigenes Tag, ein eigenes Feld und eine Bemerkung unter dem Block.
		const edited = original
			.replace("  - finanzen/monatsbericht\n", "  - finanzen/monatsbericht\n  - mein-tag\n")
			.replace("sticker: lucide//calendar\n", "sticker: lucide//calendar\nmein_feld: 42\n")
			.replace("_Eigene Notizen / Reflexionen — wird bei Re-Run NICHT überschrieben._", "Meine Gedanken zum April.");
		expect(edited).not.toBe(original);
		first.files.set(path, edited);

		const second = await importMitBerichten(makeCtx("2026-10-17"), { port: first.port, files: first.files });
		const after = second.files.get(path) ?? "";

		expect(after).toContain("  - mein-tag\n");
		expect(after).toContain("mein_feld: 42\n");
		expect(after).toContain("Meine Gedanken zum April.");
		// `created` ist das Anlegedatum und bleibt, `updated` und der Erzeugungsstempel ziehen nach.
		expect(after).toContain("created: 2026-10-16 00:00:00");
		expect(after).toContain("updated: 2026-10-17 00:00:00");
		expect(after).toContain("generiert_aus_ledger_am: 2026-10-17");
		// Der Block steht genau einmal da.
		expect(after.match(/<!-- BEGIN: AUTO-GENERATED -->/g)).toHaveLength(1);
	});
});

describe("Perioden", () => {
	const txs = [
		makeTx({ buchungstag: "2025-12-31" }),
		makeTx({ buchungstag: "2026-01-01" }),
		makeTx({ buchungstag: "2026-04-15" }),
		makeTx({ buchungstag: "2026-04-16" }),
	];

	it("findet Monate, Quartale und Jahre aufsteigend", () => {
		expect(detectMonate(txs)).toEqual([
			{ year: 2025, month: 12 },
			{ year: 2026, month: 1 },
			{ year: 2026, month: 4 },
		]);
		expect(detectQuartale(txs)).toEqual([
			{ year: 2025, quarter: 4 },
			{ year: 2026, quarter: 1 },
			{ year: 2026, quarter: 2 },
		]);
		expect(detectJahre(txs)).toEqual([2025, 2026]);
	});

	it("zählt alle Perioden: erst Monate, dann Quartale, dann Jahre", () => {
		expect(alleBerichtePerioden(txs).map((p) => p.art)).toEqual([
			"monat", "monat", "monat", "quartal", "quartal", "quartal", "jahr", "jahr",
		]);
	});

	it("legt Pfade unter den Ordnern des Kontexts an", () => {
		const ctx = makeCtx();
		expect(berichtPath(ctx, { art: "monat", year: 2026, month: 4 })).toBe("Finanzplan/40-Monatsberichte/2026-04 Monatsbericht.md");
		expect(berichtPath(ctx, { art: "quartal", year: 2026, quarter: 2 })).toBe("Finanzplan/70-Quartalsberichte/2026-Q2 Quartalsbericht.md");
		expect(berichtPath(ctx, { art: "jahr", year: 2025 })).toBe("Finanzplan/80-Jahresberichte/2025 Jahresbericht.md");
	});

	it("weist ein Quartal außerhalb 1–4 ab", () => {
		expect(() => berichtPath(makeCtx(), { art: "quartal", year: 2026, quarter: 5 })).toThrow(RangeError);
	});
});

describe("Sichten und Randfälle", () => {
	const einKonto = createImporterContext({
		konten: parseKontenConfig({
			konten: [
				{
					id: "h", iban: IBAN_K1, ledger_account: "Aktiva:Bank:Haupt", bank: "Acme", bic: "X", konto_typ: "giro",
					konto_rolle: "hauptkonto_privat", csv_schema: "sparkasse_camt52", inhaber: "Max", filename: "Konto 01.md",
				},
			],
		}),
		notesPrefix: "Finanzplan",
		clock: fixedClock(TODAY),
	});

	it("lässt ohne Vermietungskonto die Sichten Privat und Vermietung weg (Python brach hier ab)", () => {
		const text = renderBericht(
			einKonto,
			[makeTx({ buchungstag: "2026-04-15", betrag: "-10.00" })],
			() => fixedCat("Ausgaben:Lebensmittel:Supermarkt"),
			{ art: "monat", year: 2026, month: 4 },
		);
		expect(text).toContain("## 📊 Gesamt-Sicht");
		expect(text).not.toContain("Privat-only");
		expect(text).not.toContain("Vermietung-only");
	});

	it("schreibt die Sparquote wie Python: 100.0 statt 100", () => {
		const text = renderBericht(
			einKonto,
			[makeTx({ buchungstag: "2026-04-15", betrag: "500.00" })],
			() => fixedCat("Einnahmen:Gehalt:Firma"),
			{ art: "monat", year: 2026, month: 4 },
		);
		expect(text).toContain("sparquote_prozent: 100.0\n");
		expect(text).toContain("ausgaben_einmalig_eur: null\n");
		expect(text).toContain("| Sparquote | 100.0 % |");
	});

	it("entschärft Empfängernamen aus Bankdaten: kein Pipe, keine Klammern in der Tabellenzelle", () => {
		const text = renderBericht(
			einKonto,
			[makeTx({ buchungstag: "2026-04-15", betrag: "-10.00", beguenstigter: "Evil | x ]] [[Fremd]] GmbH" })],
			() => fixedCat("Ausgaben:Lebensmittel:Supermarkt"),
			{ art: "monat", year: 2026, month: 4 },
		);
		const zeile = text.split("\n").find((l) => l.includes("Evil")) ?? "";
		expect(zeile).toContain("\\|Evil \\| x  Fremd GmbH]]");
		expect(zeile.match(/\]\]/g)).toHaveLength(1);
		// Die Zeile hat genau drei Spalten (vier ungeescapte Pipes).
		expect(zeile.replace(/\\\|/g, "").match(/\|/g)).toHaveLength(4);
	});

	it("legt einen Monat ohne Ausgaben ohne Diagramm und ohne Budget an", () => {
		const text = renderBericht(
			einKonto,
			[makeTx({ buchungstag: "2026-04-15", betrag: "500.00" })],
			() => fixedCat("Einnahmen:Gehalt:Firma"),
			{ art: "monat", year: 2026, month: 4 },
		);
		expect(text).not.toContain("```mermaid");
		expect(text).not.toContain("Budget-Übersicht");
		expect(text).not.toContain("Top-Empfänger");
	});
});
