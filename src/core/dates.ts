/**
 * Datums-Bausteine für den Importer-Kern.
 *
 * Bewusst **ohne `Date`**: `new Date(y, m, d)` mit `y < 100` mappt auf 1900+y,
 * und jede `Date`-Konstruktion schleppt eine Zeitzone mit, die beim Formatieren
 * einen Tag verschieben kann. Der Kern rechnet daher durchgängig mit
 * `YYYY-MM-DD`-Strings; sie sortieren lexikografisch korrekt und sind exakt das,
 * was Journal und Frontmatter am Ende brauchen.
 */

/** Ein Datum als `YYYY-MM-DD`. */
export type IsoDate = string;

const DDMMYY = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/;

/**
 * `DD.MM.YY` (oder `DD.MM.YYYY`) → `YYYY-MM-DD`.
 *
 * Zweistellige Jahre sind **immer** `2000 + JJ` — so hält es der Python-Importer,
 * und Bankauszüge vor 2000 gibt es hier nicht.
 */
export function parseGermanDate(raw: string): IsoDate {
	const match = DDMMYY.exec(raw.trim());
	if (!match) {
		throw new Error(
			`Datum erwartet im Format DD.MM.YY, bekam ${JSON.stringify(raw)}`,
		);
	}
	const [, dayRaw, monthRaw, yearRaw] = match;
	const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
	const month = Number(monthRaw);
	const day = Number(dayRaw);
	if (month < 1 || month > 12) {
		throw new Error(`Monat außerhalb 1–12: ${JSON.stringify(raw)}`);
	}
	if (day < 1 || day > daysInMonth(year, month)) {
		throw new Error(`Tag existiert nicht: ${JSON.stringify(raw)}`);
	}
	return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Anzahl Tage im Monat (1-basiert) — Ersatz für Pythons `calendar.monthrange`. */
export function daysInMonth(year: number, month: number): number {
	if (month === 2) {
		return isLeapYear(year) ? 29 : 28;
	}
	return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `YYYY-MM-DD` → `{year, month, day}`. Wirft bei unlesbarem Datum. */
export function splitIsoDate(date: IsoDate): {
	year: number;
	month: number;
	day: number;
} {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) {
		throw new Error(`Kein ISO-Datum: ${JSON.stringify(date)}`);
	}
	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
	};
}

/** `YYYY-MM-DD` → `YYYY-MM` (Perioden-Schlüssel für Monatsberichte). */
export function monthKey(date: IsoDate): string {
	return date.slice(0, 7);
}

/** `YYYY-MM-DD` → `YYYY-Qn`. */
export function quarterKey(date: IsoDate): string {
	const { year, month } = splitIsoDate(date);
	return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** Letzter Tag des Monats als ISO-Datum. */
export function endOfMonth(year: number, month: number): IsoDate {
	return `${pad4(year)}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
}

/** Tage zwischen zwei ISO-Daten (b − a), zeitzonenfrei über Tageszählung. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
	return toDayNumber(b) - toDayNumber(a);
}

/**
 * Tage auf ein Datum addieren; negative Werte zählen zurück.
 *
 * Läuft über die Tagesnummer statt über `Date`: `new Date(y, m, d)` interpretiert
 * ein zweistelliges Jahr als 19xx und rechnet in lokaler Zeitzone, womit eine
 * Addition je nach Sommerzeit-Grenze um einen Tag danebenliegen kann.
 */
export function addDays(date: IsoDate, days: number): IsoDate {
	return fromDayNumber(toDayNumber(date) + days);
}

/** Tagesnummer → ISO-Datum. Umkehrung von `toDayNumber`. */
function fromDayNumber(dayNumber: number): IsoDate {
	const z = dayNumber + 719468;
	const era = Math.floor(z / 146097);
	const doe = z - era * 146097;
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
	);
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const month = mp < 10 ? mp + 3 : mp - 9;
	const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
	return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/** ISO-Datum → fortlaufende Tagesnummer (proleptisch gregorianisch). */
function toDayNumber(date: IsoDate): number {
	const { year, month, day } = splitIsoDate(date);
	// Howard Hinnants "days from civil" — reine Ganzzahl-Arithmetik, kein Date.
	const y = month <= 2 ? year - 1 : year;
	const era = Math.floor(y / 400);
	const yoe = y - era * 400;
	const mp = (month + 9) % 12;
	const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146097 + doe - 719468;
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function pad4(n: number): string {
	return String(n).padStart(4, "0");
}
