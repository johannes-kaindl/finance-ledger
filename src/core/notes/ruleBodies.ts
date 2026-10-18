/**
 * Rümpfe der Categorizer-Regel-Notizen (Etappe E7 des Importer-Ports, portiert aus `output/categorizer_rule.py`):
 * unter dem Marker-Block jeder Regel-Notiz stehen die Regel-Übersicht und bis zu fünf Buchungen, auf die das Muster
 * passt. Die Frontmatter der Regel gehört dem Nutzer und der Regel-Verwaltung und wird nie angefasst; der Teil unter
 * dem Block ebenso wenig.
 *
 * Rein: keine Dateien, kein Vault. Die Regel-Notizen kommen als Text herein.
 */

import type { ImporterContext } from "../config/context";
import type { BankTransaction } from "../import/transaction";
import { parseFrontmatter } from "../../vendor/kit/frontmatter";
import { updateAutoNote } from "./autoNote";
import type { NotePlan } from "./kontoNotes";
import { empfaengerWikilink, monatsberichtWikilink } from "./wikilinks";
import { canonicalFromAccount } from "./slug";

export const MAX_SAMPLE_TX = 5;

const FOUNDATION = "_Foundation – Konten-Plan und Kategorien";

const USER_DEFAULT =
	"## 📌 Notizen\n\n" +
	"_Eigene Anmerkungen zu dieser Rule (Pattern-Validierung, Edge-Cases, Deprecation-Hinweise) — wird bei Re-Run NICHT überschrieben._\n";

/** Eine Regel-Notiz, wie sie im Vault liegt. */
export interface RegelNotiz {
	path: string;
	text: string;
}

/** Die ersten Buchungen, auf die das Muster passt (Teilstring ohne Groß-/Kleinschreibung über Gegenseite, Buchungstext und Zweck). */
function passende(transactions: readonly BankTransaction[], pattern: string): BankTransaction[] {
	const p = pattern.toLowerCase();
	if (p === "") return [];
	const out: BankTransaction[] = [];
	for (const tx of transactions) {
		if (`${tx.beguenstigter} ${tx.buchungstext} ${tx.verwendungszweck}`.toLowerCase().includes(p)) {
			out.push(tx);
			if (out.length >= MAX_SAMPLE_TX) break;
		}
	}
	return out;
}

/**
 * Pläne für alle Regel-Notizen, die eine Regel sind (`kategorie: categorizer-rule`). Notizen ohne Frontmatter, mit
 * anderer Art und die Ordner-Notiz (gleichnamig wie der Ordner) bleiben unberührt und stehen nicht im Ergebnis.
 */
export function planRuleBodies(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	notizen: readonly RegelNotiz[],
): NotePlan[] {
	const plans: NotePlan[] = [];
	for (const notiz of notizen) {
		const name = notiz.path.slice(notiz.path.lastIndexOf("/") + 1);
		if (name === `${ctx.folders.rules}.md` || name === "_README – Categorizer-Rules.md") continue;
		const fm = parseFrontmatter(notiz.text);
		if (Object.keys(fm.data).length === 0 || fm.data["kategorie"] !== "categorizer-rule") continue;

		const pattern = String(fm.data["pattern"] ?? "");
		const patternType = String(fm.data["pattern_type"] ?? "substring");
		const ledgerAccount = String(fm.data["ledger_account"] ?? "?");
		const priority = fm.data["priority"] === undefined ? "0" : String(fm.data["priority"]);
		const auto = renderAuto(ctx, pattern, patternType, ledgerAccount, priority, passende(transactions, pattern));
		plans.push({
			path: notiz.path,
			existed: true,
			content: updateAutoNote(notiz.text, { set: {}, auto, userDefault: USER_DEFAULT }),
		});
	}
	return plans;
}

function renderAuto(
	ctx: ImporterContext,
	pattern: string,
	patternType: string,
	ledgerAccount: string,
	priority: string,
	sample: readonly BankTransaction[],
): string {
	const lines: string[] = [
		"## 🏷️ Rule-Übersicht\n",
		"| Feld | Wert |",
		"|---|---|",
		`| Pattern | \`${pattern}\` |`,
		`| Pattern-Type | \`${patternType}\` |`,
		`| Ziel-Account | \`${ledgerAccount}\` |`,
		`| Priority | ${priority} |`,
		"",
	];
	if (sample.length > 0) {
		const canonical = canonicalFromAccount(ledgerAccount);
		lines.push(`## 🔍 Sample-Tx (matched, limit ${MAX_SAMPLE_TX})\n`, "| Datum | Betrag | Empfänger / Buchungstext |", "|---|---:|---|");
		for (const tx of sample) {
			const datum = monatsberichtWikilink(ctx, Number(tx.buchungstag.slice(0, 4)), Number(tx.buchungstag.slice(5, 7)), {
				display: tx.buchungstag,
				forTable: true,
			});
			const zelle = empfaengerWikilink(ctx, ledgerAccount, { display: canonical, forTable: true });
			lines.push(`| ${datum} | ${tx.betrag.toFixed(2)} € | ${zelle} |`);
		}
		lines.push("");
	} else {
		lines.push("## 🔍 Sample-Tx\n", "_Keine matchenden Tx im aktuellen journal.ledger gefunden — Pattern eventuell veraltet._\n");
	}
	lines.push(
		"## 🔗 Verweise\n",
		`- [[${ctx.notesPrefix}/${ctx.folders.rules}/${ctx.folders.rules}|Categorizer-Rules-Hub]]`,
		`- [[${ctx.notesPrefix}/${FOUNDATION}|Foundation]]`,
	);
	return lines.join("\n");
}
