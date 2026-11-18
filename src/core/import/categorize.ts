/**
 * Buchung → Gegenkonto + Tags.
 *
 * Port von `mapping/categorizer.py`. Reihenfolge der Prüfungen ist Fachlogik,
 * nicht Stil: strukturelle Sonderfälle zuerst, dann vorzeichenabhängige Regeln,
 * dann PayPal, dann die Vault-Regeln, zuletzt der Auffangkorb mit `:tbc:`.
 *
 * Anders als das Original hält dieses Modul **keine** Konfiguration: Konten,
 * Regeln und Inhabernamen kommen über den Kontext herein. Der Grund ist nicht
 * Testbarkeit allein — im Plugin ist die Konfiguration zur Ladezeit noch nicht
 * da, und eine Änderung muss beim nächsten Lauf greifen.
 */

import { type KontoWurzeln, } from "../accounts/wurzeln";
import type { ImporterContext } from "../config/context";
import { parsePaypalRecipient } from "./paypal";
import { findMatchingRule, type CategorizerRules } from "./rules";
import type { BankTransaction } from "./transaction";

export function ledgerBargeld(w: KontoWurzeln): string {
	return `${w.asset}:Bargeld`;
}
export function ledgerUnbekannteSelbstbewegung(w: KontoWurzeln): string {
	return `${w.asset}:Sonstige_Selbst-Bewegung`;
}

/** Konto-Rollen, auf die sich die strukturellen Sonderregeln beziehen. */
export const ROLLE_HAUPTKONTO = "hauptkonto_privat";
export const ROLLE_VISA = "visa_daily";

export interface CategorizationResult {
	gegenAccount: string;
	tags: readonly string[];
	/** Name der Regel, die gegriffen hat — für Nachvollziehbarkeit im Report. */
	ruleName: string;
}

/**
 * Eine Regel, die je nach Vorzeichen des Betrags anders entscheidet.
 *
 * Das ist die einzige Fähigkeit, die den Vault-Regeln fehlt: ein Beteiligter
 * kann in beide Richtungen buchen (Krankenkasse zahlt Krankengeld und zieht
 * Beiträge ein; eine Mieterin überweist Miete, bekommt aber gelegentlich Geld
 * zurück). Bis diese Regeln in Vault-Notizen abbildbar sind, stehen sie hier —
 * aber als **Konfiguration**, nicht als Code mit Klarnamen. Genau daran
 * scheiterte die Visa-Erkennung: nutzerspezifische Werte im Quelltext werden
 * vom Privacy-Scrub entwertet und niemand merkt es.
 */
export interface SignDependentRule {
	/** Kleingeschriebener Suchbegriff im Namen der Gegenseite. */
	match: string;
	/** Gilt bei Betrag > 0. */
	positive: { account: string; tags: readonly string[]; ruleName: string };
	/** Gilt bei Betrag < 0 (und bei 0). */
	negative: { account: string; tags: readonly string[]; ruleName: string };
}

export interface CategorizeInput {
	ctx: ImporterContext;
	rules: CategorizerRules;
	/** Kleingeschriebene Inhabernamen für die Erkennung eigener Umbuchungen. */
	ownerNames: readonly string[];
	signRules: readonly SignDependentRule[];
}

export function categorize(
	tx: BankTransaction,
	input: CategorizeInput,
): CategorizationResult {
	const { ctx, rules, ownerNames, signRules } = input;
	const beguenstigterLower = tx.beguenstigter.toLowerCase().trim();

	// 1. Umbuchung auf ein eigenes Konto — erkennbar am Inhabernamen.
	if (isOwner(beguenstigterLower, ownerNames)) {
		return classifySelfTransfer(tx, ctx);
	}

	// 2.–4. Vom Visa-Parser synthetisierte Buchungstexte.
	if (tx.buchungstext === "VISA-LASTSCHRIFT") {
		const hauptkonto = ctx.ledgerByRolle.get(ROLLE_HAUPTKONTO);
		if (hauptkonto) {
			return result(hauptkonto, ["self-transfer"], "visa-lastschrift");
		}
	}
	if (tx.buchungstext === "EIGENE KREDITKARTENABRECHNUNG") {
		const visa = ctx.ledgerByRolle.get(ROLLE_VISA);
		if (visa) {
			return result(visa, ["self-transfer"], "visa-kreditkartenabrechnung");
		}
	}
	if (tx.buchungstext === "VISA-FX-GEBUEHR") {
		return result(`${ctx.wurzeln.expense}:Bankgebuehren:FX_Aufschlag`, [], "visa-fx-gebuehr");
	}

	// 5. Bargeldabhebung.
	if (
		tx.buchungstext.startsWith("BARGELDAUSZAHLUNG") ||
		tx.buchungstext.startsWith("GA NR") ||
		tx.buchungstext.startsWith("AUSZAHLUNG MIT KUNDENENTGELT")
	) {
		const tags = tx.buchungstext.startsWith("AUSZAHLUNG MIT")
			? ["review-needed"]
			: [];
		return result(ledgerBargeld(ctx.wurzeln), tags, "bargeld");
	}

	// 6. Bankgebühren und Rechnungsabschluss.
	if (tx.buchungstext === "ENTGELTABSCHLUSS") {
		return result(`${ctx.wurzeln.expense}:Bankgebuehren:Entgelt`, [], "entgelt");
	}
	if (tx.buchungstext === "ABSCHLUSS") {
		return classifyAbschluss(tx, ctx.wurzeln);
	}

	// 7. Beteiligte, die in beide Richtungen buchen.
	for (const rule of signRules) {
		if (rule.match !== "" && beguenstigterLower.includes(rule.match)) {
			const branch = tx.betrag.greaterThan(0) ? rule.positive : rule.negative;
			return result(branch.account, branch.tags, branch.ruleName);
		}
	}

	// 8. PayPal — lockerer Vergleich, weil die Sparkasse mal „PayPal Europe",
	//    mal „PayPal (Europe) S.a r.l." schreibt.
	if (beguenstigterLower.includes("paypal")) {
		return classifyPaypal(tx, rules, ctx.wurzeln);
	}

	// 9. Regeln aus dem Vault.
	const match = findMatchingRule(rules.counterparty, beguenstigterLower);
	if (match) {
		return result(
			match.ledgerAccount,
			match.tags,
			`counterparty:${match.pattern}`,
		);
	}

	// 10. Auffangkorb: nach Quelldatei getrennt, damit die Triage-Ansicht
	//     zeigt, aus welchem Auszug die offenen Posten stammen.
	return result(
		`${ctx.wurzeln.expense}:Unkategorisiert:${quelleStem(tx.quelle)}`,
		["tbc", "unkategorisiert"],
		"catchall",
	);
}

