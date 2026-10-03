/**
 * Dateinamen für Schnappschüsse — der Zeitstempel steckt im Namen.
 *
 * `gfs-retention` bekommt Paare aus Name und Zeit; woher die Zeit kommt,
 * entscheidet der Aufrufer. Sie aus dem **Namen** zu lesen statt aus der
 * Datei-mtime ist Absicht: eine Kopieraktion, ein Sync oder ein Backup-Restore
 * setzt mtimes neu, und dann rotiert die Aufbewahrung nach dem falschen
 * Zeitpunkt. Der Name überlebt das.
 *
 * Form: `<präfix>-YYYY-MM-DDTHH-MM-SS-mmmZ.json` — UTC, weil der Name sortierbar
 * und ortsunabhängig sein soll. Die Kalendergrenzen rechnet erst
 * `selectGfsRetention` in Ortszeit.
 */

const STAMP = /-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

/** Zeitpunkt → Dateiname. */
export function snapshotFileName(prefix: string, time: number): string {
	// toISOString ist immer UTC und immer dieselbe Breite; `:` und `.` sind in
	// Dateinamen unerwünscht (Windows verbietet `:`), deshalb durchgehend `-`.
	const iso = new Date(time).toISOString(); // 2026-10-03T13:56:02.123Z
	const stamp = iso.replace(/[:.]/g, "-");
	return `${prefix}-${stamp}.json`;
}

/**
 * Dateiname → Zeitpunkt, oder `null`, wenn der Name keinen trägt.
 *
 * `null` heißt für den Aufrufer: nicht in die Aufbewahrung hineingeben. Was
 * `gfs-retention` nicht kennt, löscht es auch nicht — unbekannt heißt erhalten.
 */
export function snapshotTimeFromName(name: string): number | null {
	const m = STAMP.exec(name);
	if (!m) return null;
	const [, y, mo, d, h, mi, s, ms] = m;
	const time = Date.UTC(
		Number(y),
		Number(mo) - 1,
		Number(d),
		Number(h),
		Number(mi),
		Number(s),
		Number(ms),
	);
	return Number.isNaN(time) ? null : time;
}
