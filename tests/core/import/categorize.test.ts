import { describe, expect, it } from "vitest";
import { createImporterContext } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import {
	categorize,
	deriveOwnerNames,
	postingAccount,
	type CategorizeInput,
} from "../../../src/core/import/categorize";
import { DEFAULT_SIGN_RULES } from "../../../src/core/import/defaultSignRules";
import { parsePaypalRecipient } from "../../../src/core/import/paypal";
import { buildRules, EMPTY_RULES } from "../../../src/core/import/rules";
import { Money } from "../../../src/core/money";
import { makeTx } from "./factory";

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
			{
				id: "visa",
				iban: "4000",
				ledger_account: "Passiva:Visa",
				bank: "Sparkasse",
				konto_typ: "kreditkarte",
				konto_rolle: "visa_daily",
				csv_schema: "sparkasse_visa",
				inhaber: "Max Mustermann",
			},
		],
	}),
});

const rules = buildRules([
	{
		pattern: "telekom",
		patternType: "substring",
		ledgerAccount: "Ausgaben:Kommunikation:Festnetz:Telekom",
		priority: 10,
		tags: ["recurring"],
		aliases: ["t-mobile"],
		sourceFile: "telekom.md",
	},
	{
		pattern: "buchhandlung",
		patternType: "paypal-sub",
		ledgerAccount: "Ausgaben:Buecher",
		priority: 10,
		tags: [],
		aliases: [],
		sourceFile: "buecher.md",
	},
]);

const input: CategorizeInput = {
	ctx,
	rules,
	ownerNames: deriveOwnerNames(ctx),
	signRules: DEFAULT_SIGN_RULES,
};

describe("postingAccount", () => {
	it("bildet die IBAN des Auszugs auf sein Ledger-Konto ab", () => {
		expect(postingAccount(makeTx({ accountIban: "DE1" }), ctx)).toBe(
			"Aktiva:Bank:Hauptkonto",
		);
	});

	it("wirft bei unbekanntem Konto nicht, sondern parkt die Buchung sichtbar", () => {
		expect(postingAccount(makeTx({ accountIban: "DE-fremd" }), ctx)).toBe(
			"Aktiva:Sonstige_Selbst-Bewegung",
		);
	});
});

describe("categorize — strukturelle Sonderfälle", () => {
	it("erkennt eine Umbuchung aufs eigene Konto am Inhabernamen", () => {
		const r = categorize(
			makeTx({ beguenstigter: "Max Mustermann", kontonummerIban: "4000" }),
			input,
		);
		expect(r.gegenAccount).toBe("Passiva:Visa");
		expect(r.tags).toContain("self-transfer");
		expect(r.ruleName).toBe("self-transfer-eigen");
	});

	it("markiert eine eigene Buchung auf unbekanntes Zielkonto zur Prüfung", () => {
		const r = categorize(
			makeTx({ beguenstigter: "Max Mustermann", kontonummerIban: "DE-unbekannt" }),
			input,
		);
		expect(r.gegenAccount).toBe("Aktiva:Sonstige_Selbst-Bewegung");
		expect(r.tags).toContain("review-needed");
	});

	it("ordnet die vom Visa-Parser synthetisierten Buchungstexte zu", () => {
		expect(
			categorize(makeTx({ buchungstext: "VISA-LASTSCHRIFT" }), input).gegenAccount,
		).toBe("Aktiva:Bank:Hauptkonto");
		expect(
			categorize(makeTx({ buchungstext: "EIGENE KREDITKARTENABRECHNUNG" }), input)
				.gegenAccount,
		).toBe("Passiva:Visa");
		expect(
			categorize(makeTx({ buchungstext: "VISA-FX-GEBUEHR" }), input).gegenAccount,
		).toBe("Ausgaben:Bankgebuehren:FX_Aufschlag");
	});

	// Fehlt die Rolle in der Konfiguration, darf der Lauf nicht sterben —
	// im Python-Original ist das ein KeyError beim Modul-Import.
	it("fällt ohne passende Konto-Rolle auf die späteren Regeln zurück", () => {
		const ohneRollen = createImporterContext({
			notesPrefix: "Finanzplan",
			konten: parseKontenConfig({
				konten: [
					{
						id: "x",
						iban: "DE1",
						ledger_account: "Aktiva:Bank:X",
						bank: "Bank",
						konto_typ: "giro",
						konto_rolle: "sonstiges",
						csv_schema: "sparkasse_camt52",
						inhaber: "Max Mustermann",
					},
				],
			}),
		});
		const r = categorize(makeTx({ buchungstext: "VISA-LASTSCHRIFT" }), {
			...input,
			ctx: ohneRollen,
			ownerNames: deriveOwnerNames(ohneRollen),
		});
		expect(r.ruleName).toBe("catchall");
	});

	it("erkennt Bargeldabhebungen und markiert die entgeltpflichtige Variante", () => {
		expect(
			categorize(makeTx({ buchungstext: "BARGELDAUSZAHLUNG" }), input).gegenAccount,
		).toBe("Aktiva:Bargeld");
		expect(categorize(makeTx({ buchungstext: "GA NR 12345" }), input).ruleName).toBe(
			"bargeld",
		);
		expect(
			categorize(makeTx({ buchungstext: "AUSZAHLUNG MIT KUNDENENTGELT" }), input)
				.tags,
		).toContain("review-needed");
	});

	it("unterscheidet den Rechnungsabschluss nach Vorzeichen", () => {
		const abschluss = (betrag: string) =>
			categorize(
				makeTx({ buchungstext: "ABSCHLUSS", betrag: new Money(betrag) }),
				input,
			);
		expect(abschluss("-3.20").gegenAccount).toBe(
			"Ausgaben:Bankgebuehren:Soll_Zinsen",
		);
		expect(abschluss("1.50").gegenAccount).toBe("Einnahmen:Habenzinsen");
		expect(abschluss("0").tags).toContain("info");
	});
});