/** Buchungskonto der Zeile selbst: das Konto, dessen Auszug sie entstammt. */
export function postingAccount(
	tx: BankTransaction,
	ctx: ImporterContext,
): string {
	return ctx.ibanToLedger.get(tx.accountIban) ?? ledgerUnbekannteSelbstbewegung(ctx.wurzeln);
}

/** Inhabernamen aus der Konten-Konfiguration, kleingeschrieben und sortiert. */
export function deriveOwnerNames(ctx: ImporterContext): string[] {
	const names = new Set(
		ctx.konten.konten.map((k) => k.inhaber.toLowerCase()).filter((n) => n !== ""),
	);
	return [...names].sort();
}

function isOwner(nameLower: string, ownerNames: readonly string[]): boolean {
	return ownerNames.some((owner) => nameLower.includes(owner));
}

function classifySelfTransfer(
	tx: BankTransaction,
	ctx: ImporterContext,
): CategorizationResult {
	const target = ctx.ibanToLedger.get(tx.kontonummerIban);
	if (target) {
		return result(target, ["self-transfer"], "self-transfer-eigen");
	}
	// Eigener Name, aber unbekannte Gegen-IBAN — das will angesehen werden.
	return result(
		ledgerUnbekannteSelbstbewegung(ctx.wurzeln),
		["self-transfer", "review-needed"],
		"self-transfer-unbekannt",
	);
}

function classifyAbschluss(tx: BankTransaction, w: KontoWurzeln): CategorizationResult {
	if (tx.betrag.lessThan(0)) {
		return result(`${w.expense}:Bankgebuehren:Soll_Zinsen`, [], "abschluss-sollzinsen");
	}
	if (tx.betrag.greaterThan(0)) {
		return result(`${w.income}:Habenzinsen`, [], "abschluss-haben");
	}
	return result(`${w.expense}:Bankgebuehren:Entgelt`, ["info"], "abschluss-zero");
}

function classifyPaypal(
	tx: BankTransaction,
	rules: CategorizerRules,
	w: KontoWurzeln,
): CategorizationResult {
	const recipient = parsePaypalRecipient(tx.verwendungszweck);
	if (recipient) {
		const match = findMatchingRule(rules.paypal, recipient.toLowerCase());
		if (match) {
			// `paypal-via` macht im Journal sichtbar, dass die Zahlung über PayPal
			// lief — ohne es wäre der Händler nicht von einer Direktzahlung zu
			// unterscheiden.
			const tags = match.tags.includes("paypal-via")
				? match.tags
				: [...match.tags, "paypal-via"];
			return result(match.ledgerAccount, tags, `paypal:${match.pattern}`);
		}
	}
	return result(
		`${w.expense}:Unkategorisiert:PayPal`,
		["tbc", "paypal-via"],
		"paypal-unknown",
	);
}

/** Dateiname ohne Endung, Bindestriche zu Unterstrichen (Konto-Namen-tauglich). */
function quelleStem(quelle: string): string {
	if (quelle === "") {
		return "unknown";
	}
	const withoutExt = quelle.replace(/\.[^.]*$/, "");
	return withoutExt.replace(/-/g, "_");
}

function result(
	gegenAccount: string,
	tags: readonly string[],
	ruleName: string,
): CategorizationResult {
	return { gegenAccount, tags, ruleName };
}
