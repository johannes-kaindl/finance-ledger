import { describe, expect, it } from "vitest";
import { createImporterContext } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { deriveOwnerNames } from "../../../src/core/import/categorize";
import { CAMT52_HEADER } from "../../../src/core/import/parsers/camt52";
import {
	ACCOUNTS_FILENAME,
	JOURNAL_FILENAME,
	OPENING_BALANCES_FILENAME,
	countAgainstExisting,
	runImport,
} from "../../../src/core/import/pipeline";
import { buildRules, EMPTY_RULES } from "../../../src/core/import/rules";
import { parseVertraegeConfig } from "../../../src/core/config/vertraege";
import { collectingLog, type VaultPort } from "../../../src/core/ports";
import { Money } from "../../../src/core/money";
import { makeTx } from "./factory";

/**
 * Vault im Speicher. Die Pipeline berührt die Außenwelt nur über den Port —
 * deshalb läuft der komplette Import hier ohne Obsidian, ohne Dateisystem und
 * ohne Subprozess durch. Genau das war an der alten Bauform unmöglich.
 */
function fakeVault(
	files: Record<string, { bytes: Uint8Array; mtime: number }>,
	texts: Record<string, string> = {},
) {
	const written = new Map<string, string>();
	const port: VaultPort = {
		read: async (p) => written.get(p) ?? texts[p] ?? "",
		readBinary: async (p) => {
			const file = files[p];
			if (!file) throw new Error(`nicht gefunden: ${p}`);
			return file.bytes.buffer.slice(
				file.bytes.byteOffset,
				file.bytes.byteOffset + file.bytes.byteLength,
			) as ArrayBuffer;
		},
		write: async (p, content) => {
			written.set(p, content);
		},
		writeBinary: async () => undefined,
		exists: async (p) => p in files || p in texts || written.has(p),
		mkdir: async () => undefined,
		list: async (folder) =>
			[...Object.keys(files), ...Object.keys(texts), ...written.keys()]
				.filter((p) => p.startsWith(`${folder}/`))
				.sort(),
		stat: async (p) => (files[p] ? { mtime: files[p].mtime } : null),
	};
	return { port, written };
}

/** Latin-1-Bytes, wie sie wirklich aus einer CAMT52-Datei kommen. */
function latin1(text: string): Uint8Array {
	const out = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		out[i] = text.charCodeAt(i) & 0xff;
	}
	return out;
}

function camtCsv(
	rows: { tag: string; betrag: string; wer: string; zweck?: string; sref?: string }[],
	iban = "DE1",
): string {
	const lines = [CAMT52_HEADER.join(";")];
	for (const row of rows) {
		const cells = Array.from({ length: 17 }, () => "");
		cells[0] = iban;
		cells[1] = row.tag;
		cells[2] = row.tag;
		cells[3] = "LASTSCHRIFT";
		cells[4] = row.zweck ?? "";
		cells[8] = row.sref ?? "";
		cells[11] = row.wer;
		cells[14] = row.betrag;
		cells[15] = "EUR";
		cells[16] = "Umsatz gebucht";
		lines.push(cells.join(";"));
	}
	return lines.join("\r\n");
}

const ctx = createImporterContext({
	notesPrefix: "Finanzplan",
	konten: parseKontenConfig({
		konten: [
			{
				id: "haupt",
				iban: "DE1",
				ledger_account: "Aktiva:Bank:Hauptkonto",
				bank: "Sparkasse",
				konto_typ: "giro",
				konto_rolle: "hauptkonto_privat",
				csv_schema: "sparkasse_camt52",
				inhaber: "Max Mustermann",
			},
		],
	}),
});

const baseOptions = {
	ctx,
	rules: EMPTY_RULES,
	ownerNames: deriveOwnerNames(ctx),
	umsatzDir: "Finanzplan/Umsätze",
	outDir: "Finanzplan/Ledger",
};

