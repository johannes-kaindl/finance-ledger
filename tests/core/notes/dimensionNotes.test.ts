import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	MIN_POSTINGS,
	detectEmpfaenger,
	detectKategorien,
	planDimensionNotes,
} from "../../../src/core/notes/dimensionNotes";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import type { BankTransaction } from "../../../src/core/import/transaction";
import { fixedCat, IBAN_K1, makeCat, makeTx } from "../aggregate/helpers";
import { config, importMit, makeCtx } from "./goldenVault";

/**
 * Goldmuster: ein Lauf des Python-Importers (`--all-kategorie-notes --all-empfaenger-notes --all-tx-typ-notes`) auf
 * den synthetischen Eingaben unter `fixtures/berichte/` am 2026-10-18. Der TS-Lauf muss dieselben Notizen Byte für
 * Byte liefern — das ist die Abnahme von Etappe E6. Ausgewählt sind Notizen, die alle Zweige tragen (mehrere
 * Konten unter einer Kategorie, Einnahmen- und Ausgaben-Empfänger, Tx-Typ mit und ohne Top-Liste); der Vergleich über
 * den ganzen Bestand läuft mit `npm run parity`.
 *
 * Eine bekannte Abweichung: Pythons Kategorie-Notiz titelt ihren Callout mit dem Namen des letzten Top-Empfängers
 * („Miete“ statt „Wohnen“), weil `_render_body` die Variable `canonical` in der Tabellenschleife überschreibt. Die
 * beiden Kategorie-Goldmuster tragen deshalb die richtige Überschrift, alles andere ist unverändert.
 */
const GOLD = join(__dirname, "fixtures", "dimensionen");
const TODAY = "2026-10-18";

const golden: Array<[string, string]> = [
	["Finanzplan/45-Kategorien/wohnen.md", "45-Kategorien/wohnen.md"],
	["Finanzplan/45-Kategorien/sonstiges.md", "45-Kategorien/sonstiges.md"],
	["Finanzplan/60-Empfänger/ausgaben-lebensmittel-northwind.md", "60-Empfänger/ausgaben-lebensmittel-northwind.md"],
	["Finanzplan/60-Empfänger/einnahmen-gehalt-globex.md", "60-Empfänger/einnahmen-gehalt-globex.md"],
	["Finanzplan/50-Tx-Typen/karte.md", "50-Tx-Typen/karte.md"],
	["Finanzplan/50-Tx-Typen/ueberweisung_ein.md", "50-Tx-Typen/ueberweisung_ein.md"],
];

describe("Dimensions-Notizen gegen den Python-Importer (Goldmuster)", () => {
	it.each(golden)("%s ist byte-gleich", async (path, name) => {
		const { files } = await importMit(makeCtx(TODAY), { dimensionen: true });
		expect(files.get(path)).toBe(readFileSync(join(GOLD, name), "utf-8"));
	});

	it("schreibt 16 Kategorien, 19 Empfänger und 6 Tx-Typen", async () => {
		const { result, files } = await importMit(makeCtx(TODAY), { dimensionen: true });
		expect(result.dimensionNotesWritten).toBe(41);
		expect([...files.keys()].filter((p) => p.includes("/45-Kategorien/"))).toHaveLength(16);
		expect([...files.keys()].filter((p) => p.includes("/60-Empfänger/"))).toHaveLength(19);
		expect([...files.keys()].filter((p) => p.includes("/50-Tx-Typen/"))).toHaveLength(6);
	});

	it("schreibt ohne die Option keine Dimensions-Notiz", async () => {
		const { result, files } = await importMit(makeCtx(TODAY), {});
		expect(result.dimensionNotesWritten).toBe(0);
		expect([...files.keys()].some((p) => /\/(45|50|60)-/.test(p))).toBe(false);
	});
});