describe("categorize — vorzeichenabhängige Regeln", () => {
	it("bucht denselben Beteiligten je nach Richtung anders", () => {
		const eingang = categorize(
			makeTx({ beguenstigter: "Krankenkasse Muster", betrag: new Money("120.00") }),
			input,
		);
		const ausgang = categorize(
			makeTx({ beguenstigter: "Krankenkasse Muster", betrag: new Money("-120.00") }),
			input,
		);
		expect(eingang.gegenAccount).toBe("Einnahmen:Krankengeld:KK_Muster");
		expect(ausgang.gegenAccount).toContain("KK_Muster_Beitrag");
		expect(ausgang.tags).toContain("tbc");
	});

	it("greift nicht, wenn der Name nicht konfiguriert ist", () => {
		const r = categorize(
			makeTx({ beguenstigter: "Krankenkasse Muster" }),
			{ ...input, signRules: [] },
		);
		expect(r.ruleName).toBe("catchall");
	});
});

describe("categorize — PayPal", () => {
	it("liest den echten Empfänger aus dem Verwendungszweck", () => {
		expect(parsePaypalRecipient("PP.1234 Ihr Einkauf bei Buchhandlung Muster")).toBe(
			"Buchhandlung Muster",
		);
		expect(parsePaypalRecipient("Sonstiges")).toBeNull();
		expect(parsePaypalRecipient("")).toBeNull();
	});

	it("bucht auf das Konto des Händlers und markiert den Weg über PayPal", () => {
		const r = categorize(
			makeTx({
				beguenstigter: "PayPal (Europe) S.a r.l.",
				verwendungszweck: "PP.4711 Ihr Einkauf bei Buchhandlung Muster",
			}),
			input,
		);
		expect(r.gegenAccount).toBe("Ausgaben:Buecher");
		expect(r.tags).toContain("paypal-via");
	});

	it("parkt einen unbekannten PayPal-Empfänger in der Triage", () => {
		const r = categorize(
			makeTx({
				beguenstigter: "PayPal Europe",
				verwendungszweck: "Ihr Einkauf bei Unbekannter Shop",
			}),
			input,
		);
		expect(r.gegenAccount).toBe("Ausgaben:Unkategorisiert:PayPal");
		expect(r.tags).toEqual(expect.arrayContaining(["tbc", "paypal-via"]));
	});
});

describe("categorize — Vault-Regeln und Auffangkorb", () => {
	it("wendet eine Regel aus dem Vault an", () => {
		const r = categorize(
			makeTx({ beguenstigter: "Telekom Deutschland GmbH" }),
			input,
		);
		expect(r.gegenAccount).toBe("Ausgaben:Kommunikation:Festnetz:Telekom");
		expect(r.tags).toContain("recurring");
	});

	it("wendet auch die Aliase einer Regel an", () => {
		expect(
			categorize(makeTx({ beguenstigter: "T-Mobile Austria" }), input)
				.gegenAccount,
		).toBe("Ausgaben:Kommunikation:Festnetz:Telekom");
	});

	it("trennt den Auffangkorb nach Quelldatei", () => {
		const r = categorize(
			makeTx({ beguenstigter: "Unbekannt AG", quelle: "auszug-camt52v8.CSV" }),
			{ ...input, rules: EMPTY_RULES },
		);
		expect(r.gegenAccount).toBe("Ausgaben:Unkategorisiert:auszug_camt52v8");
		expect(r.tags).toEqual(expect.arrayContaining(["tbc", "unkategorisiert"]));
	});
});

describe("buildRules", () => {
	it("sortiert nach Priorität, bei Gleichstand nach Dateiname", () => {
		// Ohne den zweiten Schlüssel hinge die Reihenfolge davon ab, wie Obsidian
		// die Dateien liefert — dieselbe Buchung landete mal hier, mal dort.
		const built = buildRules([
			{
				pattern: "b",
				patternType: "substring",
				ledgerAccount: "X:B",
				priority: 10,
				tags: [],
				aliases: [],
				sourceFile: "zzz.md",
			},
			{
				pattern: "a",
				patternType: "substring",
				ledgerAccount: "X:A",
				priority: 10,
				tags: [],
				aliases: [],
				sourceFile: "aaa.md",
			},
			{
				pattern: "c",
				patternType: "substring",
				ledgerAccount: "X:C",
				priority: 1,
				tags: [],
				aliases: [],
				sourceFile: "mmm.md",
			},
		]);
		expect(built.counterparty.map((r) => r.pattern)).toEqual(["c", "a", "b"]);
	});

	it("schreibt Suchbegriffe einmal klein statt bei jeder Buchung", () => {
		const built = buildRules([
			{
				pattern: "TeLeKoM",
				patternType: "substring",
				ledgerAccount: "X",
				priority: 1,
				tags: [],
				aliases: ["T-MOBILE"],
				sourceFile: "a.md",
			},
		]);
		expect(built.counterparty.map((r) => r.pattern)).toEqual([
			"telekom",
			"t-mobile",
		]);
	});
});
