import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { parseSparzieleConfig } from "../../../src/core/config/sparziele";
import { parseVertraegeConfig } from "../../../src/core/config/vertraege";
import { config, importMit } from "./goldenVault";

/**
 * Die vier Reste der Schema-Anpassung (Welle 34, Entscheidung Johannes 2026-11-14): `lebensbereich` heißt `ausgabengruppe`,
 * `vertrag_link: null` entfällt, `created`/`updated` tragen wie die Berichte eine Uhrzeit, und eine IBAN ist kein Aktenzeichen.
 */
const TODAY = "2026-10-18";

const VERTRAEGE = parseVertraegeConfig({
	vertraege: [
		{ filename: "Acme Power – Strom.md", ledger_kategorie: "Ausgaben:Wohnen:Strom", vertragspartner: "Acme Power", vertrag_kategorie: "Wohnen", vertrag_subkategorie: "Strom", abbucht_von_konto: "k1" },
	],
}).vertraege;

const SPARZIELE = parseSparzieleConfig({
	sparziele: [
		{
			filename: "Notgroschen.md", title: "Notgroschen", sparziel_typ: "notgroschen", zielbetrag_eur: 6500,
			sparrate_monatlich_eur: 200, geplantes_ziel_datum: "2029-06-30", gespart_auf_konto: "k2",
			ledger_kategorie: "Aktiva:Sparzweck:Notgroschen", aliases: ["Sicherheitsreserve"], sticker: "lucide//life-buoy",
		},
	],
}).sparziele;

async function alles(): Promise<Map<string, string>> {
	const ctx = createImporterContext({ konten: parseKontenConfig(config.konten), notesPrefix: "Finanzplan", clock: fixedClock(TODAY) });
	const { files } = await importMit(ctx, { berichte: true, dimensionen: true, mandate: true, report: true, stammdaten: { vertraege: VERTRAEGE }, sparziele: SPARZIELE });
	return new Map([...files].filter(([p]) => p.endsWith(".md")));
}

const zeilen = (text: string, schluessel: string): string[] => text.split("\n").filter((z) => z.startsWith(`${schluessel}:`));

describe("Import-Notizen: Schema-Rest", () => {
	it("die Kategorie-Notizen tragen ausgabengruppe, nirgends steht lebensbereich als Schlüssel", async () => {
		const notizen = await alles();
		const kategorien = [...notizen].filter(([p]) => p.includes("45-Kategorien"));
		expect(kategorien.length).toBeGreaterThan(0);
		for (const [p, text] of kategorien) {
			expect(zeilen(text, "ausgabengruppe"), p).toHaveLength(1);
		}
		for (const [p, text] of notizen) expect(zeilen(text, "lebensbereich"), p).toEqual([]);
	});

	it("eine Mandats-Notiz ohne Vertrag schreibt kein vertrag_link", async () => {
		const mandate = [...(await alles())].filter(([p]) => p.includes("50-Mandate"));
		expect(mandate.length).toBeGreaterThan(0);
		for (const [p, text] of mandate) {
			if (!text.includes("vertrag_link:\n")) expect(zeilen(text, "vertrag_link"), p).toEqual([]);
		}
	});

	it("created und updated tragen in jeder Import-Notiz eine Uhrzeit", async () => {
		const notizen = [...(await alles())].filter(([, t]) => t.includes("created:"));
		expect(notizen.length).toBeGreaterThan(10);
		for (const [p, text] of notizen) {
			for (const k of ["created", "updated"]) {
				for (const z of zeilen(text, k)) expect(z, `${p}: ${k}`).toMatch(/^(created|updated): \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
			}
		}
	});
});
