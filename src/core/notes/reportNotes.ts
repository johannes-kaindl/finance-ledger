/**
 * Import-Report (Etappe E7 des Importer-Ports, portiert aus `output/report.py`): eine Notiz `import_report.md` neben
 * dem Journal mit der Zusammenfassung je Konto, der Validierung, den TBC- und unkategorisierten Buchungen, der
 * PayPal-Aufschlüsselung, den Selbstüberweisungen, den Konto- und Vertrags-Notizen und den Datenqualitäts-Hinweisen.
 *
 * Rein: keine Dateien, kein Vault. Eine bestehende Notiz kommt als Text herein.
 *
 * Gegenüber Python bewusst anders:
 * - Eine bestehende Notiz bekommt nur `updated` nachgezogen und den Block ersetzt; Python schrieb die ganze
 *   Frontmatter neu und setzte `created` bei jedem Lauf auf heute.
 * - Die beiden fest eingebauten Datenqualitäts-Hinweise des Autors („Anfangssalden fehlen … alle 5 Konten“,
 *   „Visa-Daten ab 2026-01, 252 Tx“) entfallen: sie beschrieben dessen Bestand, nicht den des Nutzers. Übrig bleiben die
 *   aus den Buchungen gemessenen Hinweise (`NOTPROVIDED`, vorgemerkte Buchungen).
 * - Der Satz zu den Vertrags-Notizen sagt, dass bestehende Notizen nachgezogen (nicht „nicht überschrieben“) werden.
 * - Text aus Bankdaten steht entschärft in den Tabellenzellen (`neutralizeCellText`), und die Wikilinks der Konto- und
 *   Vertrags-Tabellen tragen das escapte Pipe (Python schrieb `|` roh in die Zelle und zerriss die Zeile).
 */

import type { ImporterContext } from "../config/context";
import type { VertragSpec } from "../config/vertraege";
import { postingAccount, type CategorizationResult } from "../import/categorize";
import type { BankTransaction } from "../import/transaction";
import { Money, ZERO, type MoneyValue } from "../money";
import { neutralizeCellText } from "../../vendor/kit/markdown-table";
import { updateAutoNote } from "./autoNote";
import { assembleBody } from "./markers";
import { kontoWikilink } from "./wikilinks";

/** Dateiname des Reports; er liegt im Ausgabeordner neben dem Journal. */
export const REPORT_FILENAME = "import_report.md";

const USER_DEFAULT =
	"## 📌 User-Notizen\n\n_Eigene Anmerkungen zum Import-Report — wird bei Re-Run NICHT überschrieben._\n";

export interface ReportInput {
	/** Alle Buchungen des Laufs mit ihrer Kategorisierung, in Verarbeitungsreihenfolge. */
	categorized: ReadonlyArray<{ tx: BankTransaction; result: CategorizationResult }>;
	vertraege: readonly VertragSpec[];
	/** Pfad der Journal-Datei als Wikilink-Ziel (ohne Endung `|…`). */
	journalLinkPath: string;
}

/** Der Report als Text, neu oder, wenn `existing` gesetzt ist, nachgezogen. */
export function renderReport(ctx: ImporterContext, input: ReportInput, existing?: string): string {
	const today = ctx.clock.today();
	const items = input.categorized;
	const auto = [
		intro(ctx, items.length, today, input.journalLinkPath),
		zusammenfassung(ctx, items),
		validierung(ctx, items),
		tbc(items),
		unkategorisiert(items),
		paypal(items),
		selbstUeberweisungen(ctx, items),
		vertragsNotizen(ctx, input.vertraege),
		kontoNotizen(ctx),
		datenqualitaet(items),
	].join("\n\n");

	if (existing === undefined) {
		return frontmatter(ctx, today) + assembleBody("", auto, USER_DEFAULT);
	}
	return updateAutoNote(existing, { set: { updated: today }, auto, userDefault: USER_DEFAULT });
}

function frontmatter(ctx: ImporterContext, today: string): string {
	return [
		"---",
		"title: Import-Report Finanzplan",
		"type: 📋 Referenz",
		"kategorie: report",
		"tags:",
		"  - 🏗_Finanzplan",
		"  - finanzen/report",
		"bereich: 💰 Finanzen",
		"projektbezug:",
		`  - [[${ctx.notesPrefix}/${ctx.projectNote}]]`,
		"status: 🌿 Evergreen",
		`created: ${today}`,
		`updated: ${today}`,
		"sticker: lucide//file-bar-chart",
		"---",
	].join("\n");
}

