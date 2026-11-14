/**
 * Zieht bestehende Import-Notizen auf das Schema der Vault-Typen nach (Welle 33): `status` als Enum-Wert statt Anzeigeform,
 * `vertragsnummer` → `aktenzeichen` (samt `=this.aktenzeichen` im Auto-Block der Vertragsnotizen) und die Felder ohne Verbraucher
 * (`priority`, `sticker`, `aggregat_base`, `sicht`, `abgeschlossen_am`) weg. Neu erzeugte Notizen kommen schon so aus dem Plugin;
 * der Import zieht in bestehenden Notizen nur seine eigenen Felder nach und fasst diese nie an.
 *
 * Welle 34 (Entscheidung Johannes 2026-11-14) zieht vier Reste nach: `lebensbereich` → `ausgabengruppe` (nur der Schlüssel; die Typangabe
 * `kategorie: lebensbereich` einer Ordnernotiz bleibt), `vertrag_link: null` weg (eine Liste bleibt), `created`/`updated` ohne Uhrzeit
 * bekommen ` 00:00:00` wie die Berichte (Formen mit Uhrzeit bleiben, wie sie sind), und eine IBAN als `aktenzeichen` einer Vertragsnotiz wird `null`
 * (eine Bausparkasse trägt die IBAN des Zahlers als Mandatsreferenz ein, die Extraktion nimmt sie seither nicht mehr).
 *
 * Aufruf (Trockenlauf ist der Standard, geschrieben wird nur mit `--apply`):
 *   npm run migrate-note-schema -- <finanzplan-ordner> [--apply]
 *
 * Der Ordner ist der Finanz-Stamm des Vaults (der mit `10-Konten`, `20-Verträge`, …). Angefasst werden nur Notizen der zehn
 * Import-Ordner und `Ledger/import_report.md`, die den Tag `🏗_Finanzplan` tragen und keine Categorizer-Regel sind (deren `priority`
 * ist die Rang-Zahl der Regel, etwas anderes).
 *
 * Sicherung: Vor dem Schreiben wird die Frontmatter vorher und nachher mit `parseFrontmatter` gelesen; sie darf sich nur um genau
 * die genannten Schlüssel unterscheiden, sonst bleibt die Notiz unberührt und steht im Befund. Geschrieben wird über eine
 * Temp-Datei und `rename`. Ein zweiter Lauf ändert nichts.
 */

import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, type FmValue } from "../src/vendor/kit/frontmatter";

const ORDNER = ["10-Konten", "20-Verträge", "30-Sparziele", "40-Monatsberichte", "45-Kategorien", "50-Mandate", "50-Tx-Typen", "60-Empfänger", "70-Quartalsberichte", "80-Jahresberichte"];
const WEG = ["priority", "sticker", "aggregat_base", "sicht", "abgeschlossen_am"];
const STATUS = new Set(["entwurf", "in-arbeit", "evergreen", "erledigt", "archiv", "frozen"]);
const TAG = "🏗_Finanzplan";
const NUR_TAG = /^\d{4}-\d{2}-\d{2}$/;
const IBAN_FORM = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

export interface Ergebnis {
	text: string;
	geaendert: string[];
	befund: string[];
}

/** Die Frontmatter-Zeilen ohne Zaun und der Rest; `null`, wenn die Notiz keinen Block hat. */
function teile(text: string): { kopf: string; block: string[]; zaun: string; rest: string } | null {
	const m = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text);
	if (!m) return null;
	return { kopf: m[1], block: m[2].split("\n"), zaun: m[3], rest: text.slice(m[0].length) };
}

