import { describe, expect, it } from "vitest";
import { createImporterContext, DEFAULT_PROJEKT_KEY, fixedClock, normalizeProjektKey } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { parseSparzieleConfig } from "../../../src/core/config/sparziele";
import { parseVertraegeConfig } from "../../../src/core/config/vertraege";
import { config, importMit } from "./goldenVault";

/**
 * Der Schlüssel der Verknüpfung zur Projektnotiz (`projektbezug`) ist eine Einstellung: das Vault-Schema des Maintainers kennt `projekt`,
 * andere Nutzer haben `projektbezug` in ihren Notizen. Der Standard bleibt `projektbezug`, damit sich für sie nichts ändert und die
 * Parität zum Python-Importer unberührt bleibt (Welle 28, Entscheidung Johannes).
 */
const TODAY = "2026-10-18";

const VERTRAEGE = parseVertraegeConfig({
	vertraege: [
		{ filename: "Acme Power – Strom.md", ledger_kategorie: "Ausgaben:Wohnen:Strom", vertragspartner: "Acme Power", vertrag_kategorie: "Wohnen", vertrag_subkategorie: "Strom", abbucht_von_konto: "k1" },
		{ filename: "Insure AG – Haftpflicht.md", ledger_kategorie: "Ausgaben:Versicherung:Haftpflicht", vertragspartner: "Insure AG", vertrag_kategorie: "Versicherung", vertrag_subkategorie: "Haftpflicht", abbucht_von_konto: "k2" },
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

const ctxMit = (projektKey?: string) =>
	createImporterContext({ konten: parseKontenConfig(config.konten), notesPrefix: "Finanzplan", clock: fixedClock(TODAY), ...(projektKey === undefined ? {} : { projektKey }) });

async function alles(projektKey?: string): Promise<Map<string, string>> {
	const { files } = await importMit(ctxMit(projektKey), { berichte: true, dimensionen: true, mandate: true, report: true, stammdaten: { vertraege: VERTRAEGE }, sparziele: SPARZIELE });
	return new Map([...files].filter(([p]) => p.endsWith(".md")));
}

const ordnerVon = (p: string): string => p.split("/").slice(0, -1).join("/").replace(/^Finanzplan\//, "");

describe("normalizeProjektKey", () => {
	it("nimmt einen einfachen Schlüssel und trimmt ihn", () => {
		expect(normalizeProjektKey("projekt")).toBe("projekt");
		expect(normalizeProjektKey("  projekt_bezug-2 ")).toBe("projekt_bezug-2");
	});
	it("folgt der Regel des Kits: Leerzeichen, Punkte und eine Ziffer vorweg sind erlaubt", () => {
		for (const v of ["Projekt Bezug", "a.b", "1projekt", "_projekt"]) expect(normalizeProjektKey(v)).toBe(v);
	});
	it("fällt bei leer, undefiniert oder unbrauchbar auf den Standard zurück (Doppelpunkt, Anführungszeichen, #, Klammern, Punkt oder Strich vorweg)", () => {
		for (const v of [undefined, "", "   ", "projekt:", '"projekt"', ".projekt", "-projekt", "pro#jekt", "[projekt]", "a: b"]) {
			expect(normalizeProjektKey(v)).toBe(DEFAULT_PROJEKT_KEY);
		}
		expect(DEFAULT_PROJEKT_KEY).toBe("projektbezug");
	});
});

describe("Schlüssel der Projektverknüpfung in allen neun Schreibstellen", () => {
	it("Gegenprobe: ohne Einstellung schreibt jede Gattung weiter `projektbezug`", async () => {
		const files = await alles();
		const mit = [...files].filter(([, t]) => /^projektbezug:\n  - "\[\[Finanzplan\/Finanzplan\]\]"$/m.test(t));
		expect(mit.length).toBeGreaterThan(20);
		expect([...files].filter(([, t]) => /^projekt:/m.test(t))).toEqual([]);
	});

	it("mit `projekt` steht der Schlüssel in jeder Gattung, die ihn vorher trug, und `projektbezug` nirgends mehr", async () => {
		const vorher = await alles();
		const nachher = await alles("projekt");
		const gattungen = (m: Map<string, string>, re: RegExp) => new Set([...m].filter(([, t]) => re.test(t)).map(([p]) => ordnerVon(p)));
		const alt = gattungen(vorher, /^projektbezug:\n/m);
		const neu = gattungen(nachher, /^projekt:\n  - "\[\[Finanzplan\/Finanzplan\]\]"$/m);
		expect(alt.size).toBeGreaterThanOrEqual(8);
		expect([...neu].sort()).toEqual([...alt].sort());
		expect([...nachher].filter(([, t]) => /^projektbezug:/m.test(t))).toEqual([]);
		// Dateien mit Schlüssel: gleich viele wie vorher, ansonsten byte-gleich bis auf den Schlüsselnamen
		for (const [p, t] of vorher) expect(nachher.get(p)).toBe(t.replace(/^projektbezug:$/m, "projekt:"));
	});
});
