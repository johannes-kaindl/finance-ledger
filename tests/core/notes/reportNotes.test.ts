import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { parseVertraegeConfig } from "../../../src/core/config/vertraege";
import { REPORT_FILENAME, renderReport } from "../../../src/core/notes/reportNotes";
import { fixedCat, IBAN_K1, makeTx } from "../aggregate/helpers";
import { config, importMit, makeCtx } from "./goldenVault";

/**
 * Goldmuster: Lauf des Python-Importers (mit Report) am 2026-10-18 auf den Eingaben unter `fixtures/berichte/`. Gewollte
 * Unterschiede zu Python werden vor dem Vergleich angeglichen (siehe Kopf von `reportNotes.ts`): das Pipe in Wikilinks
 * der Tabellen, die zwei fest eingebauten Hinweise des Python-Autors, der korrigierte Satz zu den Vertrags-Notes.
 */
const TODAY = "2026-10-18";
const normal = (t: string): string =>
	t
		.replace(/\\\|/g, "|")
		.replace(/^- \*\*(Anfangssalden fehlen|Visa-Daten-Lücke):\*\*.*\n/gm, "")
		.replace(/^_Keine bekannten Issues\._\n/gm, "")
		.replace(/^_(Existierende|Bestehende) Notes .*_$/gm, "_Satz_");

const VERTRAEGE = parseVertraegeConfig({
	vertraege: [
		{ filename: "Acme Power – Strom.md", ledger_kategorie: "Ausgaben:Wohnen:Strom", vertragspartner: "Acme Power", vertrag_kategorie: "Wohnen", vertrag_subkategorie: "Strom", abbucht_von_konto: "k1" },
		{ filename: "Insure AG – Haftpflicht.md", ledger_kategorie: "Ausgaben:Versicherung:Haftpflicht", vertragspartner: "Insure AG", vertrag_kategorie: "Versicherung", vertrag_subkategorie: "Haftpflicht", abbucht_von_konto: "k2" },
	],
}).vertraege;

describe("Import-Report gegen den Python-Importer (Goldmuster)", () => {
	it("stimmt bis auf die gewollten Unterschiede mit dem Python-Report überein", async () => {
		const { files } = await importMit(makeCtx(TODAY), { report: true, stammdaten: { vertraege: VERTRAEGE } });
		const mine = files.get("Finanzplan/Ledger/import_report.md") ?? "";
		const gold = readFileSync(join(__dirname, "fixtures", "dimensionen", "import_report.md"), "utf-8");
		expect(normal(mine)).toBe(normal(gold));
	});

	it("schreibt ohne die Option keinen Report und meldet ihn beim zweiten Lauf nicht erneut", async () => {
		const ohne = await importMit(makeCtx(TODAY), {});
		expect(ohne.result.importReportWritten).toBe(false);
		const first = await importMit(makeCtx(TODAY), { report: true });
		expect(first.result.importReportWritten).toBe(true);
		const second = await importMit(makeCtx(TODAY), { report: true }, { port: first.port, files: first.files });
		expect(second.result.importReportWritten).toBe(false);
	});

	it("zieht an einem späteren Tag nach, behält `created` und den Teil unter dem Block", async () => {
		const first = await importMit(makeCtx(TODAY), { report: true });
		const path = "Finanzplan/Ledger/import_report.md";
		first.files.set(path, (first.files.get(path) ?? "").replace("_Eigene Anmerkungen zum Import-Report — wird bei Re-Run NICHT überschrieben._", "Meine Notiz."));
		const second = await importMit(makeCtx("2026-10-19"), { report: true }, { port: first.port, files: first.files });
		const text = second.files.get(path) ?? "";
		expect(text).toContain("created: 2026-10-18\n");
		expect(text).toContain("updated: 2026-10-19\n");
		expect(text).toContain("Auto-generiert am 2026-10-19");
		expect(text).toContain("Meine Notiz.");
	});
});

describe("Import-Report — Inhalt", () => {
	const ctx = createImporterContext({ konten: parseKontenConfig(config.konten), notesPrefix: "Finanzplan", clock: fixedClock(TODAY) });
	const eintrag = (over: Parameters<typeof makeTx>[0], tags: string[] = [], gegen = "Ausgaben:Sonstiges:X", rule = "r") => ({
		tx: makeTx({ accountIban: IBAN_K1, ...over }),
		result: { ...fixedCat(gegen, tags), ruleName: rule },
	});
	const bericht = (categorized: ReturnType<typeof eintrag>[]) =>
		renderReport(ctx, { categorized, vertraege: [], journalLinkPath: "Finanzplan/Ledger" });

	it("entschärft Fremdtext in den Tabellenzellen (Pipe, Zeilenumbruch, Klammern)", () => {
		const text = bericht([eintrag({ beguenstigter: "A|B\n[[x]]" }, ["tbc", "unkategorisiert"])]);
		const zeilen = text.split("\n").filter((l) => l.includes("A\\|B"));
		expect(zeilen).toHaveLength(2); // Abschnitt 3 und 4
		for (const z of zeilen) expect(z).not.toContain("[[x]]");
		expect(text).toContain("A\\|B x");
	});

	it("kürzt den Beispiel-Empfänger auf 40 und den Zähler-Schlüssel auf 50 Zeichen, nach Zeichen", () => {
		const lang = "𝒜".repeat(60);
		const text = bericht([eintrag({ beguenstigter: lang }, ["tbc", "unkategorisiert"])]);
		expect(text).toContain(`| ${"𝒜".repeat(40)} |`);
		expect(text).toContain(`\`${"𝒜".repeat(50)}\``);
	});

	it("nennt Abschnitte ohne Fund und meldet NOTPROVIDED und Vorgemerktes aus den Buchungen", () => {
		const leer = bericht([eintrag({})]);
		expect(leer).toContain("_Keine TBC-Markierungen._");
		expect(leer).toContain("_Keine PayPal-Buchungen._");
		expect(leer).toContain("_Keine Self-Transfers._");
		expect(leer).toContain("_Keine bekannten Issues._");
		const voll = bericht([eintrag({ beguenstigter: "NOTPROVIDED", info: "Umsatz vorgemerkt" })]);
		expect(voll).toContain("**NOTPROVIDED Beguenstigter:** 1 Buchungen");
		expect(voll).toContain("**Vorgemerkte Buchungen:** 1");
		expect(voll).not.toContain("_Keine bekannten Issues._");
	});

	it("rechnet die Quote ohne Volumen als 0.00 %", () => {
		expect(bericht([])).toContain("**Quote:** 0.00% des EUR-Volumens unkategorisiert (0.00 von 0.00 EUR)");
	});

	it("legt den Report neben das Journal", () => {
		expect(REPORT_FILENAME).toBe("import_report.md");
	});
});
