// Schnitt: settings-assistant-Spec, design-settings-manager 2026-10-03
/**
 * Schnappschuss-Aufbewahrung nach Großvater-Vater-Sohn (GFS).
 *
 * Statt „die letzten N" bleiben vier Staffeln erhalten: die neuesten des
 * heutigen Tages, dazu je Tag, Woche und Monat der **älteste** Eintrag des
 * jeweiligen Zeitfensters. Ein Schnappschuss ist der Stand VOR einem
 * Schreibvorgang — der älteste eines Fensters ist deshalb der Stand vor dem
 * Beginn dieses Tages, dieser Woche, dieses Monats.
 *
 * Reine Auswahl über Zeitstempel: kein Dateisystem, kein Obsidian, kein Node.
 * Welche Dateien es gibt und wie ihr Name einen Zeitpunkt trägt, entscheidet
 * der Aufrufer — er übergibt Paare aus Name und Zeit und bekommt zurück,
 * welche Namen bleiben und welche fallen.
 *
 * Kalendergrenzen werden in der Ortszeit der Laufzeit gerechnet: ein
 * Schnappschuss „von gestern" ist der, den der Nutzer gestern gesehen hat.
 */

export interface GfsPolicy {
	/** Die neuesten N vom heutigen Kalendertag. */
	today: number;
	/** Die letzten N Kalendertage einschließlich heute, je der älteste. */
	days: number;
	/** Die letzten N ISO-Wochen einschließlich der laufenden, je der älteste. */
	weeks: number;
	/** Die letzten N Kalendermonate einschließlich des laufenden, je der älteste. */
	months: number;
}

/**
 * Startwerte, keine Messung (Entscheidung Johannes 2026-10-03).
 *
 * In Summe bleiben damit höchstens 23 Schnappschüsse übrig — die Staffeln
 * überlappen, in der Praxis sind es weniger.
 */
export const DEFAULT_GFS: GfsPolicy = { today: 6, days: 7, weeks: 4, months: 6 };

export interface GfsEntry {
	name: string;
	/** Zeitpunkt in Millisekunden seit Epoch. Den Namen parst der Aufrufer. */
	time: number;
}

export interface GfsSelection {
	/** Bleibt erhalten, nach Zeit aufsteigend. */
	keep: string[];
	/** Darf gelöscht werden, nach Zeit aufsteigend. */
	remove: string[];
}

/**
 * Das Fenster, dem ein erhaltener Schnappschuss seinen Platz verdankt.
 *
 * `future` ist kein Zeitfenster, sondern der Uhrversatz-Fall: ein Eintrag, der
 * nach `now` liegt, bleibt ohne Staffel.
 */
export type GfsBucket = "today" | "day" | "week" | "month" | "future";

export interface GfsKeptEntry {
	name: string;
	/**
	 * Das Fenster für die Anzeige — nach der Rangfolge
	 * `today > day > week > month`, damit eine gruppierte Liste jeden
	 * Schnappschuss **einmal** zeigt.
	 */
	bucket: GfsBucket;
	/**
	 * Alle Fenster, denen der Eintrag genügt.
	 *
	 * Die Fenster überlappen: der älteste Schnappschuss eines Monats ist in der
	 * Regel auch der älteste seiner Woche, und am Monatsersten zusätzlich der
	 * seines Tages. Wer nur `bucket` liest, bekommt eine Gruppierung; wer wissen
	 * will, warum ein Eintrag nicht wegrotiert, braucht diese Liste.
	 */
	buckets: GfsBucket[];
}

export interface GfsDetailedSelection {
	keep: GfsKeptEntry[];
	remove: string[];
}

/** Rangfolge für `bucket` — die kürzeste Staffel gewinnt die Anzeige. */
const BUCKET_RANG: readonly GfsBucket[] = ["today", "day", "week", "month", "future"];

