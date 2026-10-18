import { describe, expect, it } from "vitest";
import {
	AUTO_BEGIN,
	AUTO_END,
	assembleBody,
	replaceAutoSection,
	splitBody,
} from "../../../src/core/notes/markers";
import { MarkerError } from "../../../src/core/errors";

/** Body mit Marker-Block, wie ihn ein früherer Lauf hinterlassen hat. */
function withMarkers(auto: string, user = ""): string {
	return `# Titel\n\n${AUTO_BEGIN}\n${auto}\n${AUTO_END}\n${user}`;
}

describe("splitBody", () => {
	it("behandelt eine markerlose Notiz komplett als Kopf", () => {
		const text = "# Titel\n\nAlter Text ohne Marker.\n";
		expect(splitBody(text)).toEqual({
			header: text,
			auto: null,
			user: "",
		});
	});

	it("zerlegt Kopf, Auto-Block und Benutzerteil an den Markern", () => {
		const text =
			`# Titel\n\nEigener Kopf\n\n${AUTO_BEGIN}\n` +
			`Auto-Inhalt\nMehr Auto\n${AUTO_END}\n` +
			`## Eigener Abschnitt\nEigenes\n`;

		expect(splitBody(text)).toEqual({
			header: "# Titel\n\nEigener Kopf\n\n",
			auto: "Auto-Inhalt\nMehr Auto",
			user: "\n## Eigener Abschnitt\nEigenes\n",
		});
	});

	it("wirft, wenn nur der BEGIN-Marker dasteht", () => {
		expect(() => splitBody(`# Titel\n${AUTO_BEGIN}\nAuto\n`)).toThrow(
			MarkerError,
		);
	});

	// Seit der Übernahme von `splitZone` (code-kit 0.31.0): ein END ohne BEGIN davor ist Text des Nutzers, kein Bruch.
	it("liest ein END ohne BEGIN als Kopf (Zitat), statt zu werfen", () => {
		const text = `# Titel\n${AUTO_END}\nText\n`;
		expect(splitBody(text)).toEqual({ header: text, auto: null, user: "" });
	});

	it("liest ein zitiertes END vor einem vollständigen Paar als Kopf", () => {
		const text = `Zitat: ${AUTO_END}\n${AUTO_BEGIN}\nAuto\n${AUTO_END}\nEigenes\n`;
		expect(splitBody(text)).toEqual({
			header: `Zitat: ${AUTO_END}\n`,
			auto: "Auto",
			user: "\nEigenes\n",
		});
	});

	it("wirft, wenn END nur vor dem einzigen BEGIN steht (BEGIN ohne END dahinter)", () => {
		expect(() => splitBody(`${AUTO_END}\nText\n${AUTO_BEGIN}\n`)).toThrow(MarkerError);
	});

	it("wirft, wenn ein zweites BEGIN im Block steht, statt Text zu verschlucken", () => {
		const text = `Zitat: ${AUTO_BEGIN}\nEigener Text\n${AUTO_BEGIN}\nAuto\n${AUTO_END}\n`;
		expect(() => splitBody(text)).toThrow(/zweiter BEGIN-Marker/);
	});

	it("rechnet ein END nach dem Block zum Benutzerteil", () => {
		const text = `${AUTO_BEGIN}\nAuto\n${AUTO_END}\nMein Zitat: ${AUTO_END}\n`;
		expect(splitBody(text).user).toBe(`\nMein Zitat: ${AUTO_END}\n`);
	});
});

describe("assembleBody — Marker im Inhalt", () => {
	it("entschärft Marker im Auto-Block, damit der nächste Lauf ihn nicht als Zonengrenze liest", () => {
		const text = assembleBody("# Kopf\n", `Zweck: ${AUTO_BEGIN} und ${AUTO_END}\n`, "");
		expect(text.split(AUTO_BEGIN)).toHaveLength(2);
		expect(text.split(AUTO_END)).toHaveLength(2);
		expect(() => splitBody(text)).not.toThrow();
	});
});

describe("assembleBody", () => {
	it("setzt Kopf, Marker-Block und Zeilenende ohne Benutzerteil", () => {
		expect(assembleBody("# Kopf\n", "auto\n", "")).toBe(
			`# Kopf\n\n${AUTO_BEGIN}\nauto\n${AUTO_END}\n`,
		);
	});

	it("hängt den Benutzerteil durch eine Leerzeile getrennt an", () => {
		expect(assembleBody("# Kopf", "auto", "## Meins\nText")).toBe(
			`# Kopf\n\n${AUTO_BEGIN}\nauto\n${AUTO_END}\n\n## Meins\nText\n`,
		);
	});

	it("wirft einen Benutzerteil aus reinem Weißraum weg", () => {
		expect(assembleBody("# Kopf", "auto", "\n  \n")).toBe(
			`# Kopf\n\n${AUTO_BEGIN}\nauto\n${AUTO_END}\n`,
		);
	});
});

describe("replaceAutoSection", () => {
	it("fügt einer markerlosen Notiz den Block hinter dem Bestand ein", () => {
		const result = replaceAutoSection("# Meine Notiz\n\n## Daten\n\nKram\n", "## Neu\nInhalt");

		expect(result).toBe(
			`# Meine Notiz\n\n## Daten\n\nKram\n\n${AUTO_BEGIN}\n## Neu\nInhalt\n${AUTO_END}\n`,
		);
	});

	it("ersetzt nur den Auto-Block und lässt den Benutzerteil unberührt", () => {
		const before = withMarkers("alt", "## 📌 Meins\n\nDarf nicht verschwinden.\n");
		const result = replaceAutoSection(before, "ganz anders");

		expect(result).toContain("ganz anders");
		expect(result).not.toContain("alt");
		expect(result).toContain("## 📌 Meins\n\nDarf nicht verschwinden.");
	});

	it("ist bei gleichem Auto-Inhalt byte-stabil", () => {
		const once = replaceAutoSection(withMarkers("auto", "eigenes\n"), "auto");
		const twice = replaceAutoSection(once, "auto");

		expect(twice).toBe(once);
	});

	it("setzt den Vorgabe-Benutzerteil nur bei leerem Benutzerteil", () => {
		const fresh = replaceAutoSection("# Kopf\n", "auto", "## 📌 Notizen\n");
		expect(fresh).toContain("## 📌 Notizen");

		const existing = replaceAutoSection(
			withMarkers("auto", "schon da\n"),
			"auto",
			"## 📌 Notizen\n",
		);
		expect(existing).toContain("schon da");
		expect(existing).not.toContain("## 📌 Notizen");
	});
});
