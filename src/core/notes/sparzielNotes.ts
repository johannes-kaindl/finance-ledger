/**
 * Sparziel-Notizen (Etappe E7 des Importer-Ports, portiert aus `output/sparziel.py`): je Eintrag aus
 * `sparziele.yaml` eine Notiz unter `30-Sparziele/` mit Kalkulation (Zielbetrag, Sparrate, ETA) und
 * Sparrate-Szenarien.
 *
 * Rein: keine Dateien, kein Vault. Bestehende Notizen kommen als Text herein.
 *
 * Eine **neue** Notiz bekommt Frontmatter, Kopf, Marker-Block und Benutzerteil. Eine **bestehende** mit Marker-Block
 * bekommt nur den Block ersetzt; ihre Frontmatter gehört dem Nutzer (`aktueller_stand_eur` wird von Hand gepflegt und
 * nie überschrieben). Eine bestehende **ohne** Marker-Block bleibt unberührt und wird gemeldet: sie ist eine vom Nutzer
 * geschriebene Notiz. (Der Python-Importer konnte sie mit `--all-sparziele-bodies` einmalig umrüsten; das ist eine
 * Migration und kommt hier nicht vor.)
 */

import type { ImporterContext } from "../config/context";
import type { SparzielSpec } from "../config/sparziele";
import { updateAutoNote } from "./autoNote";
import { AUTO_BEGIN, assembleBody } from "./markers";
import type { NotePlan } from "./kontoNotes";
import { kontoWikilink } from "./wikilinks";
import { quoteScalar } from "../../vendor/kit/frontmatter";

const FOUNDATION = "_Foundation – Konten-Plan und Kategorien";

export interface SparzielPlan {
	plans: NotePlan[];
	/** Notizen, die nicht angefasst wurden, mit Grund — für die Meldung an den Nutzer. */
	skipped: string[];
}

export function sparzielPath(ctx: ImporterContext, spec: SparzielSpec): string {
	return `${ctx.notesPrefix}/${ctx.folders.sparziele}/${spec.filename}`;
}

/** Baut für jedes Sparziel den zu schreibenden Text. `existing` ist nach Pfad geschlüsselt. */
export function planSparziele(
	ctx: ImporterContext,
	specs: readonly SparzielSpec[],
	existing: Readonly<Record<string, string>>,
): SparzielPlan {
	const plans: NotePlan[] = [];
	const skipped: string[] = [];
	for (const spec of specs) {
		const path = sparzielPath(ctx, spec);
		const vorhanden = existing[path];
		if (vorhanden === undefined) {
			plans.push({ path, existed: false, content: renderNeu(ctx, spec) });
		} else if (!vorhanden.includes(AUTO_BEGIN)) {
			skipped.push(`${spec.filename} (existiert ohne BEGIN/END-Marker — vom Nutzer geschrieben, nicht überschrieben)`);
		} else if (!vorhanden.startsWith("---")) {
			skipped.push(`${spec.filename} (existiert ohne Frontmatter — manuell prüfen)`);
		} else {
			plans.push({
				path,
				existed: true,
				content: updateAutoNote(vorhanden, {
					set: {},
					auto: renderAuto(ctx, spec),
					userDefault: "## 📌 Notizen\n\n_Eigene Anmerkungen zu diesem Sparziel — wird bei Re-Run NICHT überschrieben._\n",
				}),
			});
		}
	}
	return { plans, skipped };
}

/** Konto-Dateiname (ohne `.md`) zur `id` aus `konten.yaml`, oder `null`, wenn es das Konto nicht gibt. */
function kontoDatei(ctx: ImporterContext, kontoId: string): string | null {
	const iban = ctx.ibanById.get(kontoId) ?? kontoId;
	return ctx.ibanToFilename.get(iban) ?? null;
}

/** Monate bis zum Ziel, aufgerundet. */
function etaMonate(ziel: number, rate: number): number | null {
	return rate <= 0 ? null : Math.ceil(ziel / rate);
}

function etaText(monate: number | null): string {
	if (monate === null) return "—";
	const jahre = monate / 12;
	return jahre < 1 ? `${monate} Mon.` : `${runde(jahre, 1)} J`;
}

/**
 * Zahl mit fester Nachkommastelle wie Pythons `f"{x:.2f}"`: auf den genauen Binärwert gerundet, ein exakter Gleichstand
 * (`0.125`) auf die gerade Stelle. `toFixed` rundet einen exakten Gleichstand nach oben.
 */
function runde(x: number, stellen: number): string {
	const faktor = 10 ** stellen;
	const skaliert = Math.abs(x) * faktor;
	if (Number.isInteger(skaliert * 2) && !Number.isInteger(skaliert)) {
		const unten = Math.floor(skaliert);
		const n = unten % 2 === 0 ? unten : unten + 1;
		return `${x < 0 ? "-" : ""}${(n / faktor).toFixed(stellen)}`;
	}
	return x.toFixed(stellen);
}

