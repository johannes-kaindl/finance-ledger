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
			auto: "\nAuto-Inhalt\nMehr Auto\n",
			user: "\n## Eigener Abschnitt\nEigenes\n",
		});
	});

	it("wirft, wenn nur der BEGIN-Marker dasteht", () => {
		expect(() => splitBody(`# Titel\n${AUTO_BEGIN}\nAuto\n`)).toThrow(
			MarkerError,
		);
	});

	it("wirft, wenn nur der END-Marker dasteht", () => {
		expect(() => splitBody(`# Titel\n${AUTO_END}\nText\n`)).toThrow(MarkerError);
	});

	it("wirft, wenn END vor BEGIN steht", () => {
		expect(() => splitBody(`${AUTO_END}\nText\n${AUTO_BEGIN}\n`)).toThrow(
			/vor dem BEGIN-Marker/,
		);
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
