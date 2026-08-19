import { describe, expect, it } from "vitest";
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
