import { describe, expect, it } from "vitest";
import { parseVertraegeConfig } from "../../src/core/config/vertraege";
import { ConfigError } from "../../src/core/errors";

function vertrag(overrides: Record<string, unknown> = {}) {
	return {
		filename: "ACME Telecom – Festnetz.md",
		ledger_kategorie: "Ausgaben:Kommunikation:Festnetz:ACME",
		vertragspartner: "ACME Telecom GmbH",
		vertrag_kategorie: "kommunikation",
		vertrag_subkategorie: "festnetz",
		abbucht_von_konto: "hauptkonto",
		...overrides,
	};
}

describe("parseVertraegeConfig", () => {
	it("liest einen vollständigen Vertrag", () => {
		const cfg = parseVertraegeConfig({ vertraege: [vertrag()] });
		const spec = cfg.vertraege[0];

		expect(spec.filename).toBe("ACME Telecom – Festnetz.md");
		expect(spec.ledgerKategorie).toBe("Ausgaben:Kommunikation:Festnetz:ACME");
		expect(spec.abbuchtVonKonto).toBe("hauptkonto");
	});

	it("füllt optionale Felder mit leeren Werten statt undefined", () => {
		const spec = parseVertraegeConfig({ vertraege: [vertrag()] }).vertraege[0];

		expect(spec.aliases).toEqual([]);
		expect(spec.sticker).toBe("");
		expect(spec.noteExtraWarning).toBe("");
	});

	it("nimmt Aliase und Sticker, wenn sie dastehen", () => {
		const spec = parseVertraegeConfig({
			vertraege: [vertrag({ aliases: ["ACME Festnetz"], sticker: "lucide//phone" })],
		}).vertraege[0];

		expect(spec.aliases).toEqual(["ACME Festnetz"]);
		expect(spec.sticker).toBe("lucide//phone");
	});

	it("nennt das fehlende Pflichtfeld beim Namen", () => {
		expect(() =>
			parseVertraegeConfig({ vertraege: [vertrag({ ledger_kategorie: undefined })] }),
		).toThrow(ConfigError);
		expect(() =>
			parseVertraegeConfig({ vertraege: [vertrag({ ledger_kategorie: undefined })] }),
		).toThrow(/ledger_kategorie/);
	});

	it("verträgt eine fehlende oder leere Datei", () => {
		expect(parseVertraegeConfig({}).vertraege).toEqual([]);
		expect(parseVertraegeConfig(null).vertraege).toEqual([]);
	});

	it("weist zwei Verträge mit demselben Dateinamen ab", () => {
		expect(() =>
			parseVertraegeConfig({ vertraege: [vertrag(), vertrag()] }),
		).toThrow(/ACME Telecom/);
	});
});