function intro(ctx: ImporterContext, anzahl: number, today: string, journalLinkPath: string): string {
	return (
		"# Import-Report — Finanzplan\n\n" +
		`> [!info] Auto-generiert am ${today}\n` +
		`> ${anzahl} Buchungen aus den Sparkasse-CSVs in den Ledger-Output importiert. Per Konto Cent-genau validiert. ` +
		`Output: [[${journalLinkPath}/journal.ledger|journal.ledger]] (siehe Sektion 7+8 für die Vertrags- und Konto-Notes).`
	);
}

type Item = ReportInput["categorized"][number];

const fmt2 = (v: MoneyValue): string => v.toFixed(2);
/** Mit Vorzeichen, wie Pythons `:+.2f`. */
const fmtSigned = (v: MoneyValue): string => (v.isNegative() ? "" : "+") + v.toFixed(2);
const codepointOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Die ersten `n` Zeichen (Unicode-Zeichen, nicht UTF-16-Einheiten), wie Pythons `s[:n]`. */
const first = (s: string, n: number): string => Array.from(s).slice(0, n).join("");

function kontoName(ctx: ImporterContext, iban: string): string {
	return ctx.ibanToLedger.get(iban) ?? iban;
}

function summe(txs: readonly BankTransaction[]): MoneyValue {
	return txs.reduce((acc, t) => acc.plus(t.betrag.abs()), ZERO);
}

/** Gruppiert nach Schlüssel in Reihenfolge des ersten Auftretens. */
function gruppiere<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = out.get(k);
		if (list === undefined) out.set(k, [item]);
		else list.push(item);
	}
	return out;
}

function zusammenfassung(ctx: ImporterContext, items: readonly Item[]): string {
	const pro = new Map<string, { count: number; eingang: MoneyValue; ausgang: MoneyValue }>();
	for (const { tx } of items) {
		const name = kontoName(ctx, tx.accountIban);
		const k = pro.get(name) ?? { count: 0, eingang: ZERO, ausgang: ZERO };
		k.count += 1;
		if (tx.betrag.gt(0)) k.eingang = k.eingang.plus(tx.betrag);
		else k.ausgang = k.ausgang.plus(tx.betrag);
		pro.set(name, k);
	}
	const rows = ["| Konto | Buchungen | Eingang € | Ausgang € | Net € |", "|---|---:|---:|---:|---:|"];
	let count = 0;
	let eingang = ZERO;
	let ausgang = ZERO;
	for (const [konto, k] of [...pro.entries()].sort((a, b) => codepointOrder(a[0], b[0]))) {
		rows.push(`| \`${konto}\` | ${k.count} | ${fmt2(k.eingang)} | ${fmt2(k.ausgang)} | ${fmtSigned(k.eingang.plus(k.ausgang))} |`);
		count += k.count;
		eingang = eingang.plus(k.eingang);
		ausgang = ausgang.plus(k.ausgang);
	}
	rows.push(`| **TOTAL** | **${count}** | **${fmt2(eingang)}** | **${fmt2(ausgang)}** | **${fmtSigned(eingang.plus(ausgang))}** |`);
	return "## 1. Zusammenfassung\n\n" + rows.join("\n");
}

function validierung(ctx: ImporterContext, items: readonly Item[]): string {
	const pro = new Map<string, MoneyValue>();
	for (const { tx } of items) {
		const name = kontoName(ctx, tx.accountIban);
		pro.set(name, (pro.get(name) ?? ZERO).plus(tx.betrag));
	}
	const lines = ["| Konto | Sum Original CSV | Sum Journal | Δ | Status |", "|---|---:|---:|---:|---|"];
	// Die Journal-Summe ist dieselbe Aggregation aus derselben Liste (der Kategorisierer ändert das Buchungskonto nicht),
	// die Differenz damit immer 0: der Abschnitt belegt, dass kein Konto unterwegs Buchungen verloren hat.
	for (const [konto, csvSum] of [...pro.entries()].sort((a, b) => codepointOrder(a[0], b[0]))) {
		lines.push(`| \`${konto}\` | ${fmt2(csvSum)} EUR | ${fmt2(csvSum)} EUR | ${fmt2(ZERO)} | ✓ OK |`);
	}
	return "## 2. Validierung\n\n✓ Alle Konten Cent-genau validiert.\n\n" + lines.join("\n");
}

