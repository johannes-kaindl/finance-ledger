import { describe, expect, it } from "vitest";
import { migriere } from "../../scripts/migrate-note-schema";

const VERTRAG = `---
title: ACME Telecom – Festnetz
type: 📄 Dokument
kategorie: vertrag
tags:
  - 🏗_Finanzplan
  - finanzen/vertrag
status: 🌿 Evergreen
priority: 🟡 Mittel

vertragspartner: ACME Telecom
vertragsnummer: "ACME-123"
betrag_eur: 39.95
abgeschlossen_am: null
aktiv: true
sticker: lucide//phone
---

# ACME

| Vertragsnummer | \`=this.vertragsnummer\` |
`;

describe("migriere: Bestand auf das Vault-Schema", () => {
	it("zieht eine Vertragsnotiz nach: Status, Aktenzeichen, Felder ohne Verbraucher weg, Auto-Block", () => {
		const r = migriere(VERTRAG);
		expect(r.befund).toEqual([]);
		expect(r.text).toContain("\nstatus: evergreen\n");
		expect(r.text).toContain('\naktenzeichen: "ACME-123"\n');
		for (const weg of ["priority", "sticker", "abgeschlossen_am", "vertragsnummer:"]) expect(r.text, weg).not.toContain(weg);
		expect(r.text).toContain("| Vertragsnummer | `=this.aktenzeichen` |");
		// alles andere bleibt wörtlich
		expect(r.text).toContain("betrag_eur: 39.95\naktiv: true\n---\n\n# ACME");
	});

	it("ein zweiter Lauf ändert nichts", () => {
		const einmal = migriere(VERTRAG).text;
		const zweimal = migriere(einmal);
		expect(zweimal.text).toBe(einmal);
		expect(zweimal.geaendert).toEqual([]);
	});

	it("mappt die Anzeigeform von In-Arbeit und fasst Berichte nur am Status an", () => {
		const bericht = "---\ntitle: B\ntags:\n  - 🏗_Finanzplan\nstatus: ✏️ In-Arbeit\nsticker: lucide//calendar\nsparquote_prozent: 12.5\n---\nText\n";
		const r = migriere(bericht);
		expect(r.text).toBe("---\ntitle: B\ntags:\n  - 🏗_Finanzplan\nstatus: in-arbeit\nsparquote_prozent: 12.5\n---\nText\n");
	});

	it("lässt Categorizer-Regeln (priority ist dort der Rang) und fremde Notizen unberührt", () => {
		const regel = "---\nkategorie: categorizer-rule\ntags:\n  - 🏗_Finanzplan\npriority: 50\nstatus: 🌿 Evergreen\n---\n";
		expect(migriere(regel).text).toBe(regel);
		const fremd = "---\ntitle: X\npriority: hoch\nstatus: 🌿 Evergreen\n---\n";
		expect(migriere(fremd).text).toBe(fremd);
		expect(migriere("kein Block\n").text).toBe("kein Block\n");
	});

	it("meldet, statt zu raten: unbekannter Status, beide Schlüssel da", () => {
		const unbekannt = migriere("---\ntags:\n  - 🏗_Finanzplan\nstatus: 🤷 Vielleicht\n---\n");
		expect(unbekannt.befund[0]).toContain("kein Enum-Wert");
		expect(unbekannt.text).toContain("status: 🤷 Vielleicht");
		const beide = migriere('---\nkategorie: vertrag\ntags:\n  - 🏗_Finanzplan\nvertragsnummer: "1"\naktenzeichen: "2"\n---\n=this.vertragsnummer\n');
		expect(beide.befund[0]).toContain("beide");
		expect(beide.text).toContain('vertragsnummer: "1"');
		expect(beide.text).toContain("=this.vertragsnummer");
	});
});