describe("runImport", () => {
	it("schreibt Journal und Kontenplan aus einer CSV", async () => {
		const { port, written } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": {
				bytes: latin1(
					camtCsv([
						{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom Gebühr" },
					]),
				),
				mtime: 1000,
			},
		});

		const result = await runImport({ ...baseOptions, vault: port });

		expect(result.transactionCount).toBe(1);
		expect(result.writtenFiles).toEqual([
			`Finanzplan/Ledger/${JOURNAL_FILENAME}`,
			`Finanzplan/Ledger/${ACCOUNTS_FILENAME}`,
			`Finanzplan/Ledger/${OPENING_BALANCES_FILENAME}`,
		]);
		const journal = written.get(`Finanzplan/Ledger/${JOURNAL_FILENAME}`) ?? "";
		expect(journal).toContain("2025-08-01 * Telekom Gebühr");
		expect(journal).toContain("    Aktiva:Bank:Hauptkonto  -39.95 EUR");
		expect(written.has(`Finanzplan/Ledger/${ACCOUNTS_FILENAME}`)).toBe(true);
	});

	// Vault#read() würde hier „Geb?hr" liefern — der Fehler wanderte unbemerkt
	// bis in die Notizen.
	it("liest Latin-1-Umlaute korrekt", async () => {
		const { port, written } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": {
				bytes: latin1(
					camtCsv([{ tag: "01.08.25", betrag: "-1,00", wer: "Müller & Söhne" }]),
				),
				mtime: 1000,
			},
		});
		await runImport({ ...baseOptions, vault: port });
		expect(written.get(`Finanzplan/Ledger/${JOURNAL_FILENAME}`)).toContain(
			"Müller & Söhne",
		);
	});

	it("verwirft dieselbe Buchung aus zwei überlappenden Auszügen", async () => {
		const shared = { tag: "01.08.25", betrag: "-20,00", wer: "Shop", sref: "S-1" };
		const { port, written } = fakeVault({
			"Finanzplan/Umsätze/alt-camt52v8.CSV": {
				bytes: latin1(camtCsv([shared])),
				mtime: 1000,
			},
			"Finanzplan/Umsätze/neu-camt52v8.CSV": {
				bytes: latin1(
					camtCsv([shared, { tag: "02.08.25", betrag: "-5,00", wer: "Kiosk" }]),
				),
				mtime: 2000,
			},
		});

		const log = collectingLog();
		const result = await runImport({ ...baseOptions, vault: port, log });

		expect(result.transactionCount).toBe(2);
		expect(result.duplicatesSkipped).toBe(1);
		// Die zuletzt abgelegte Datei behält die Buchung.
		expect(log.messages.join("\n")).toContain("behalten aus neu-camt52v8.CSV");
		const journal = written.get(`Finanzplan/Ledger/${JOURNAL_FILENAME}`) ?? "";
		expect(journal.match(/2025-08-01 \* Shop/g)).toHaveLength(1);
	});

	// Ohne Sammlerreferenz kann der Hash zwei echte Buchungen gleichen Betrags am
	// selben Tag nicht unterscheiden — ein erneuter Export enthielte auch beide.
	it("behält Doppelungen innerhalb einer Datei", async () => {
		const twice = { tag: "01.08.25", betrag: "-50,00", wer: "Geldgeschenk" };
		const { port } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": {
				bytes: latin1(camtCsv([twice, twice])),
				mtime: 1000,
			},
		});
		const result = await runImport({ ...baseOptions, vault: port });
		expect(result.transactionCount).toBe(2);
		expect(result.duplicatesSkipped).toBe(0);
	});

	it("zählt vorgemerkte Buchungen und meldet sie", async () => {
		const csv = camtCsv([{ tag: "01.08.25", betrag: "-1,00", wer: "Shop" }]).replace(
			"Umsatz gebucht",
			"Umsatz vorgemerkt",
		);
		const { port } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": { bytes: latin1(csv), mtime: 1 },
		});
		const log = collectingLog();
		const result = await runImport({ ...baseOptions, vault: port, log });
		expect(result.vorgemerktSkipped).toBe(1);
		expect(result.transactionCount).toBe(0);
		expect(log.messages.join("\n")).toContain("vorgemerkte Buchung");
	});

	it("meldet Zeitraum und offene Posten für den Import-Bericht", async () => {
		const { port } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": {
				bytes: latin1(
					camtCsv([
						{ tag: "05.08.25", betrag: "-1,00", wer: "Unbekannt A" },
						{ tag: "01.08.25", betrag: "-2,00", wer: "Bekannt B" },
					]),
				),
				mtime: 1,
			},
		});
		const result = await runImport({
			...baseOptions,
			vault: port,
			rules: buildRules([
				{
					pattern: "bekannt b",
					patternType: "substring",
					ledgerAccount: "Ausgaben:Bekannt",
					priority: 1,
					tags: [],
					aliases: [],
					sourceFile: "b.md",
				},
			]),
		});
		expect(result.dateRange).toEqual({ first: "2025-08-01", last: "2025-08-05" });
		expect(result.unkategorisiert).toBe(1);
	});

	it("ignoriert Nicht-CSV-Dateien im Umsatzordner", async () => {
		const { port } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": {
				bytes: latin1(camtCsv([{ tag: "01.08.25", betrag: "-1,00", wer: "X" }])),
				mtime: 1,
			},
			"Finanzplan/Umsätze/notiz.md": { bytes: latin1("egal"), mtime: 2 },
		});
		const result = await runImport({ ...baseOptions, vault: port });
		expect(result.files).toEqual(["a-camt52v8.CSV"]);
	});

	it("schreibt auch ohne eine einzige CSV ein gültiges Journal", async () => {
		const { port, written } = fakeVault({});
		const result = await runImport({ ...baseOptions, vault: port });
		expect(result.transactionCount).toBe(0);
		expect(written.get(`Finanzplan/Ledger/${JOURNAL_FILENAME}`)).toContain(
			"; Generated by finanzplan-importer",
		);
	});
});

