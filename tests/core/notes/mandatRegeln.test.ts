import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { AKTIV_SCHWELLE_TAGE, planMandatNotes, type VertragNotiz } from "../../../src/core/notes/mandatNotes";
import { planRuleBodies } from "../../../src/core/notes/ruleBodies";
import { IBAN_K1, makeCat, makeTx } from "../aggregate/helpers";
import { config, importMit, makeCtx, vaultMitCsvs } from "./goldenVault";

/**
 * Goldmuster: Lauf des Python-Importers (`--all-mandate-notes --all-categorizer-rule-bodies`) auf den Eingaben unter
 * `fixtures/berichte/` am 2026-10-18 (Stromrechnung und Versicherung tragen dort eine Mandatsreferenz). Der Vergleich
 * über den ganzen Bestand läuft mit `npm run parity`.
 */
const GOLD = join(__dirname, "fixtures", "dimensionen");
const EINGANG = join(__dirname, "fixtures", "regeln-eingang");
const TODAY = "2026-10-18";
const lies = (pfad: string): string => readFileSync(pfad, "utf-8");

const REGELN = ["acme power", "kontofuehrung"];

/** Vault mit den CSVs und den Regel-Notizen im Zustand vor dem Rumpf. */
function vaultMitRegeln() {
	const vault = vaultMitCsvs();
	for (const name of REGELN) vault.files.set(`Finanzplan/55-Categorizer-Rules/${name}.md`, lies(join(EINGANG, `${name}.md`)));
	return vault;
}

describe("Mandate und Regel-Rümpfe gegen den Python-Importer (Goldmuster)", () => {
	it.each(["mandat-acme-001", "mandat-insure-7"])("50-Mandate/%s.md ist byte-gleich", async (name) => {
		const { files } = await importMit(makeCtx(TODAY), { mandate: true });
		expect(files.get(`Finanzplan/50-Mandate/${name}.md`)).toBe(lies(join(GOLD, "50-Mandate", `${name}.md`)));
	});

	it.each(REGELN)("Regel-Notiz %s ist byte-gleich", async (name) => {
		const { files } = await importMit(makeCtx(TODAY), { regelRuempfe: { folder: "Finanzplan/55-Categorizer-Rules" } }, vaultMitRegeln());
		expect(files.get(`Finanzplan/55-Categorizer-Rules/${name}.md`)).toBe(lies(join(GOLD, "55-Categorizer-Rules", `${name}.md`)));
	});

	it("schreibt ohne die Optionen weder Mandate noch Rümpfe", async () => {
		const { result, files } = await importMit(makeCtx(TODAY), {}, vaultMitRegeln());
		expect(result.mandatNotesWritten).toBe(0);
		expect(result.ruleBodiesWritten).toBe(0);
		expect([...files.keys()].some((p) => p.includes("/50-Mandate/"))).toBe(false);
		expect(files.get("Finanzplan/55-Categorizer-Rules/acme power.md")).toBe(lies(join(EINGANG, "acme power.md")));
	});

	it("zählt geänderte Notizen und fasst unveränderte am selben Tag nicht an", async () => {
		const optionen = { mandate: true, regelRuempfe: { folder: "Finanzplan/55-Categorizer-Rules" } };
		const first = await importMit(makeCtx(TODAY), optionen, vaultMitRegeln());
		expect(first.result.mandatNotesWritten).toBe(2);
		expect(first.result.ruleBodiesWritten).toBe(2);
		const second = await importMit(makeCtx(TODAY), optionen, { port: first.port, files: first.files });
		expect(second.result.mandatNotesWritten).toBe(0);
		expect(second.result.ruleBodiesWritten).toBe(0);
	});
});

