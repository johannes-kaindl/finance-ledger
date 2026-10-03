import { describe, it, expect } from "vitest";

import { previewCsv } from "../../../src/core/import/preview";
import { CAMT52_HEADER } from "../../../src/core/import/parsers/camt52";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { activeKonten } from "../../../src/core/config/konten";
import type { VaultPort } from "../../../src/core/ports";

/** Vault im Speicher — dieselbe Bauform wie in pipeline.test.ts. */
function fakeVault(files: Record<string, { bytes: Uint8Array; mtime: number }>) {
	const port: VaultPort = {
		read: async () => "",
		readBinary: async (p) => {
			const file = files[p];
			if (!file) throw new Error(`nicht gefunden: ${p}`);
			return file.bytes.buffer.slice(
				file.bytes.byteOffset,
				file.bytes.byteOffset + file.bytes.byteLength,
			) as ArrayBuffer;
		},
		write: async () => undefined,
		writeBinary: async () => undefined,
		exists: async (p) => p in files,
		mkdir: async () => undefined,
		list: async (folder) =>
			Object.keys(files)
				.filter((p) => p.startsWith(`${folder}/`))
				.sort(),
		remove: async (p) => {
			delete files[p];
		},
		stat: async (p) => (files[p] ? { mtime: files[p].mtime } : null),
	};
	return port;
}

function latin1(text: string): Uint8Array {
	const out = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
	return out;
}

function bytesOf(text: string): ArrayBuffer {
	const u8 = latin1(text);
	return u8.buffer.slice(
		u8.byteOffset,
		u8.byteOffset + u8.byteLength,
	) as ArrayBuffer;
}

function camtCsv(
	rows: { tag: string; betrag: string; wer: string }[],
	iban = "DE89370400440532013000",
): string {
	const lines = [CAMT52_HEADER.join(";")];
	for (const row of rows) {
		const cells = Array.from({ length: 17 }, () => "");
		cells[0] = iban;
		cells[1] = row.tag;
		cells[2] = row.tag;
		cells[3] = "LASTSCHRIFT";
		cells[11] = row.wer;
		cells[14] = row.betrag;
		cells[15] = "EUR";
		cells[16] = "Umsatz gebucht";
		lines.push(cells.join(";"));
	}
	return lines.join("\r\n");
}

const KONTEN = parseKontenConfig({
	konten: [
		{
			id: "hauptkonto",
			iban: "DE89370400440532013000",
			ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto",
			bank: "Sparkasse Musterstadt",
			konto_typ: "giro",
			konto_rolle: "hauptkonto_privat",
			csv_schema: "sparkasse_camt52",
			inhaber: "Max Mustermann",
		},
		{
			id: "visa",
			iban: "4000 **** **** 0729",
			ledger_account: "Aktiva:Bank:Sparkasse:Visa",
			bank: "Sparkasse Musterstadt",
			konto_typ: "kreditkarte",
			konto_rolle: "kreditkarte",
			csv_schema: "sparkasse_visa",
			inhaber: "Max Mustermann",
		},
	],
});

const HAUPTKONTO = activeKonten(KONTEN)[0];
const UMSATZ_DIR = "Finanzplan/Umsätze";

