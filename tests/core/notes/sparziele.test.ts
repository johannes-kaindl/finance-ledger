import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { parseSparzieleConfig } from "../../../src/core/config/sparziele";
import { planSparziele } from "../../../src/core/notes/sparzielNotes";
import { config, importMit, makeCtx } from "./goldenVault";

/**
 * Goldmuster: Lauf des Python-Importers (`--all-sparziele`) am 2026-10-18 mit zwei Zielen auf den Konten der
 * Goldmuster-Eingaben (`sparziele.yaml` als Zuordnung unten). Der Vergleich über den ganzen Bestand läuft mit `npm run parity`.
 */
const GOLD = join(__dirname, "fixtures", "dimensionen", "30-Sparziele");
const TODAY = "2026-10-18";

const ROH = {
	sparziele: [
		{
			filename: "Notgroschen.md", title: "Notgroschen", sparziel_typ: "notgroschen", zielbetrag_eur: 6500,
			sparrate_monatlich_eur: 200, geplantes_ziel_datum: "2029-06-30", gespart_auf_konto: "k2",
			ledger_kategorie: "Aktiva:Sparzweck:Notgroschen", aliases: ["Sicherheitsreserve"], sticker: "lucide//life-buoy",
		},
		{
			filename: "Reise.md", title: "Reise", sparziel_typ: "konkret", zielbetrag_eur: 2500.5,
			sparrate_monatlich_eur: 80, geplantes_ziel_datum: null, gespart_auf_konto: "k1",
			ledger_kategorie: "Aktiva:Sparzweck:Reise", aliases: ["Urlaub", "Auszeit"], sticker: "lucide//plane",
		},
	],
};
const specs = parseSparzieleConfig(ROH).sparziele;
const ctx = createImporterContext({ konten: parseKontenConfig(config.konten), notesPrefix: "Finanzplan", clock: fixedClock(TODAY) });
const lies = (n: string): string => readFileSync(join(GOLD, n), "utf-8");

describe("Sparziel-Notizen gegen den Python-Importer (Goldmuster)", () => {
	it.each(["Notgroschen.md", "Reise.md"])("%s ist byte-gleich", async (name) => {
		const { files } = await importMit(makeCtx(TODAY), { sparziele: specs });
		expect(files.get(`Finanzplan/30-Sparziele/${name}`)).toBe(lies(name));
	});

	it("schreibt ohne die Option keine Sparziel-Notiz", async () => {
		const { result, files } = await importMit(makeCtx(TODAY), {});
		expect(result.sparzielNotesWritten).toBe(0);
		expect([...files.keys()].some((p) => p.includes("/30-Sparziele/"))).toBe(false);
	});
});

describe("Sparziel-Notizen — bestehende", () => {
	const pfad = "Finanzplan/30-Sparziele/Reise.md";

	it("zieht den Block nach, lässt Frontmatter (aktueller_stand_eur) und Eigenes stehen", () => {
		const eigen = lies("Reise.md")
			.replace("aktueller_stand_eur: null", "aktueller_stand_eur: 1200")
			.replace("_Eigene Anmerkungen zu diesem Sparziel (Strategie / Meilensteine / Quartal-Reviews) — wird bei Re-Run NICHT überschrieben._", "Meine Notiz.")
			.replace("| Sparrate | 80.00 €/Mon |", "| Sparrate | 79.00 €/Mon |");
		const { plans, skipped } = planSparziele(ctx, specs.slice(1), { [pfad]: eigen });
		expect(skipped).toEqual([]);
		const neu = plans[0]?.content ?? "";
		expect(neu).toContain("aktueller_stand_eur: 1200\n");
		expect(neu).toContain("Meine Notiz.");
		expect(neu).toContain("| Sparrate | 80.00 €/Mon |");
		expect(neu).not.toContain("79.00");
	});

	it("rührt eine Notiz ohne Marker-Block nicht an und meldet sie", () => {
		const { plans, skipped } = planSparziele(ctx, specs.slice(1), { [pfad]: "---\ntitle: Reise\n---\nMeine Notiz\n" });
		expect(plans).toEqual([]);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]).toContain("ohne BEGIN/END-Marker");
	});

	it("fasst unveränderte Notizen nicht neu an (zweiter Lauf)", async () => {
		const first = await importMit(makeCtx(TODAY), { sparziele: specs });
		const second = await importMit(makeCtx(TODAY), { sparziele: specs }, { port: first.port, files: first.files });
		expect(second.result.sparzielNotesWritten).toBe(0);
	});
});

describe("Sparziel-Rechnung", () => {
	const mit = (ziel: number, rate: number) =>
		planSparziele(ctx, parseSparzieleConfig({ sparziele: [{ ...ROH.sparziele[0], zielbetrag_eur: ziel, sparrate_monatlich_eur: rate }] }).sparziele, {}).plans[0]?.content ?? "";

	it("zeigt unter einem Jahr Monate, sonst Jahre mit einer Nachkommastelle", () => {
		expect(mit(600, 100)).toContain("| ETA bei aktueller Sparrate | 6 Mon. |");
		expect(mit(1200, 100)).toContain("| ETA bei aktueller Sparrate | 1.0 J |");
	});

	it("rundet einen exakten Gleichstand wie Python auf die gerade Stelle (0.125 → 0.12, 0.375 → 0.38)", () => {
		// ×0.5 von 0.25 ist exakt 0.125, ×1.5 von 0.25 exakt 0.375
		const text = mit(100, 0.25);
		expect(text).toContain("| Konservativ (×0.5) | 0.12 €/Mon |");
		expect(text).toContain("| Aggressiv (×1.5) | 0.38 €/Mon |");
	});

	it("nennt ein unbekanntes Konto, statt zu raten", () => {
		const text = planSparziele(ctx, parseSparzieleConfig({ sparziele: [{ ...ROH.sparziele[0], gespart_auf_konto: "gibt-es-nicht" }] }).sparziele, {}).plans[0]?.content ?? "";
		expect(text).toContain("- Spar-Konto: _unbekannt_");
		expect(text).toContain("[[Finanzplan/10-Konten/?]]");
	});
});

describe("parseSparzieleConfig", () => {
	it("akzeptiert eine fehlende oder leere Datei", () => {
		expect(parseSparzieleConfig(null).sparziele).toEqual([]);
		expect(parseSparzieleConfig({}).sparziele).toEqual([]);
	});

	it("sammelt alle Mängel und meldet sie zusammen", () => {
		const schlecht = { sparziele: [{ filename: "a.md" }, { ...ROH.sparziele[0], sparrate_monatlich_eur: 0 }, ROH.sparziele[0], ROH.sparziele[0]] };
		let meldung = "";
		try { parseSparzieleConfig(schlecht); } catch (e) { meldung = (e as Error).message; }
		expect(meldung).toContain("sparziele[0]: Pflichtfeld(er) fehlen");
		expect(meldung).toContain("sparziele[1]: sparrate_monatlich_eur muss größer als 0 sein");
		expect(meldung).not.toContain("sparziele[2]");
		expect(meldung).toContain("sparziele[3]: Dateiname doppelt vergeben: Notgroschen.md");
	});
});