describe("countAgainstExisting", () => {
	it("trennt neue von bereits vorhandenen Buchungen", () => {
		const existing = [
			makeTx({ sammlerreferenz: "A" }),
			makeTx({ sammlerreferenz: "B" }),
		];
		const incoming = [
			makeTx({ sammlerreferenz: "B" }),
			makeTx({ sammlerreferenz: "C", betrag: new Money("-3.00") }),
		];
		expect(countAgainstExisting(incoming, existing)).toEqual({
			neu: 1,
			duplikate: 1,
		});
	});

	it("zählt ohne Bestand alles als neu", () => {
		expect(countAgainstExisting([makeTx()], [])).toEqual({ neu: 1, duplikate: 0 });
	});
});

describe("runImport — Stammdaten", () => {
	const csv = {
		"Finanzplan/Umsätze/a-camt52v8.CSV": {
			bytes: latin1(
				camtCsv([{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom Gebühr" }]),
			),
			mtime: 1000,
		},
	};

	it("schreibt die Eröffnungsbilanz auch ohne Stammdaten-Auftrag", async () => {
		const { port, written } = fakeVault(csv);

		const result = await runImport({ ...baseOptions, vault: port });
		const opening = written.get(`Finanzplan/Ledger/${OPENING_BALANCES_FILENAME}`);

		expect(result.writtenFiles).toContain(
			`Finanzplan/Ledger/${OPENING_BALANCES_FILENAME}`,
		);
		expect(opening).toContain("anfangssaldo_eur + anfangssaldo_stand_am fehlt");
	});

	it("liest den Anfangssaldo aus einer vorhandenen Konto-Notiz", async () => {
		const { port, written } = fakeVault(csv, {
			"Finanzplan/10-Konten/Konto 01 – Sparkasse.md":
				"---\nanfangssaldo_eur: 443,72\nanfangssaldo_stand_am: 10.05.2026\ncreated: 2026-01-01\n---\n\n# Konto\n",
		});

		await runImport({ ...baseOptions, vault: port });
		const opening = written.get(`Finanzplan/Ledger/${OPENING_BALANCES_FILENAME}`);

		expect(opening).toContain("2026-05-10 * Eröffnungsbilanz Konto 01 – Sparkasse");
		expect(opening).toContain("    Aktiva:Bank:Hauptkonto  443.72 EUR");
	});

	it("schreibt ohne Auftrag keine Notizen", async () => {
		const { port, written } = fakeVault(csv);

		const result = await runImport({ ...baseOptions, vault: port });

		expect([...written.keys()].some((p) => p.includes("10-Konten"))).toBe(false);
		expect(result.notesWritten).toBe(0);
	});

	it("legt Konto-Notizen an, wenn sie beauftragt sind", async () => {
		const { port, written } = fakeVault(csv);

		const result = await runImport({
			...baseOptions,
			vault: port,
			stammdaten: { vertraege: [] },
		});
		const note = written.get("Finanzplan/10-Konten/Konto 01 – Sparkasse.md");

		expect(result.notesWritten).toBe(1);
		expect(note).toContain("saldo_eur: -39.95");
		expect(note).toContain("kategorie: konto");
	});

	it("zieht eine vorhandene Konto-Notiz nach, statt sie zu ersetzen", async () => {
		const { port, written } = fakeVault(csv, {
			"Finanzplan/10-Konten/Konto 01 – Sparkasse.md":
				"---\nsaldo_eur: 0.00\neigenes_feld: bleibt\ncreated: 2026-01-01\n---\n\n# Konto\n\nHandschrift.\n",
		});

		await runImport({ ...baseOptions, vault: port, stammdaten: { vertraege: [] } });
		const note = written.get("Finanzplan/10-Konten/Konto 01 – Sparkasse.md") ?? "";

		expect(note).toContain("eigenes_feld: bleibt");
		expect(note).toContain("created: 2026-01-01");
		expect(note).toContain("Handschrift.");
		expect(note).toContain("saldo_eur: -39.95");
	});

	it("schreibt Vertrags-Notizen für erkannte Verträge", async () => {
		const { port, written } = fakeVault({
			"Finanzplan/Umsätze/a-camt52v8.CSV": {
				bytes: latin1(
					camtCsv([
						{ tag: "01.06.25", betrag: "-39,95", wer: "Telekom Gebühr" },
						{ tag: "01.07.25", betrag: "-39,95", wer: "Telekom Gebühr" },
					]),
				),
				mtime: 1000,
			},
		});
		const rules = buildRules([
			{
				pattern: "telekom",
				patternType: "substring",
				ledgerAccount: "Ausgaben:Kommunikation:Telekom",
				priority: 50,
				tags: [],
				aliases: [],
				sourceFile: "telekom.md",
			},
		]);

		const result = await runImport({
			...baseOptions,
			rules,
			vault: port,
			stammdaten: {
				vertraege: parseVertraegeConfig({
					vertraege: [
						{
							filename: "Telekom – Festnetz.md",
							ledger_kategorie: "Ausgaben:Kommunikation:Telekom",
							vertragspartner: "Telekom",
							vertrag_kategorie: "kommunikation",
							vertrag_subkategorie: "festnetz",
							abbucht_von_konto: "haupt",
						},
					],
				}).vertraege,
			},
		});
		const note = written.get("Finanzplan/20-Verträge/Telekom – Festnetz.md");

		expect(note).toContain("kategorie: vertrag");
		expect(note).toContain("betrag_eur: 39.95");
		expect(result.notesWritten).toBe(2);
	});
});
