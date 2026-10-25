import { describe, expect, it } from "vitest";
import { renderNote } from "../../../src/core/notes/dimensionNotes";
import {
	patchFrontmatter,
	readFrontmatter,
} from "../../../src/core/notes/frontmatter";

const NOTE = [
	"---",
	"title: Konto 01 – Hauptkonto",
	"tags:",
	"  - 🏗_Finanzplan",
	"  - finanzen/konto",
	"aliases:",
	"  - Hauptkonto",
	'ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto"',
	"saldo_eur: 280.44",
	"saldo_stand_am: 2026-05-10",
	"created: 2026-05-01",
	"updated: 2026-05-01",
	"---",
	"",
	"# 🏦 Konto 01",
	"",
	"Text.",
	"",
].join("\n");

describe("readFrontmatter", () => {
	it("liest Skalare und beide Listenformen", () => {
		const fm = readFrontmatter(NOTE);
		expect(fm.data.saldo_eur).toBe("280.44");
		expect(fm.data.tags).toEqual(["🏗_Finanzplan", "finanzen/konto"]);
		expect(fm.data.ledger_account).toBe("Aktiva:Bank:Sparkasse:Hauptkonto");
		expect(fm.body.startsWith("\n# 🏦 Konto 01")).toBe(true);
	});

	it("meldet eine Notiz ohne Frontmatter als leer", () => {
		const fm = readFrontmatter("# Nur Text\n");
		expect(fm.order).toEqual([]);
		expect(fm.body).toBe("# Nur Text\n");
	});
});

describe("patchFrontmatter", () => {
	it("ersetzt nur den Wert der eigenen Felder", () => {
		const out = patchFrontmatter(NOTE, {
			set: { saldo_eur: "1234.56", updated: "2026-08-14" },
		});

		expect(out).toContain("saldo_eur: 1234.56");
		expect(out).toContain("updated: 2026-08-14");
		expect(out).toContain("saldo_stand_am: 2026-05-10");
	});

	it("lässt Blocklisten und Anführungszeichen unangetastet", () => {
		const out = patchFrontmatter(NOTE, { set: { saldo_eur: "1.00" } });

		expect(out).toContain("tags:\n  - 🏗_Finanzplan\n  - finanzen/konto");
		expect(out).toContain('ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto"');
	});

	it("lässt den Rumpf zeichengenau", () => {
		const out = patchFrontmatter(NOTE, { set: { saldo_eur: "1.00" } });
		expect(out.slice(out.indexOf("\n---\n") + 5)).toBe(
			NOTE.slice(NOTE.indexOf("\n---\n") + 5),
		);
	});

	it("hängt ein fehlendes eigenes Feld hinten an", () => {
		const out = patchFrontmatter(NOTE, { set: { importiert_am: "2026-08-14" } });
		const fm = readFrontmatter(out);

		expect(fm.data.importiert_am).toBe("2026-08-14");
		expect(fm.order.at(-1)).toBe("importiert_am");
	});

	it("legt ein ensure-Feld nur an, wenn es fehlt", () => {
		const out = patchFrontmatter(NOTE, {
			ensure: { anfangssaldo_eur: "null", saldo_eur: "999.99" },
		});

		expect(out).toContain("anfangssaldo_eur: null");
		expect(out).toContain("saldo_eur: 280.44");
	});

	it("hält ein leer dastehendes Feld für vorhanden", () => {
		const note = "---\nmitinhaber:\nsaldo_eur: 1\n---\n\nText\n";
		const out = patchFrontmatter(note, { ensure: { mitinhaber: "Erika" } });
		expect(out).toContain("mitinhaber:\n");
		expect(out).not.toContain("Erika");
	});

	it("überschreibt created nie, auch nicht über set", () => {
		expect(() =>
			patchFrontmatter(NOTE, { set: { created: "2026-08-14" } }),
		).toThrow(/created/);
	});

	it("verweigert Listen — der Importer besitzt nur Skalare", () => {
		expect(() =>
			patchFrontmatter(NOTE, { set: { tags: "[a, b]" } as never }),
		).not.toThrow();
		expect(() =>
			patchFrontmatter(NOTE, { set: { aliases: ["a"] } as never }),
		).toThrow(/Liste/);
	});

	it("rührt eine Notiz ohne Frontmatter nicht an", () => {
		const plain = "# Nur Text\n";
		expect(patchFrontmatter(plain, { set: { saldo_eur: "1" } })).toBe(plain);
	});

	it("erhält CRLF-Zeilenenden", () => {
		const crlf = "---\r\nsaldo_eur: 1\r\nupdated: alt\r\n---\r\n\r\nText\r\n";
		const out = patchFrontmatter(crlf, { set: { saldo_eur: "2" } });

		expect(out).toBe("---\r\nsaldo_eur: 2\r\nupdated: alt\r\n---\r\n\r\nText\r\n");
	});

	it("trifft nur die erste Zeile eines Schlüssels", () => {
		const doppelt = "---\nsaldo_eur: 1\nsaldo_eur: 2\n---\n\nText\n";
		const out = patchFrontmatter(doppelt, { set: { saldo_eur: "9" } });
		expect(out).toBe("---\nsaldo_eur: 9\nsaldo_eur: 2\n---\n\nText\n");
	});
});