describe("Mandate", () => {
	const ctx = createImporterContext({
		konten: parseKontenConfig(config.konten),
		notesPrefix: "Finanzplan",
		clock: fixedClock(TODAY),
	});
	const cat = makeCat("Ausgaben:Wohnen:Strom");
	const tx = (tag: string, mandat: string, extra = {}) =>
		makeTx({ accountIban: IBAN_K1, buchungstag: tag, mandatsreferenz: mandat, glaeubigerId: "DE98ZZZ1", ...extra });

	it("überspringt Buchungen ohne Mandatsreferenz", () => {
		expect(planMandatNotes(ctx, [tx("2026-10-01", ""), tx("2026-10-01", "  ")], cat, [], {})).toEqual([]);
	});

	it(`gilt als aktiv bis ${AKTIV_SCHWELLE_TAGE} Tage nach der letzten Buchung, danach nicht`, () => {
		// 2026-10-18 minus 35 Tage = 2026-09-13, minus 36 Tage = 2026-09-12
		const grenze = planMandatNotes(ctx, [tx("2026-09-13", "M1")], cat, [], {})[0]?.content ?? "";
		const drueber = planMandatNotes(ctx, [tx("2026-09-12", "M1")], cat, [], {})[0]?.content ?? "";
		expect(grenze).toContain("aktiv: true\n");
		expect(drueber).toContain("aktiv: false\n");
		expect(drueber).toContain("⚠️ inaktiv");
	});

	it("verlinkt den Vertrag mit passender mandats_id und zieht den Verweis in einer bestehenden Notiz nach", () => {
		const vertraege: VertragNotiz[] = [
			{ filename: "Zweiter.md", text: '---\nmandats_id: "M1"\n---\n' },
			{ filename: "Erster.md", text: '---\nmandats_id: "M1"\n---\n' },
			{ filename: "Anderer.md", text: '---\nmandats_id: "M2"\n---\n' },
		];
		const ohne = planMandatNotes(ctx, [tx("2026-10-01", "M1")], cat, [], {})[0];
		expect(ohne?.content).toContain("vertrag_link: null\n");
		const mit = planMandatNotes(ctx, [tx("2026-10-01", "M1")], cat, vertraege, { [ohne?.path ?? ""]: ohne?.content ?? "" })[0];
		// Die erste Datei nach Name gewinnt.
		expect(mit?.content).toContain("vertrag_link:\n  - [[Finanzplan/20-Verträge/Anderer]]".replace("Anderer", "Erster"));
		expect(mit?.content).toContain("[[Finanzplan/20-Verträge/Erster|Erster]]");
		expect(mit?.content).not.toContain("vertrag_link: null");
	});

	it("hält Zeilenumbruch, Pipe und Klammern des Verwendungszwecks aus der Tabelle", () => {
		const t = tx("2026-10-01", "M1", { verwendungszweck: "Zeile eins\nZeile |zwei| [[x]] <b>`c`" });
		const inhalt = planMandatNotes(ctx, [t], cat, [], {})[0]?.content ?? "";
		const zeile = inhalt.split("\n").find((l) => l.includes("Zeile eins")) ?? "";
		expect(zeile).toContain("Zeile eins Zeile \\|zwei\\| x &lt;b&gt;c |");
		expect(zeile.endsWith("|")).toBe(true);
	});
});

describe("Regel-Rümpfe", () => {
	const ctx = createImporterContext({
		konten: parseKontenConfig(config.konten),
		notesPrefix: "Finanzplan",
		clock: fixedClock(TODAY),
	});
	const regel = (inhalt: string) => `---\nkategorie: categorizer-rule\npattern: kiosk\nledger_account: "Ausgaben:Sonstiges:Kiosk"\npriority: 7\n---\n${inhalt}`;

	it("lässt Notizen ohne Regel-Frontmatter, andere Arten und die Ordner-Notiz unberührt", () => {
		const pläne = planRuleBodies(ctx, [], [
			{ path: "R/ohne.md", text: "kein Frontmatter\n" },
			{ path: "R/art.md", text: "---\nkategorie: konto\n---\n" },
			{ path: "R/55-Categorizer-Rules.md", text: regel("") },
			{ path: "R/_README – Categorizer-Rules.md", text: regel("") },
			{ path: "R/echt.md", text: regel("") },
		]);
		expect(pläne.map((p) => p.path)).toEqual(["R/echt.md"]);
	});

	it("schreibt höchstens fünf passende Buchungen, in Eingabereihenfolge, und meldet ein veraltetes Muster", () => {
		const viele = Array.from({ length: 7 }, (_, i) => makeTx({ buchungstag: `2026-04-0${i + 1}`, beguenstigter: "Kiosk am Eck" }));
		const text = planRuleBodies(ctx, viele, [{ path: "R/echt.md", text: regel("") }])[0]?.content ?? "";
		expect(text.match(/\\\|2026-04-0\d\]\]/g)).toHaveLength(5);
		expect(text).toContain("2026-04-05");
		expect(text).not.toContain("2026-04-06");
		expect(text).toContain("| Priority | 7 |");
		const leer = planRuleBodies(ctx, [], [{ path: "R/echt.md", text: regel("") }])[0]?.content ?? "";
		expect(leer).toContain("Pattern eventuell veraltet");
	});

	it("verändert weder Frontmatter noch den Benutzerteil unter dem Block", () => {
		const erst = planRuleBodies(ctx, [], [{ path: "R/echt.md", text: regel("\n# Meine Regel\n") }])[0]?.content ?? "";
		const bearbeitet = erst.replace("_Eigene Anmerkungen zu dieser Rule", "Meine Gedanken. _Eigene Anmerkungen zu dieser Rule");
		const zweit = planRuleBodies(ctx, [], [{ path: "R/echt.md", text: bearbeitet }])[0]?.content ?? "";
		expect(zweit).toBe(bearbeitet);
		expect(erst.startsWith("---\nkategorie: categorizer-rule\npattern: kiosk\n")).toBe(true);
		expect(erst).toContain("# Meine Regel");
	});
});