describe("Dimensions-Notizen — zweiter Lauf", () => {
	it("fasst unveränderte Notizen am selben Tag nicht an", async () => {
		const ctx = makeCtx(TODAY);
		const first = await importMit(ctx, { dimensionen: true });
		const second = await importMit(ctx, { dimensionen: true }, { port: first.port, files: first.files });
		expect(second.result.dimensionNotesWritten).toBe(0);
	});

	it("zieht an einem späteren Tag nach, ohne Eigenes zu verlieren, und behält `created`", async () => {
		const first = await importMit(makeCtx(TODAY), { dimensionen: true });
		const path = "Finanzplan/45-Kategorien/wohnen.md";
		const original = first.files.get(path) ?? "";
		const edited = original
			.replace("  - finanzen/kategorie-note\n", "  - finanzen/kategorie-note\n  - mein-tag\n")
			.replace("aggregat_base: shared\n", "aggregat_base: shared\nmein_feld: 42\n")
			.replace("_Eigene Anmerkungen zu dieser Kategorie — wird bei Re-Run NICHT überschrieben._", "Meine Gedanken zur Miete.");
		expect(edited).not.toBe(original);
		first.files.set(path, edited);

		const second = await importMit(makeCtx("2026-10-19"), { dimensionen: true }, { port: first.port, files: first.files });
		const after = second.files.get(path) ?? "";

		expect(after).toContain("  - mein-tag\n");
		expect(after).toContain("mein_feld: 42\n");
		expect(after).toContain("Meine Gedanken zur Miete.");
		expect(after).toContain("created: 2026-10-18\n");
		expect(after).toContain("updated: 2026-10-19\n");
		expect(after).toContain("generated: 2026-10-19\n");
	});

	it("erneuert die Konten-Liste einer bestehenden Kategorie", async () => {
		const first = await importMit(makeCtx(TODAY), { dimensionen: true });
		const path = "Finanzplan/45-Kategorien/wohnen.md";
		const original = first.files.get(path) ?? "";
		const veraltet = original.replace(/ledger_accounts:\n(  - .*\n)+/, "ledger_accounts:\n  - Ausgaben:Wohnen:Alt\n");
		expect(veraltet).not.toBe(original);
		first.files.set(path, veraltet);

		const second = await importMit(makeCtx(TODAY), { dimensionen: true }, { port: first.port, files: first.files });
		expect(second.files.get(path)).toBe(original);
	});
});

describe("Auswahl", () => {
	const ctx = createImporterContext({
		konten: parseKontenConfig(config.konten),
		notesPrefix: "Finanzplan",
		clock: fixedClock(TODAY),
	});
	const tx = (betrag: string, beguenstigter: string, text = "LASTSCHRIFT") =>
		makeTx({ accountIban: IBAN_K1, buchungstag: "2026-04-03", betrag, beguenstigter, buchungstext: text });

	it("nimmt einen Empfänger ab fünf Buchungen oder 200 € auf, darunter nicht", () => {
		const fünf = Array.from({ length: MIN_POSTINGS }, () => tx("-1.00", "Kiosk"));
		const grossEinzeln = [tx("-200.00", "Händler")];
		const knapp = [tx("-199.99", "Händler"), ...Array.from({ length: MIN_POSTINGS - 1 }, () => tx("-1.00", "Kiosk"))];
		const cat = (t: BankTransaction) => fixedCat(t.beguenstigter === "Kiosk" ? "Ausgaben:Sonstiges:Kiosk" : "Ausgaben:Sonstiges:Haendler");
		expect(detectEmpfaenger(fünf, cat).map((e) => e.ledgerAccount)).toEqual(["Ausgaben:Sonstiges:Kiosk"]);
		expect(detectEmpfaenger(grossEinzeln, cat).map((e) => e.ledgerAccount)).toEqual(["Ausgaben:Sonstiges:Haendler"]);
		expect(detectEmpfaenger(knapp, cat)).toEqual([]);
	});

	it("überspringt Bank-Interna und Selbstüberweisungen", () => {
		const cat = makeCat("Ausgaben:Sonstiges:X");
		const intern = Array.from({ length: 6 }, () => tx("-50.00", "ENTGELTABSCHLUSS lt. Anlage"));
		expect(detectEmpfaenger(intern, cat)).toEqual([]);
		const selbst = makeCat("Aktiva:Sonstige", ["self-transfer"]);
		expect(detectKategorien([tx("-50.00", "Eigenes Konto")], selbst)).toEqual([]);
		expect(detectEmpfaenger([tx("-500.00", "Eigenes Konto")], selbst)).toEqual([]);
	});

	it("sortiert Empfänger nach Volumen absteigend, Gleichstand nach erstem Auftreten", () => {
		const cat = (t: BankTransaction) => fixedCat(`Ausgaben:Sonstiges:${t.beguenstigter}`);
		const txs = [tx("-300.00", "B"), tx("-500.00", "A"), tx("-300.00", "C")];
		expect(detectEmpfaenger(txs, cat).map((e) => e.counterpartyCanonical)).toEqual(["A", "B", "C"]);
	});

	it("plant nichts für einen leeren Bestand", () => {
		expect(planDimensionNotes(ctx, [], makeCat("Ausgaben:Wohnen:X"), {})).toEqual([]);
	});

	it("hält Pipe und Klammern aus Bankdaten aus der Tabelle", () => {
		const cat = makeCat("Ausgaben:Sonstiges:Haendler");
		const plans = planDimensionNotes(ctx, [tx("-250.00", "A|B [[x]]")], cat, {});
		const empf = plans.find((p) => p.path.endsWith("/ausgaben-sonstiges-haendler.md"))?.content ?? "";
		expect(empf).toContain("| A\\|B x |");
		expect(empf).not.toContain("[[x]]");
	});
});
