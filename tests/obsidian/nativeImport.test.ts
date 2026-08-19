import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/core/errors";
import { CAMT52_HEADER } from "../../src/core/import/parsers/camt52";
import { runNativeImport } from "../../src/obsidian/nativeImport";
import { resolveFinancePaths, DEFAULT_PATH_SETTINGS } from "../../src/state/financePaths";

/**
 * Diese Schicht ist die Verdrahtung — und genau dort saßen die fünf
 * Import-Defekte vom 2026-08-01: falscher Pfad, fehlende Umgebung, nie
 * übergebene Konfiguration. Jeder davon meldete „Erfolg".
 */

const KONTEN_JSON = JSON.stringify({
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
});

function camtCsvBytes(): Uint8Array {
	const cells = Array.from({ length: 17 }, () => "");
	cells[0] = "DE1";
	cells[1] = "01.08.25";
	cells[2] = "01.08.25";
	cells[3] = "LASTSCHRIFT";
	cells[11] = "Telekom Gebühr";
	cells[14] = "-39,95";
	cells[15] = "EUR";
	cells[16] = "Umsatz gebucht";
	const text = [CAMT52_HEADER.join(";"), cells.join(";")].join("\r\n");
	// Latin-1: ein Byte je Zeichen.
	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
	return bytes;
}

interface FakeVaultFiles {
	text?: Record<string, string>;
	binary?: Record<string, Uint8Array>;
}

function fakeApp(files: FakeVaultFiles, ruleNotes: unknown[] = []) {
	const written = new Map<string, string>();
	const text = files.text ?? {};
	const binary = files.binary ?? {};
	const allPaths = [...Object.keys(text), ...Object.keys(binary)];

	const markdownFiles = ruleNotes.map((fm, i) => ({
		name: `rule-${i}.md`,
		path: `rules/rule-${i}.md`,
		frontmatter: fm,
	}));

	const app = {
		vault: {
			adapter: {
				read: async (p: string) => text[p] ?? written.get(p) ?? "",
				readBinary: async (p: string) => {
					const b = binary[p];
					if (!b) throw new Error(`nicht gefunden: ${p}`);
					return b.buffer.slice(
						b.byteOffset,
						b.byteOffset + b.byteLength,
					) as ArrayBuffer;
				},
				write: async (p: string, c: string) => {
					written.set(p, c);
				},
				writeBinary: async () => undefined,
				exists: async (p: string) =>
					allPaths.includes(p) || written.has(p) || p.endsWith("Umsätze"),
				mkdir: async () => undefined,
				list: async (folder: string) => ({
					files: allPaths.filter((p) => p.startsWith(`${folder}/`)),
					folders: [],
				}),
				stat: async (p: string) =>
					allPaths.includes(p) ? { mtime: 1000, ctime: 1, size: 1 } : null,
			},
			getMarkdownFiles: () => markdownFiles,
		},
		metadataCache: {
			getFileCache: (file: { frontmatter?: unknown }) => ({
				frontmatter: file.frontmatter,
			}),
		},
	} as unknown as App;

	return { app, written };
}

const paths = resolveFinancePaths({
	...DEFAULT_PATH_SETTINGS,
	financeRoot: "Finanzplan",
});

