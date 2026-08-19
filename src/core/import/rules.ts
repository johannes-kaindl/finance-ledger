/**
 * Kategorisierungs-Regeln, wie der Kern sie sieht.
 *
 * Die Regeln leben als Notizen im Vault (`kategorie: categorizer-rule`) — das
 * Plugin liest sie über `categorizer-rules/loader.ts`, der Python-Importer über
 * `vault_loader.py`. Der Kern kennt weder Vault noch Dateien: er bekommt eine
 * fertige, sortierte Liste und wendet sie an.
 */

export interface MatchRule {
	/** Kleingeschriebener Suchbegriff; er muss im Namen der Gegenseite vorkommen. */
	pattern: string;
	ledgerAccount: string;
	tags: readonly string[];
}

export interface CategorizerRules {
	/** Regeln gegen den Zahlungsempfänger. */
	counterparty: MatchRule[];
	/** Regeln gegen den aus dem Verwendungszweck gelesenen PayPal-Empfänger. */
	paypal: MatchRule[];
}

export const EMPTY_RULES: CategorizerRules = { counterparty: [], paypal: [] };

/**
 * Eine Regel-Notiz, wie sie aus dem Vault kommt — vor der Expansion der Aliase.
 *
 * `sourceFile` dient nur der Sortierung und Konfliktmeldung; der Kern trifft
 * damit keine fachliche Entscheidung.
 */
export interface RuleNote {
	pattern: string;
	patternType: "substring" | "paypal-sub";
	ledgerAccount: string;
	priority: number;
	tags: string[];
	aliases: string[];
	sourceFile: string;
}

/**
 * Regel-Notizen → anwendbare Regellisten.
 *
 * Sortiert nach `priority` aufsteigend und bei Gleichstand nach Dateiname.
 * Der zweite Schlüssel ist nicht Kosmetik: ohne ihn hinge die Reihenfolge
 * zweier gleichrangiger, kollidierender Regeln davon ab, in welcher Reihenfolge
 * Obsidian die Dateien liefert — dieselbe Buchung landete mal hier, mal dort.
 * Der Python-Importer liest die Dateien sortiert und erreicht dasselbe.
 *
 * Aliase werden zu eigenen Einträgen expandiert; sie erben Konto und Tags.
 */
export function buildRules(notes: readonly RuleNote[]): CategorizerRules {
	const sorted = [...notes].sort(
		(a, b) => a.priority - b.priority || compareCodepoints(a.sourceFile, b.sourceFile),
	);

	const counterparty: MatchRule[] = [];
	const paypal: MatchRule[] = [];

	for (const note of sorted) {
		const target = note.patternType === "paypal-sub" ? paypal : counterparty;
		for (const pattern of [note.pattern, ...note.aliases]) {
			target.push({
				// Der Vergleich läuft immer kleingeschrieben — einmal hier, statt
				// bei jeder der tausenden Buchungen erneut.
				pattern: pattern.toLowerCase(),
				ledgerAccount: note.ledgerAccount,
				tags: [...note.tags],
			});
		}
	}
	return { counterparty, paypal };
}

/**
 * Vergleich nach Code-Punkten, nicht nach Gebietsschema.
 *
 * `localeCompare` würde „Ärger.md" je nach Sprache vor oder nach „Zoo.md"
 * einsortieren; der Python-Importer sortiert nach Code-Punkten. Bei zwei
 * gleichrangigen, kollidierenden Regeln entschiede das über das Zielkonto.
 */
function compareCodepoints(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Erste Regel, deren Suchbegriff im Text vorkommt. */
export function findMatchingRule(
	rules: readonly MatchRule[],
	haystackLower: string,
): MatchRule | null {
	for (const rule of rules) {
		if (rule.pattern !== "" && haystackLower.includes(rule.pattern)) {
			return rule;
		}
	}
	return null;
}