function statusWert(roh: string): string {
	return roh.replace(/^["']|["']$/g, "").replace(/[^\p{L}-]/gu, "").toLowerCase();
}

/** Rein: bringt den Text einer Notiz aufs Schema, ohne Dateizugriff. */
export function migriere(text: string): Ergebnis {
	const ergebnis: Ergebnis = { text, geaendert: [], befund: [] };
	const t = teile(text);
	if (!t) return ergebnis;
	const vorher = parseFrontmatter(text);
	const tags = vorher.data["tags"];
	if (!Array.isArray(tags) || !tags.includes(TAG)) return ergebnis;
	if (vorher.data["kategorie"] === "categorizer-rule") return ergebnis;
	const istVertrag = vorher.data["kategorie"] === "vertrag";

	const hatAktenzeichen = "aktenzeichen" in vorher.data;
	const hatGruppe = "ausgabengruppe" in vorher.data;
	const neu: string[] = [];
	for (const zeile of t.block) {
		const m = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*?))?\r?$/.exec(zeile);
		const schluessel = m?.[1];
		if (schluessel && WEG.includes(schluessel) && m[2] !== undefined && m[2] !== "") {
			ergebnis.geaendert.push(`${schluessel} entfernt`);
			continue;
		}
		if (schluessel === "status" && m?.[2] !== undefined) {
			const wert = statusWert(m[2]);
			if (wert !== m[2].trim()) {
				if (STATUS.has(wert)) {
					neu.push(`status: ${wert}${zeile.endsWith("\r") ? "\r" : ""}`);
					ergebnis.geaendert.push(`status ${m[2].trim()} → ${wert}`);
					continue;
				}
				ergebnis.befund.push(`status ${m[2].trim()} ist kein Enum-Wert und wird nicht geraten`);
			}
		}
		const cr = zeile.endsWith("\r") ? "\r" : "";
		const wertRoh = (m?.[2] ?? "").replace(/\r$/, "");
		if (schluessel === "lebensbereich" && m?.[2] !== undefined) {
			if (hatGruppe) {
				ergebnis.befund.push("lebensbereich und ausgabengruppe stehen beide da, nichts umbenannt");
			} else {
				neu.push(zeile.replace(/^lebensbereich:/, "ausgabengruppe:"));
				ergebnis.geaendert.push("lebensbereich → ausgabengruppe");
				continue;
			}
		}
		if (schluessel === "vertrag_link" && wertRoh === "null") {
			ergebnis.geaendert.push("vertrag_link: null entfernt");
			continue;
		}
		if ((schluessel === "created" || schluessel === "updated") && NUR_TAG.test(wertRoh)) {
			neu.push(`${schluessel}: ${wertRoh} 00:00:00${cr}`);
			ergebnis.geaendert.push(`${schluessel} ohne Uhrzeit`);
			continue;
		}
		if (schluessel === "aktenzeichen" && istVertrag && IBAN_FORM.test(wertRoh.replace(/^["']|["']$/g, "").replace(/\s+/g, "").toUpperCase())) {
			neu.push(`aktenzeichen: null${cr}`);
			ergebnis.geaendert.push("aktenzeichen: IBAN → null");
			continue;
		}
		if (schluessel === "vertragsnummer" && istVertrag) {
			if (hatAktenzeichen) {
				ergebnis.befund.push("vertragsnummer und aktenzeichen stehen beide da, nichts umbenannt");
			} else {
				neu.push(zeile.replace(/^vertragsnummer:/, "aktenzeichen:"));
				ergebnis.geaendert.push("vertragsnummer → aktenzeichen");
				continue;
			}
		}
		neu.push(zeile);
	}

	let rest = t.rest;
	if (istVertrag && !ergebnis.befund.some((b) => b.startsWith("vertragsnummer")) && rest.includes("=this.vertragsnummer")) {
		rest = rest.split("=this.vertragsnummer").join("=this.aktenzeichen");
		ergebnis.geaendert.push("Auto-Block: =this.vertragsnummer → =this.aktenzeichen");
	}
	if (ergebnis.geaendert.length === 0) return ergebnis;

	const nachher = t.kopf + neu.join("\n") + t.zaun + rest;

	// Sicherung: nur die genannten Schlüssel dürfen sich unterscheiden.
	const danach = parseFrontmatter(nachher);
	const erlaubt = new Set([...WEG, "vertragsnummer", "aktenzeichen", "status", "lebensbereich", "ausgabengruppe", "vertrag_link", "created", "updated"]);
	const schluessel = new Set([...Object.keys(vorher.data), ...Object.keys(danach.data)]);
	for (const k of schluessel) {
		if (erlaubt.has(k)) continue;
		if (JSON.stringify(vorher.data[k] as FmValue | undefined) !== JSON.stringify(danach.data[k] as FmValue | undefined)) {
			return { text, geaendert: [], befund: [`Sicherung: ${k} wäre mitverändert worden, Notiz unberührt`] };
		}
	}
	// Die Schlüssel mit eigener Regel dürfen sich nur in dieser Weise ändern.
	const gleich = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
	if (!hatGruppe && vorher.data["lebensbereich"] !== undefined && !gleich(vorher.data["lebensbereich"], danach.data["ausgabengruppe"] ?? vorher.data["lebensbereich"])) {
		return { text, geaendert: [], befund: ["Sicherung: der Wert von lebensbereich wäre verändert worden, Notiz unberührt"] };
	}
	for (const k of ["created", "updated"]) {
		const alt = vorher.data[k];
		const neuWert = danach.data[k];
		if (alt !== undefined && !gleich(alt, neuWert) && String(neuWert) !== `${String(alt)} 00:00:00`) {
			return { text, geaendert: [], befund: [`Sicherung: ${k} wäre anders als um die Uhrzeit verändert worden, Notiz unberührt`] };
		}
	}
	if (Array.isArray(vorher.data["vertrag_link"]) && !gleich(vorher.data["vertrag_link"], danach.data["vertrag_link"])) {
		return { text, geaendert: [], befund: ["Sicherung: eine vorhandene vertrag_link-Liste wäre verändert worden, Notiz unberührt"] };
	}
	ergebnis.text = nachher;
	return ergebnis;
}

async function dateien(wurzel: string): Promise<string[]> {
	const aus: string[] = [];
	for (const ordner of ORDNER) {
		let namen: string[];
		try {
			namen = await readdir(join(wurzel, ordner));
		} catch {
			continue;
		}
		for (const n of namen) if (n.endsWith(".md")) aus.push(join(ordner, n));
	}
	aus.push(join("Ledger", "import_report.md"));
	return aus;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const apply = args.includes("--apply");
	const wurzel = args.find((a) => !a.startsWith("--"));
	if (!wurzel) {
		console.error("Aufruf: npm run migrate-note-schema -- <finanzplan-ordner> [--apply]");
		process.exit(2);
	}
	let geprueft = 0;
	let geaendert = 0;
	const zaehler = new Map<string, number>();
	for (const rel of await dateien(wurzel)) {
		const pfad = join(wurzel, rel);
		let text: string;
		try {
			text = await readFile(pfad, "utf-8");
		} catch {
			continue;
		}
		geprueft += 1;
		const r = migriere(text);
		for (const b of r.befund) console.log(`BEFUND ${rel}: ${b}`);
		if (r.geaendert.length === 0 || r.text === text) continue;
		geaendert += 1;
		for (const g of r.geaendert) zaehler.set(g, (zaehler.get(g) ?? 0) + 1);
		if (apply) {
			const tmp = `${pfad}.fl-migrate.tmp`;
			await writeFile(tmp, r.text, "utf-8");
			await rename(tmp, pfad);
		}
	}
	console.log(`${apply ? "GESCHRIEBEN" : "TROCKENLAUF"}: ${geprueft} Notizen geprüft, ${geaendert} ${apply ? "geändert" : "würden geändert"}`);
	for (const [k, n] of [...zaehler].sort()) console.log(`  ${String(n).padStart(4)}× ${k}`);
}

if (process.argv[1]?.endsWith("migrate-note-schema.mjs")) void main();