describe("previewCsv", () => {
	it("zählt alle Buchungen als neu, wenn der Umsatzordner leer ist", async () => {
		const csv = camtCsv([
			{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom" },
			{ tag: "02.08.25", betrag: "-12,00", wer: "Bäckerei" },
		]);

		const result = await previewCsv({
			vault: fakeVault({}),
			umsatzDir: UMSATZ_DIR,
			incoming: { name: "neu-camt52v8.CSV", bytes: bytesOf(csv) },
			konto: HAUPTKONTO,
			konten: KONTEN,
		});

		expect(result.neu).toBe(2);
		expect(result.duplikate).toBe(0);
		expect(result.dateRange).toEqual({ first: "2025-08-01", last: "2025-08-02" });
		expect(result.kontoMatch).toBe("hauptkonto");
		expect(result.warnings).toEqual([]);
	});

	it("erkennt Doppelungen gegen die CSVs, die schon im Umsatzordner liegen", async () => {
		const bestand = camtCsv([{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom" }]);
		const neu = camtCsv([
			{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom" },
			{ tag: "03.08.25", betrag: "-5,00", wer: "Kiosk" },
		]);

		const result = await previewCsv({
			vault: fakeVault({
				[`${UMSATZ_DIR}/alt-camt52v8.CSV`]: { bytes: latin1(bestand), mtime: 1000 },
			}),
			umsatzDir: UMSATZ_DIR,
			incoming: { name: "neu-camt52v8.CSV", bytes: bytesOf(neu) },
			konto: HAUPTKONTO,
			konten: KONTEN,
		});

		expect(result.neu).toBe(1);
		expect(result.duplikate).toBe(1);
	});

	it("vergleicht nicht gegen die gleichnamige Datei — eine erneut gewählte CSV ist nicht ihre eigene Doppelung", async () => {
		const csv = camtCsv([{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom" }]);

		const result = await previewCsv({
			vault: fakeVault({
				[`${UMSATZ_DIR}/gleich-camt52v8.CSV`]: { bytes: latin1(csv), mtime: 1000 },
			}),
			umsatzDir: UMSATZ_DIR,
			incoming: { name: "gleich-camt52v8.CSV", bytes: bytesOf(csv) },
			konto: HAUPTKONTO,
			konten: KONTEN,
		});

		expect(result.neu).toBe(1);
		expect(result.duplikate).toBe(0);
	});

	it("warnt, wenn der Dateiname auf ein anderes Schema deutet als das gewählte Konto", async () => {
		const csv = camtCsv([{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom" }]);

		const result = await previewCsv({
			vault: fakeVault({}),
			umsatzDir: UMSATZ_DIR,
			// Maskierte Kartennummer im Namen → Visa-Schema, gewählt ist aber das Giro-Konto.
			incoming: { name: "4000-XXXX-XXXX-0729.csv", bytes: bytesOf(csv) },
			konto: HAUPTKONTO,
			konten: KONTEN,
		});

		expect(result.warnings.join(" ")).toMatch(/sparkasse_visa/);
	});

	it("meldet vorgemerkte Buchungen als Warnung statt sie stumm zu verschlucken", async () => {
		const lines = [CAMT52_HEADER.join(";")];
		const cells = Array.from({ length: 17 }, () => "");
		cells[0] = "DE89370400440532013000";
		cells[1] = "04.08.25";
		cells[2] = "04.08.25";
		cells[11] = "Vorgemerkt GmbH";
		cells[14] = "-9,99";
		cells[15] = "EUR";
		cells[16] = "Umsatz vorgemerkt";
		lines.push(cells.join(";"));

		const result = await previewCsv({
			vault: fakeVault({}),
			umsatzDir: UMSATZ_DIR,
			incoming: { name: "neu-camt52v8.CSV", bytes: bytesOf(lines.join("\r\n")) },
			konto: HAUPTKONTO,
			konten: KONTEN,
		});

		expect(result.neu).toBe(0);
		expect(result.warnings.join(" ")).toMatch(/vorgemerkt/i);
	});

	it("bricht nicht ab, wenn eine Bestandsdatei unlesbar ist — sie wird als Warnung gemeldet", async () => {
		const neu = camtCsv([{ tag: "01.08.25", betrag: "-39,95", wer: "Telekom" }]);

		const result = await previewCsv({
			vault: fakeVault({
				[`${UMSATZ_DIR}/kaputt-camt52v8.CSV`]: {
					bytes: latin1("Dies ist keine CSV\r\nirgendwas"),
					mtime: 1000,
				},
			}),
			umsatzDir: UMSATZ_DIR,
			incoming: { name: "neu-camt52v8.CSV", bytes: bytesOf(neu) },
			konto: HAUPTKONTO,
			konten: KONTEN,
		});

		expect(result.neu).toBe(1);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings.join(" ")).toMatch(/kaputt-camt52v8\.CSV/);
	});
});