// Die Werte kommen als fertige Skalare aus den Notenbauern (`Money.toFixed(2)`, `"null"`, gequotetes
// `glaeubiger_id`); der Adapter reicht sie dem Kit als Literal, damit ihre Form im Vault nicht kippt.
describe("patchFrontmatter — fertige Skalare des Importers", () => {
	it("lässt anfangssaldo_eur und anfangssaldo_stand_am als null stehen, ohne Anführungszeichen", () => {
		const out = patchFrontmatter(NOTE, {
			ensure: { anfangssaldo_eur: "null", anfangssaldo_stand_am: "null" },
		});
		expect(out).toContain("\nanfangssaldo_eur: null\n");
		expect(out).toContain("\nanfangssaldo_stand_am: null\n");
		expect(out).not.toContain('"null"');
	});

	it("behält die endenden Nullen eines Betrags", () => {
		const out = patchFrontmatter(NOTE, { set: { saldo_eur: "53240.00" } });
		expect(out).toContain("\nsaldo_eur: 53240.00\n");
		expect(readFrontmatter(out).data.saldo_eur).toBe("53240.00");
	});

	it("schreibt Ganzzahl, Wahrheitswert, negativen Betrag und -0.0 (Sparquote) unquotiert", () => {
		const out = patchFrontmatter(NOTE, {
			set: { tx_count: "12", aktiv: "true", saldo_eur: "-39.95", sparquote_prozent: "-0.0" },
		});
		expect(out).toContain("\ntx_count: 12\n");
		expect(out).toContain("\naktiv: true\n");
		expect(out).toContain("\nsaldo_eur: -39.95\n");
		expect(out).toContain("\nsparquote_prozent: -0.0\n");
	});

	it("schreibt das gequotete glaeubiger_id so, wie der Python-Importer es angelegt hat", () => {
		const out = patchFrontmatter(NOTE, { set: { glaeubiger_id: '"DE98ZZZ00000000001"' } });
		expect(out).toContain('\nglaeubiger_id: "DE98ZZZ00000000001"\n');
	});

	it("schreibt Datum und Datum mit Uhrzeit unquotiert", () => {
		const out = patchFrontmatter(NOTE, { set: { updated: "2026-10-17 00:00:00", saldo_stand_am: "2026-10-17" } });
		expect(out).toContain("\nupdated: 2026-10-17 00:00:00\n");
		expect(out).toContain("\nsaldo_stand_am: 2026-10-17\n");
	});

	it("ändert beim zweiten Lauf mit denselben Werten kein Zeichen", () => {
		const patch = {
			set: {
				saldo_eur: "280.40",
				saldo_stand_am: "2026-05-10",
				updated: "2026-10-17 00:00:00",
				glaeubiger_id: '"DE98ZZZ00000000001"',
				aktiv: "false",
			},
			ensure: { anfangssaldo_eur: "null" },
		};
		const einmal = patchFrontmatter(NOTE, patch);
		expect(patchFrontmatter(einmal, patch)).toBe(einmal);
	});

	it("hängt an einen CRLF-Block durchgehend mit CRLF an", () => {
		// Absicht (Kit besser): die Eigenfassung schrieb `neu: x\r\r\n---` (ein Zeilenumbruch davor, ein doppeltes CR dahinter).
		const crlf = "---\r\nsaldo_eur: 1\r\n---\r\n\r\nText\r\n";
		const out = patchFrontmatter(crlf, { set: { neu: "x" }, ensure: { anfangssaldo_eur: "null" } });
		expect(out).toBe("---\r\nsaldo_eur: 1\r\nneu: x\r\nanfangssaldo_eur: null\r\n---\r\n\r\nText\r\n");
	});

	it("ersetzt ein Feld samt seinen Fortsetzungszeilen", () => {
		// Absicht (Kit besser): die Eigenfassung ersetzte nur die erste Zeile und ließ die Reste stehen.
		const note = "---\nsaldo_eur: 1\nnotiz:\n  - alt\n  - auch alt\nupdated: x\n---\n\nText\n";
		expect(patchFrontmatter(note, { set: { notiz: "neu" } })).toBe("---\nsaldo_eur: 1\nnotiz: neu\nupdated: x\n---\n\nText\n");
	});

	it("quotet einen Text, den YAML sonst anders läse", () => {
		const out = patchFrontmatter(NOTE, { set: { notiz: "a: b" } });
		expect(out).toContain('\nnotiz: "a: b"\n');
	});

	it("lässt einen Text mit Zaun ohne Schluss unverändert", () => {
		const offen = "---\nsaldo_eur: 1\nText ohne schließenden Zaun\n";
		expect(patchFrontmatter(offen, { set: { saldo_eur: "2" } })).toBe(offen);
	});

	it("verweigert einen Wert mit Zeilenumbruch und nennt den Schlüssel", () => {
		expect(() => patchFrontmatter(NOTE, { set: { notiz: "a\nb" } })).toThrow(/notiz.*invalid-value/);
	});
});