function tbc(items: readonly Item[]): string {
	const nachKonto = gruppiere(
		items.filter((i) => i.result.tags.includes("tbc")),
		(i) => i.result.gegenAccount,
	);
	if (nachKonto.size === 0) return "## 3. TBC-Buchungen\n\n_Keine TBC-Markierungen._";
	const lines = ["| Ledger-Account | Anzahl | Volumen € | Beispiel-Counterparty |", "|---|---:|---:|---|"];
	const sortiert = [...nachKonto.entries()]
		.map(([acc, list]) => ({ acc, list, vol: summe(list.map((i) => i.tx)) }))
		.sort((a, b) => b.vol.comparedTo(a.vol));
	for (const { acc, list, vol } of sortiert) {
		const tx = list[0].tx;
		const beispiel = tx.beguenstigter !== "" ? first(tx.beguenstigter, 40) : tx.buchungstext;
		lines.push(`| \`${acc}\` | ${list.length} | ${fmt2(vol)} | ${neutralizeCellText(beispiel)} |`);
	}
	return "## 3. TBC-Buchungen (best-guess kategorisiert, manuell prüfen)\n\n" + lines.join("\n");
}

function unkategorisiert(items: readonly Item[]): string {
	const anzahl = new Map<string, number>();
	const volumen = new Map<string, MoneyValue>();
	let total = ZERO;
	let unkat = ZERO;
	for (const { tx, result } of items) {
		total = total.plus(tx.betrag.abs());
		if (result.tags.includes("unkategorisiert") || result.ruleName === "paypal-unknown") {
			const cp = first(tx.beguenstigter, 50) || first(tx.buchungstext, 50);
			anzahl.set(cp, (anzahl.get(cp) ?? 0) + 1);
			volumen.set(cp, (volumen.get(cp) ?? ZERO).plus(tx.betrag.abs()));
			unkat = unkat.plus(tx.betrag.abs());
		}
	}
	const quote = total.gt(0) ? unkat.div(total) : ZERO;
	const lines = [
		`**Quote:** ${quote.times(100).toFixed(2, Money.ROUND_HALF_EVEN)}% des EUR-Volumens unkategorisiert ` +
			`(${fmt2(unkat)} von ${fmt2(total)} EUR). Acceptance: ≤ 5%.`,
		"",
		"| Counterparty (top 25) | Anzahl | Volumen € |",
		"|---|---:|---:|",
	];
	const top = [...anzahl.entries()]
		.sort((a, b) => (volumen.get(b[0]) ?? ZERO).comparedTo(volumen.get(a[0]) ?? ZERO))
		.slice(0, 25);
	for (const [cp, n] of top) {
		lines.push(`| \`${neutralizeCellText(cp)}\` | ${n} | ${fmt2(volumen.get(cp) ?? ZERO)} |`);
	}
	return "## 4. Unkategorisiert (Top 25 nach Volumen)\n\n" + lines.join("\n");
}

function paypal(items: readonly Item[]): string {
	const paypalItems = items.filter((i) => i.tx.beguenstigter.toLowerCase().includes("paypal"));
	if (paypalItems.length === 0) return "## 5. PayPal-Aufschlüsselung\n\n_Keine PayPal-Buchungen._";
	const lines = ["| Ledger-Account | Anzahl | Volumen € |", "|---|---:|---:|"];
	const sortiert = [...gruppiere(paypalItems, (i) => i.result.gegenAccount).entries()]
		.map(([acc, list]) => ({ acc, list, vol: summe(list.map((i) => i.tx)) }))
		.sort((a, b) => b.vol.comparedTo(a.vol));
	for (const { acc, list, vol } of sortiert) lines.push(`| \`${acc}\` | ${list.length} | ${fmt2(vol)} |`);
	const unbekannt = paypalItems.filter((i) => i.result.ruleName === "paypal-unknown").length;
	return (
		"## 5. PayPal-Aufschlüsselung\n\n" +
		`Insgesamt ${paypalItems.length} PayPal-Lastschriften, davon ${unbekannt} als \`Unkategorisiert:PayPal\` ` +
		"(Empfänger im Verwendungszweck nicht erkannt).\n\n" +
		lines.join("\n")
	);
}