/** Kalendertag in Ortszeit, als sortierbarer Schlüssel. */
function dayKey(time: number): string {
	const d = new Date(time);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Kalendermonat in Ortszeit. */
function monthKey(time: number): string {
	const d = new Date(time);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/**
 * ISO-Woche (Montag–Sonntag) in Ortszeit, als `GGGG-Www`.
 *
 * Das ISO-Jahr ist nicht das Kalenderjahr: der 1. Januar kann zur letzten
 * Woche des Vorjahres gehören und der 31. Dezember zur ersten des Folgejahres.
 * Deshalb wird über den Donnerstag derselben Woche gerechnet — er liegt immer
 * im ISO-Jahr der Woche.
 */
function isoWeekKey(time: number): string {
	const d = new Date(time);
	d.setHours(0, 0, 0, 0);
	// Montag = 0 … Sonntag = 6
	const weekday = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - weekday + 3); // Donnerstag dieser Woche
	const isoYear = d.getFullYear();
	const firstThursday = new Date(isoYear, 0, 4);
	firstThursday.setHours(0, 0, 0, 0);
	const firstWeekday = (firstThursday.getDay() + 6) % 7;
	firstThursday.setDate(firstThursday.getDate() - firstWeekday + 3);
	// Tage zwischen den beiden Donnerstagen; über die Mittagszeit gerechnet,
	// damit ein Sommerzeit-Sprung die Division nicht um einen Tag verschiebt.
	const week =
		1 +
		Math.round(
			(midday(d).getTime() - midday(firstThursday).getTime()) /
				(7 * 24 * 60 * 60 * 1000),
		);
	return `${isoYear}-W${pad(week)}`;
}

function midday(d: Date): Date {
	const copy = new Date(d.getTime());
	copy.setHours(12, 0, 0, 0);
	return copy;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** Die letzten `count` Kalendertage einschließlich des Tages von `now`. */
function recentDayKeys(now: number, count: number): Set<string> {
	const keys = new Set<string>();
	const cursor = new Date(now);
	cursor.setHours(12, 0, 0, 0); // Mittag: ein DST-Sprung kippt den Tag nicht
	for (let i = 0; i < count; i++) {
		keys.add(dayKey(cursor.getTime()));
		cursor.setDate(cursor.getDate() - 1);
	}
	return keys;
}

/** Die letzten `count` ISO-Wochen einschließlich der laufenden. */
function recentWeekKeys(now: number, count: number): Set<string> {
	const keys = new Set<string>();
	const cursor = new Date(now);
	cursor.setHours(12, 0, 0, 0);
	for (let i = 0; i < count; i++) {
		keys.add(isoWeekKey(cursor.getTime()));
		cursor.setDate(cursor.getDate() - 7);
	}
	return keys;
}

/** Die letzten `count` Kalendermonate einschließlich des laufenden. */
function recentMonthKeys(now: number, count: number): Set<string> {
	const keys = new Set<string>();
	const base = new Date(now);
	for (let i = 0; i < count; i++) {
		// Tag 1 um 12:00: der Monatssprung trifft keinen 31. in einem 30-Tage-Monat
		const cursor = new Date(base.getFullYear(), base.getMonth() - i, 1, 12);
		keys.add(monthKey(cursor.getTime()));
	}
	return keys;
}

/** Der älteste Eintrag je Fenster-Schlüssel, sofern das Fenster gewünscht ist. */
function oldestPerWindow(
	sorted: readonly GfsEntry[],
	keyOf: (time: number) => string,
	wanted: Set<string>,
	bucket: GfsBucket,
	merke: (name: string, bucket: GfsBucket) => void,
): void {
	const seen = new Set<string>();
	for (const entry of sorted) {
		const key = keyOf(entry.time);
		if (!wanted.has(key) || seen.has(key)) continue;
		seen.add(key);
		merke(entry.name, bucket);
	}
}

/**
 * Teilt die Schnappschüsse in „bleibt" und „darf weg".
 *
 * Unbekannt heißt erhalten: Namen, deren Zeitpunkt der Aufrufer nicht lesen
 * kann, gibt er gar nicht erst hinein — was nicht in `entries` steht, wird
 * auch nicht gelöscht. Ein Eintrag, der in der Zukunft liegt (Uhrversatz,
 * manuell gesetzte Zeit), bleibt immer: er ist eher der neueste Stand als
 * Abfall.
 */
export function selectGfsRetention(
	entries: readonly GfsEntry[],
	now: number,
	policy: GfsPolicy = DEFAULT_GFS,
): GfsSelection {
	const detailed = selectGfsRetentionDetailed(entries, now, policy);
	return {
		keep: detailed.keep.map((e) => e.name),
		remove: detailed.remove,
	};
}

/**
 * Wie {@link selectGfsRetention}, nennt aber je erhaltenen Schnappschuss das
 * Fenster, dem er seinen Platz verdankt.
 *
 * Gedacht für eine gruppierte Anzeige (Heute / Tage / Wochen / Monate): ohne
 * diese Auskunft baut jede Oberfläche ihre eigene Vorstellung davon, was „diese
 * Woche" heißt — und dann zeigt die Liste etwas anderes an, als die
 * Aufbewahrung tut.
 */
export function selectGfsRetentionDetailed(
	entries: readonly GfsEntry[],
	now: number,
	policy: GfsPolicy = DEFAULT_GFS,
): GfsDetailedSelection {
	// Stabil nach Zeit, bei Gleichstand nach Namen — sonst entscheidet die
	// Eingabereihenfolge darüber, welcher von zwei gleichzeitigen bleibt.
	const sorted = [...entries].sort(
		(a, b) => a.time - b.time || a.name.localeCompare(b.name),
	);
	const treffer = new Map<string, Set<GfsBucket>>();
	const merke = (name: string, bucket: GfsBucket): void => {
		const vorhanden = treffer.get(name);
		if (vorhanden) vorhanden.add(bucket);
		else treffer.set(name, new Set([bucket]));
	};

	for (const entry of sorted) {
		if (entry.time > now) merke(entry.name, "future");
	}

	// Staffel 1: die neuesten N von heute.
	// `slice(-0)` ist `slice(0)` und damit "alle" statt "keine" — eine Policy mit
	// `today: 0` hätte darüber den ganzen Tag behalten. Deshalb der Guard, nicht
	// `Math.max`.
	if (policy.today > 0) {
		const heute = dayKey(now);
		const vonHeute = sorted.filter((e) => dayKey(e.time) === heute);
		for (const entry of vonHeute.slice(-policy.today)) {
			merke(entry.name, "today");
		}
	}

	// Staffeln 2–4: je Fenster der älteste.
	oldestPerWindow(sorted, dayKey, recentDayKeys(now, policy.days), "day", merke);
	oldestPerWindow(sorted, isoWeekKey, recentWeekKeys(now, policy.weeks), "week", merke);
	oldestPerWindow(sorted, monthKey, recentMonthKeys(now, policy.months), "month", merke);

	const keep: GfsKeptEntry[] = [];
	const remove: string[] = [];
	for (const entry of sorted) {
		const buckets = treffer.get(entry.name);
		if (!buckets || buckets.size === 0) {
			remove.push(entry.name);
			continue;
		}
		const geordnet = BUCKET_RANG.filter((b) => buckets.has(b));
		keep.push({ name: entry.name, bucket: geordnet[0], buckets: geordnet });
	}
	return { keep, remove };
}