describe("renderNote — Blocklisten des Imports (Kit, listStyle block)", () => {
	const spec = (accounts: string[]) => ({
		frontmatter: [],
		owned: { posting_count: "3", volumen_total_eur: "10.00", generated: "2026-10-25" },
		lists: { ledger_accounts: accounts },
		auto: "auto",
		userDefault: "user\n",
	});
	const alt = [
		"---",
		"title: T",
		"ledger_accounts:",
		"  - Ausgaben:Alt",
		"  - Ausgaben:Auch",
		"posting_count: 1",
		"volumen_total_eur: 1.00",
		"generated: 2026-10-01",
		"created: 2026-10-01",
		"---",
		"",
	].join("\n");

	it("ersetzt die Blockliste und schreibt die Felder des Imports daneben", () => {
		const out = renderNote(spec(["Ausgaben:Neu"]), alt, "2026-10-25");
		expect(out).toContain("ledger_accounts:\n  - Ausgaben:Neu\nposting_count: 3\n");
		expect(out).toContain("\nvolumen_total_eur: 10.00\n");
		expect(out).toContain("\ncreated: 2026-10-01\n");
		expect(out).not.toContain("Ausgaben:Alt");
	});

	it("schreibt eine leere Liste als `key: null`", () => {
		const out = renderNote(spec([]), alt, "2026-10-25");
		expect(out).toContain("\nledger_accounts: null\nposting_count: 3\n");
	});
});