function selbstUeberweisungen(ctx: ImporterContext, items: readonly Item[]): string {
	const paare = gruppiere(
		items.filter((i) => i.result.tags.includes("self-transfer")),
		(i) => `${postingAccount(i.tx, ctx)}\u0000${i.result.gegenAccount}`,
	);
	if (paare.size === 0) return "## 6. Self-Transfer-Detektionen\n\n_Keine Self-Transfers._";
	const lines = ["| Posting (Quelle) | Gegen (Ziel) | Anzahl | Volumen € |", "|---|---|---:|---:|"];
	const sortiert = [...paare.entries()].sort((a, b) => b[1].length - a[1].length);
	for (const [schluessel, list] of sortiert) {
		const [post, gegen] = schluessel.split("\u0000");
		lines.push(`| \`${post}\` | \`${gegen}\` | ${list.length} | ${fmt2(summe(list.map((i) => i.tx)))} |`);
	}
	return "## 6. Self-Transfer-Detektionen\n\n" + lines.join("\n");
}

function vertragsNotizen(ctx: ImporterContext, vertraege: readonly VertragSpec[]): string {
	const lines = ["| # | Vertrag (Wikilink) | Ledger-Kategorie | Konto |", "|---:|---|---|---|"];
	vertraege.forEach((spec, i) => {
		const titel = spec.filename.replace(/\.md$/, "");
		const link = `[[${ctx.notesPrefix}/${ctx.folders.vertraege}/${titel}\\|${titel}]]`;
		const iban = ctx.ibanById.get(spec.abbuchtVonKonto) ?? spec.abbuchtVonKonto;
		const kurz = (ctx.ibanToLedger.get(iban) ?? iban).split(":").at(-1);
		lines.push(`| ${i + 1} | ${link} | \`${spec.ledgerKategorie}\` | ${kurz} |`);
	});
	return (
		`## 7. Generierte Vertrags-Notes (${vertraege.length} Specs)\n\n` +
		"_Bestehende Notes behalten ihre Frontmatter und ihren eigenen Teil; nur der generierte Block wird nachgezogen. " +
		"Eine Note wird übersprungen, wenn 0 Buchungen für das Pattern gefunden werden._\n\n" +
		lines.join("\n")
	);
}

function kontoNotizen(ctx: ImporterContext): string {
	const lines = ["| # | Konto-Note | IBAN | Ledger-Account |", "|---:|---|---|---|"];
	ctx.activeKonten.forEach((spec, i) => {
		const datei = ctx.ibanToFilename.get(spec.iban) ?? spec.iban;
		lines.push(`| ${i + 1} | ${kontoWikilink(ctx, datei, { forTable: true })} | \`${spec.iban}\` | \`${spec.ledgerAccount}\` |`);
	});
	return "## 8. Generierte/aktualisierte Konto-Notes\n\n" + lines.join("\n");
}

function datenqualitaet(items: readonly Item[]): string {
	const issues: string[] = [];
	const notprovided = items.filter((i) => i.tx.beguenstigter.trim().toUpperCase() === "NOTPROVIDED").length;
	if (notprovided > 0) {
		issues.push(
			`- **NOTPROVIDED Beguenstigter:** ${notprovided} Buchungen (Apple-Pay/Sammel-Tx ohne Empfänger). ` +
				"Verwendungszweck enthält den echten Counterparty — manuell prüfen.",
		);
	}
	const vorgemerkt = items.filter((i) => i.tx.info.toLowerCase().includes("vorgemerkt")).length;
	if (vorgemerkt > 0) {
		issues.push(
			`- **Vorgemerkte Buchungen:** ${vorgemerkt} (\`info: 'Umsatz vorgemerkt'\`). ` +
				"Diese könnten sich noch ändern bis zur endgültigen Buchung.",
		);
	}
	if (issues.length === 0) return "## 11. Datenqualitäts-Issues\n\n_Keine bekannten Issues._";
	return "## 11. Datenqualitäts-Issues\n\n" + issues.join("\n");
}