describe("runNativeImport", () => {
	it("schreibt Journal und Kontenplan in den Vault", async () => {
		const { app, written } = fakeApp({
			text: { "Finanzplan/konten.yaml": KONTEN_JSON },
			binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
		});

		const result = await runNativeImport({ app, paths });

		expect(result.transactionCount).toBe(1);
		expect(written.get("Finanzplan/Ledger/journal.ledger")).toContain(
			"2025-08-01 * Telekom Gebühr",
		);
		expect(written.has("Finanzplan/Ledger/accounts.ledger")).toBe(true);
	});

	it("wendet Regeln aus den Vault-Notizen an", async () => {
		const { app, written } = fakeApp(
			{
				text: { "Finanzplan/konten.yaml": KONTEN_JSON },
				binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
			},
			[
				{
					kategorie: "categorizer-rule",
					pattern: "telekom",
					pattern_type: "substring",
					ledger_account: "Ausgaben:Kommunikation:Telekom",
					priority: 10,
					tags: ["recurring"],
				},
			],
		);

		await runNativeImport({ app, paths });
		const journal = written.get("Finanzplan/Ledger/journal.ledger") ?? "";
		expect(journal).toContain("Ausgaben:Kommunikation:Telekom  39.95 EUR");
		expect(journal).toContain("; :recurring:");
	});

	it("liest Latin-1-Umlaute korrekt aus dem Vault", async () => {
		const { app, written } = fakeApp({
			text: { "Finanzplan/konten.yaml": KONTEN_JSON },
			binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
		});
		await runNativeImport({ app, paths });
		// Über vault.read() stünde hier „Geb?hr".
		expect(written.get("Finanzplan/Ledger/journal.ledger")).toContain("Gebühr");
	});

	// Am 2026-08-04 im echten Vault aufgetreten: eine Regel-Notiz mit
	// `kategorie: categorizer-rule` und Suchbegriff, aber leerem
	// `ledger_account`. Der Python-Importer prüfte nur, ob der Schlüssel da ist,
	// und schrieb `str(None)` — drei Wochen lang standen zwei Buchungen auf
	// einem Konto namens „None".
	it("verwirft eine Regel mit leerem Konto und meldet sie namentlich", async () => {
		const { app, written } = fakeApp(
			{
				text: { "Finanzplan/konten.yaml": KONTEN_JSON },
				binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
			},
			[
				{
					kategorie: "categorizer-rule",
					pattern: "telekom",
					pattern_type: "substring",
					ledger_account: null,
					priority: 10,
					tags: [],
				},
			],
		);

		const result = await runNativeImport({ app, paths });

		expect(result.incompleteRules).toEqual(["rule-0.md"]);
		const journal = written.get("Finanzplan/Ledger/journal.ledger") ?? "";
		expect(journal).not.toContain("None");
		// Statt auf einem Phantom-Konto landet die Buchung sichtbar in der Triage.
		expect(journal).toContain("Ausgaben:Unkategorisiert:");
		expect(journal).toContain("; :tbc:unkategorisiert:");
	});

	it("meldet nichts, wenn alle Regeln vollständig sind", async () => {
		const { app } = fakeApp(
			{
				text: { "Finanzplan/konten.yaml": KONTEN_JSON },
				binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
			},
			[
				{
					kategorie: "categorizer-rule",
					pattern: "telekom",
					pattern_type: "substring",
					ledger_account: "Ausgaben:Kommunikation:Telekom",
					priority: 10,
					tags: [],
				},
			],
		);
		const result = await runNativeImport({ app, paths });
		expect(result.incompleteRules).toEqual([]);
	});

	it("sagt verständlich, wenn die Konten-Datei fehlt", async () => {
		const { app } = fakeApp({
			binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
		});
		await expect(runNativeImport({ app, paths })).rejects.toThrow(ConfigError);
		await expect(runNativeImport({ app, paths })).rejects.toThrow(
			/Finanzplan\/konten\.yaml/,
		);
	});

	it("sagt verständlich, wenn die Konten-Datei kaputt ist", async () => {
		const { app } = fakeApp({
			text: { "Finanzplan/konten.yaml": "{ kein: gültiges" },
			binary: { "Finanzplan/Umsätze/a-camt52v8.CSV": camtCsvBytes() },
		});
		await expect(runNativeImport({ app, paths })).rejects.toThrow(
			/kein gültiges YAML/,
		);
	});

	it("verweigert den Lauf ohne konfigurierten Finanzordner", async () => {
		const { app } = fakeApp({});
		await expect(
			runNativeImport({ app, paths: resolveFinancePaths(DEFAULT_PATH_SETTINGS) }),
		).rejects.toThrow(/Kein Finanzordner konfiguriert/);
	});
});