describe("patchFrontmatter — lists (Blocklisten, die der Import besitzt)", () => {
	const mit = (liste: string[]): string =>
		["---", "title: T", ...liste, "posting_count: 1", "created: 2026-10-01", "---", "Text", ""].join("\n");
	const lists = (key: string, items: string[]) => ({ lists: { [key]: items } });

	it("ersetzt eine Blockliste samt allen Fortsetzungszeilen, Nachbarfelder bleiben byte-gleich", () => {
		const alt = mit(["ledger_accounts:", "  - A:1", "  - A:2", "  - A:3"]);
		expect(patchFrontmatter(alt, lists("ledger_accounts", ["B:1"]))).toBe(mit(["ledger_accounts:", "  - B:1"]));
	});

	it("verlängert eine Blockliste", () => {
		const alt = mit(["ledger_accounts:", "  - A:1"]);
		expect(patchFrontmatter(alt, lists("ledger_accounts", ["B:1", "B:2", "B:3"]))).toBe(
			mit(["ledger_accounts:", "  - B:1", "  - B:2", "  - B:3"]),
		);
	});

	it("schreibt eine leere Liste als `key: null` und macht aus `key: null` wieder eine Liste", () => {
		const leer = patchFrontmatter(mit(["ledger_accounts:", "  - A:1"]), lists("ledger_accounts", []));
		expect(leer).toBe(mit(["ledger_accounts: null"]));
		expect(patchFrontmatter(leer, lists("ledger_accounts", ["A:1"]))).toBe(mit(["ledger_accounts:", "  - A:1"]));
	});

	it("ersetzt eine Flow-Liste des Nutzers durch die Blockliste", () => {
		expect(patchFrontmatter(mit(["ledger_accounts: [A:1, A:2]"]), lists("ledger_accounts", ["B:1"]))).toBe(
			mit(["ledger_accounts:", "  - B:1"]),
		);
	});

	it("legt einen fehlenden Schlüssel NICHT an: die Notiz bleibt byte-gleich", () => {
		const ohne = mit([]);
		expect(patchFrontmatter(ohne, lists("ledger_accounts", ["B:1"]))).toBe(ohne);
	});

	it("eine Notiz ohne Frontmatter und ein Zaun ohne Schluss bleiben unverändert", () => {
		expect(patchFrontmatter("Text\n", lists("ledger_accounts", ["B:1"]))).toBe("Text\n");
		const offen = "---\nledger_accounts:\n  - A:1\nText ohne Schluss\n";
		expect(patchFrontmatter(offen, lists("ledger_accounts", ["B:1"]))).toBe(offen);
	});

	it("CRLF bleibt CRLF, auch bei einer leeren Liste", () => {
		const alt = mit(["ledger_accounts:", "  - A:1", "  - A:2"]).replace(/\n/g, "\r\n");
		const neu = patchFrontmatter(alt, lists("ledger_accounts", ["B:1"]));
		expect(neu).toBe(mit(["ledger_accounts:", "  - B:1"]).replace(/\n/g, "\r\n"));
		expect(patchFrontmatter(alt, lists("ledger_accounts", []))).toBe(mit(["ledger_accounts: null"]).replace(/\n/g, "\r\n"));
	});

	it("ist idempotent", () => {
		const einmal = patchFrontmatter(mit(["ledger_accounts:", "  - A:1"]), lists("ledger_accounts", ["B:1", "B:2"]));
		expect(patchFrontmatter(einmal, lists("ledger_accounts", ["B:1", "B:2"]))).toBe(einmal);
	});

	it("Kontonamen mit Doppelpunkt ohne Leerzeichen stehen roh, wie beim Python-Importer", () => {
		const neu = patchFrontmatter(mit(["ledger_accounts:", "  - A:1"]), lists("ledger_accounts", ["Ausgaben:Wohnen:Miete"]));
		expect(neu).toContain("\n  - Ausgaben:Wohnen:Miete\n");
	});

	it("BEKANNTE ABWEICHUNG zu Python: ein Eintrag mit Komma oder `: ` steht gequotet (sonst läse YAML etwas anderes)", () => {
		const neu = patchFrontmatter(mit(["ledger_accounts:", "  - A:1"]), lists("ledger_accounts", ["Ausgaben:Kfz, Steuer", "Ausgaben: Foo"]));
		expect(neu).toContain('\n  - "Ausgaben:Kfz, Steuer"\n  - "Ausgaben: Foo"\n');
	});

	it("läuft neben `set` und ändert die Skalare wie bisher", () => {
		const alt = mit(["ledger_accounts:", "  - A:1"]);
		const neu = patchFrontmatter(alt, { set: { posting_count: "7" }, ...lists("ledger_accounts", ["B:1"]) });
		expect(neu).toBe(["---", "title: T", "ledger_accounts:", "  - B:1", "posting_count: 7", "created: 2026-10-01", "---", "Text", ""].join("\n"));
	});

	it("ein Eintrag mit Zeilenumbruch wirft mit Schlüssel und Grund", () => {
		expect(() => patchFrontmatter(mit(["ledger_accounts:", "  - A:1"]), lists("ledger_accounts", ["a\nb"]))).toThrow(/ledger_accounts.*invalid-value/);
	});
});
