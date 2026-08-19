import { describe, expect, it } from "vitest";
import {
	canonicalFromAccount,
	ledgerToSlug,
	mandatsSlug,
} from "../../../src/core/notes/slug";

describe("ledgerToSlug", () => {
	it("macht aus einem Ledger-Konto einen Dateinamen-Slug", () => {
		expect(ledgerToSlug("Ausgaben:Tech_Abos:KI:Anthropic")).toBe(
			"ausgaben-tech-abos-ki-anthropic",
		);
	});

	it("ersetzt Doppelpunkt und Unterstrich gleichermaßen durch Bindestrich", () => {
		expect(ledgerToSlug("Ausgaben:Essen_Auswaerts:Restaurant")).toBe(
			"ausgaben-essen-auswaerts-restaurant",
		);
	});
});

describe("canonicalFromAccount", () => {
	it("nimmt das letzte Segment als Anzeigenamen", () => {
		expect(canonicalFromAccount("Ausgaben:Tech_Abos:KI:Anthropic")).toBe(
			"Anthropic",
		);
	});

	it("macht Unterstriche im letzten Segment zu Leerzeichen", () => {
		expect(canonicalFromAccount("Ausgaben:Lebensmittel:Bio_Markt")).toBe(
			"Bio Markt",
		);
	});

	it("lässt ein Konto ohne Doppelpunkt unverändert", () => {
		expect(canonicalFromAccount("Bargeld")).toBe("Bargeld");
	});
});

describe("mandatsSlug", () => {
	it("macht die Mandatsreferenz klein", () => {
		expect(mandatsSlug("5FW2224N2DR6N")).toBe("5fw2224n2dr6n");
	});

	it("behält Bindestriche, weil sie in echten Referenzen vorkommen", () => {
		expect(mandatsSlug("EON-000000000-000000000-0")).toBe(
			"eon-000000000-000000000-0",
		);
	});

	it("ersetzt alles, was in keinen Dateinamen gehört", () => {
		expect(mandatsSlug("A/B C.D")).toBe("a_b_c_d");
	});
});
