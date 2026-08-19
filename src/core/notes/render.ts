/**
 * Markdown-Bausteine für die Auto-Abschnitte generierter Notizen.
 *
 * Portiert aus `output/body_template.py`, dort aber in derselben Datei wie das
 * Marker-System. Hier getrennt: die Marker sind ein allgemeines Verfahren
 * (Kit-Kandidat), diese Helfer sind Darstellung für genau diesen Vault. Was
 * gemeinsam liegt, wandert gemeinsam — und das wäre hier falsch.
 *
 * Das Callout-Wickeln liegt nicht hier, sondern in `./callout` — es ist aus
 * `yijing-oracle` übernommen statt neu gebaut (REGISTRY: „Obsidian-Callout
 * wickeln", dort jetzt das dritte Exemplar).
 *
 * Zahlen laufen durch `Money`, nicht durch `Number#toFixed`: Python formatiert
 * mit `float(v):.2f` und rundet dabei zur geraden Ziffer, `Money` rundet
 * kaufmännisch. Bei bereits auf Cent gerundeten Aggregaten — dem Normalfall
 * hier — liefern beide dasselbe; wo sie auseinandergehen, ist die kaufmännische
 * Rundung die, die zum Rest des Kerns passt.
 */

import { Money, type MoneyValue } from "../money";

/** Ein Wert, wie ihn die Aggregation liefert. */
export type ChartValue = MoneyValue | number;

/** Etikett und Wert eines Datenpunkts. */
export type ChartPoint = readonly [label: string, value: ChartValue];

const FENCE = "```";

/**
 * Tortendiagramm aus benannten Werten.
 *
 * Nullen und negative Werte fallen raus: Mermaid zeichnet sie nicht, würde sie
 * aber in der Legende führen — ein Segment ohne Fläche, das nach Datenfehler
 * aussieht.
 */
export function renderMermaidPie(
	title: string,
	data: Readonly<Record<string, ChartValue>>,
): string {
	const lines = [`${FENCE}mermaid`, "pie showData", `    title ${title}`];
	for (const [label, value] of Object.entries(data)) {
		const amount = new Money(value);
		if (amount.lessThanOrEqualTo(0)) {
			continue;
		}
		lines.push(`    "${quoteSafe(label)}" : ${amount.toFixed(2)}`);
	}
	lines.push(FENCE);
	return lines.join("\n");
}

/**
 * Balkendiagramm. `yLabel` beschriftet die Wertachse — in der Python-Fassung
 * heißt der Parameter `xlabel`, landet aber ebenfalls auf der y-Achse.
 */
export function renderMermaidBar(
	title: string,
	data: readonly ChartPoint[],
	yLabel = "",
): string {
	if (data.length === 0) {
		return "";
	}
	const labels = data
		.map(([label]) => `"${quoteSafe(label).slice(0, 30)}"`)
		.join(", ");
	return [
		`${FENCE}mermaid`,
		"xychart-beta",
		`    title "${title}"`,
		`    x-axis [${labels}]`,
		yLabel === "" ? "    y-axis" : `    y-axis "${yLabel}"`,
		`    bar [${values(data)}]`,
		FENCE,
	].join("\n");
}

/** Liniendiagramm für Zeitreihen — Etiketten sind hier Perioden, also kurz. */
export function renderMermaidXyLine(
	title: string,
	points: readonly ChartPoint[],
	yLabel = "EUR",
): string {
	if (points.length === 0) {
		return "";
	}
	const labels = points.map(([label]) => `"${label}"`).join(", ");
	return [
		`${FENCE}mermaid`,
		"xychart-beta",
		`    title "${title}"`,
		`    x-axis [${labels}]`,
		`    y-axis "${yLabel}"`,
		`    line [${values(points)}]`,
		FENCE,
	].join("\n");
}

/** Einbettung einer Bases-Ansicht; `viewName` ist der Anker hinter dem `#`. */
export function renderBasesEmbed(basePath: string, viewName?: string): string {
	return viewName === undefined || viewName === ""
		? `![[${basePath}]]`
		: `![[${basePath}#${viewName}]]`;
}

function values(points: readonly ChartPoint[]): string {
	return points.map(([, value]) => new Money(value).toFixed(2)).join(", ");
}

/** Anführungszeichen im Etikett beenden sonst den Mermaid-String vorzeitig. */
function quoteSafe(label: string): string {
	return label.replace(/"/g, "'");
}