function renderAuto(ctx: ImporterContext, spec: SparzielSpec): string {
	const datei = kontoDatei(ctx, spec.gespartAufKonto);
	const kontoZelle = datei === null ? "_unbekannt_" : kontoWikilink(ctx, datei);
	const ziel = spec.zielbetragEur;
	const rate = spec.sparrateMonatlichEur;

	const szenarien: Array<[string, number]> = [
		["Konservativ (×0.5)", 0.5],
		["**Default (×1.0)**", 1.0],
		["Aggressiv (×1.5)", 1.5],
		["Aufstockung (×2.0)", 2.0],
	];
	const rows = ["| Szenario | Sparrate | ETA |", "|---|---:|---:|"];
	for (const [label, faktor] of szenarien) {
		const r = rate * faktor;
		rows.push(`| ${label} | ${runde(r, 2)} €/Mon | ${etaText(etaMonate(ziel, r))} |`);
	}

	return [
		"## 🎯 Sparziel-Daten\n\n" +
			"| Feld | Wert |\n|---|---|\n" +
			"| Typ | `=this.sparziel_typ` |\n" +
			"| Zielbetrag | `=this.zielbetrag_eur` € |\n" +
			"| Aktueller Stand | `=this.aktueller_stand_eur` € |\n" +
			"| Sparrate / Monat | `=this.sparrate_monatlich_eur` € |\n" +
			"| Geplantes Ziel-Datum | `=this.geplantes_ziel_datum` |\n" +
			"| Gespart auf | `=this.gespart_auf` |\n" +
			"| Ledger-Kategorie | `=this.ledger_kategorie` |\n" +
			"| Aktiv | `=this.aktiv` |",
		"## 📐 Kalkulation\n\n" +
			"| Kennzahl | Wert |\n|---|---:|\n" +
			`| Zielbetrag | ${runde(ziel, 2)} € |\n` +
			`| Sparrate | ${runde(rate, 2)} €/Mon |\n` +
			`| ETA bei aktueller Sparrate | ${etaText(etaMonate(ziel, rate))} |`,
		"## 📊 Sparrate-Szenarien\n\n" + rows.join("\n"),
		"## 🔗 Verbindungen\n\n" +
			`- Spar-Konto: ${kontoZelle}\n` +
			`- Sparziele-Index: [[${ctx.notesPrefix}/${ctx.folders.sparziele}/${ctx.folders.sparziele}|${ctx.folders.sparziele}]]\n` +
			`- Konten-Plan: [[${ctx.notesPrefix}/${FOUNDATION}|Foundation]]`,
	].join("\n\n");
}

function renderNeu(ctx: ImporterContext, spec: SparzielSpec): string {
	const today = ctx.clock.today();
	const datei = kontoDatei(ctx, spec.gespartAufKonto) ?? "?";
	const frontmatter = [
		"---",
		`title: ${spec.title}`,
		"type: 📋 Referenz",
		"kategorie: sparziel",
		"tags:",
		"  - 🏗_Finanzplan",
		"  - finanzen/sparziel",
		"aliases:",
		...spec.aliases.map((a) => `  - ${a}`),
		"bereich: 💰 Finanzen",
		"projektbezug:",
		`  - ${quoteScalar(`[[${ctx.notesPrefix}/${ctx.projectNote}]]`)}`,
		"status: ✏️ In-Arbeit",
		"",
		`sparziel_typ: ${spec.sparzielTyp}`,
		`zielbetrag_eur: ${spec.zielbetragEur}`,
		"aktueller_stand_eur: null",
		`sparrate_monatlich_eur: ${spec.sparrateMonatlichEur}`,
		`geplantes_ziel_datum: ${spec.geplantesZielDatum ?? "null"}`,
		"gespart_auf:",
		`  - ${quoteScalar(`[[${ctx.notesPrefix}/${ctx.folders.konten}/${datei}]]`)}`,
		`ledger_kategorie: "${spec.ledgerKategorie}"`,
		"",
		"aktiv: true",
		"",
		`created: ${today}`,
		`updated: ${today}`,
		`sticker: ${spec.sticker}`,
		"---",
		"",
	].join("\n");
	const kopf =
		`## 🎯 ${spec.title}\n\n` +
		"> [!info] Auto-generiertes Sparziel-Note\n" +
		`> Typ \`${spec.sparzielTyp}\`, Zielbetrag ${spec.zielbetragEur} € bei ${spec.sparrateMonatlichEur} €/Monat. ` +
		"`aktueller_stand_eur` ist User-Edit-Feld — beim Anlegen `null`, manuell aus Bank-Online-Banking übertragen.\n";
	const userDefault =
		"## 📌 Notizen\n\n" +
		"_Eigene Anmerkungen zu diesem Sparziel (Strategie / Meilensteine / Quartal-Reviews) — wird bei Re-Run NICHT überschrieben._\n";
	return frontmatter + assembleBody(kopf, renderAuto(ctx, spec), userDefault);
}
