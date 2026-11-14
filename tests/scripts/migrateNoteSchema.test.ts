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


/** Die vier Reste der Schema-Anpassung (Welle 34): ausgabengruppe, vertrag_link, Uhrzeit, IBAN als Aktenzeichen. */
describe("migriere: Schema-Rest (Welle 34)", () => {
	const KATEGORIE = `---
title: Kategorie Wohnen
type: 📋 Referenz
tags:
  - 🏗_Finanzplan
  - finanzen/kategorie-note
status: in-arbeit
created: 2026-05-11
updated: 2026-05-12
note_type: kategorie-note
lebensbereich: wohnen
period: alltime
---

# Wohnen
`;
	const MANDAT = `---
title: Mandat M1
tags:
  - 🏗_Finanzplan
status: in-arbeit
created: 2026-05-11 09:10:15
updated: 2026-05-12T08:00:00
note_type: mandat-note
vertrag_link: null
tx_count: 3
---
`;
	const MANDAT_MIT = MANDAT.replace("vertrag_link: null", 'vertrag_link:\n  - "[[X/Erster]]"');

	it("benennt lebensbereich in ausgabengruppe um und setzt an Datumsangaben ohne Uhrzeit 00:00:00", () => {
		const r = migriere(KATEGORIE);
		expect(r.befund).toEqual([]);
		expect(r.text).toContain("\nausgabengruppe: wohnen\n");
		expect(r.text).not.toContain("lebensbereich:");
		expect(r.text).toContain("\ncreated: 2026-05-11 00:00:00\n");
		expect(r.text).toContain("\nupdated: 2026-05-12 00:00:00\n");
		expect(r.geaendert).toEqual(expect.arrayContaining(["lebensbereich → ausgabengruppe", "created ohne Uhrzeit", "updated ohne Uhrzeit"]));
	});

	it("lässt die Typangabe kategorie: lebensbereich einer Ordnernotiz stehen und benennt nur den Schlüssel", () => {
		const hub = "---\ntags:\n  - 🏗_Finanzplan\nkategorie: lebensbereich\nlebensbereich: freizeit\n---\n";
		const r = migriere(hub);
		expect(r.text).toContain("\nkategorie: lebensbereich\n");
		expect(r.text).toContain("\nausgabengruppe: freizeit\n");
	});

	it("entfernt vertrag_link: null, lässt eine Liste und Datumsformen mit Uhrzeit stehen", () => {
		const r = migriere(MANDAT);
		expect(r.text).not.toContain("vertrag_link");
		expect(r.text).toContain("\ncreated: 2026-05-11 09:10:15\n");
		expect(r.text).toContain("\nupdated: 2026-05-12T08:00:00\n");
		expect(r.geaendert).toEqual(["vertrag_link: null entfernt"]);
		expect(migriere(MANDAT_MIT).geaendert).toEqual([]);
	});

	it("setzt eine IBAN als Aktenzeichen einer Vertragsnotiz auf null und lässt eine echte Nummer stehen", () => {
		const iban = "---\ntags:\n  - 🏗_Finanzplan\nkategorie: vertrag\naktenzeichen: \"DE89370400440532013000\"\n---\n";
		const r = migriere(iban);
		expect(r.text).toContain("\naktenzeichen: null\n");
		expect(r.geaendert).toEqual(["aktenzeichen: IBAN → null"]);
		expect(migriere(iban.replace("DE89370400440532013000", "ACME-123")).geaendert).toEqual([]);
	});

	it("ist beim zweiten Lauf still", () => {
		for (const t of [KATEGORIE, MANDAT]) {
			const einmal = migriere(t).text;
			expect(migriere(einmal).geaendert).toEqual([]);
		}
	});

	it("bricht ab, wenn ausgabengruppe schon neben lebensbereich steht (nichts geraten)", () => {
		const r = migriere(KATEGORIE.replace("lebensbereich: wohnen", "lebensbereich: wohnen\nausgabengruppe: freizeit"));
		expect(r.befund.join(" ")).toContain("ausgabengruppe");
		expect(r.text).toContain("lebensbereich: wohnen");
	});
});
