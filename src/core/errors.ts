/**
 * Fehlerklassen des Importer-Kerns.
 *
 * Der Python-Importer stirbt bei fehlender oder unvollständiger `konten.yaml`
 * mit einem `KeyError` beim Modul-Import. In einem Plugin darf das keine
 * Ausnahme im Fenster sein, sondern muss eine lesbare Meldung werden — deshalb
 * bekommt jede Fehlerklasse einen Text, der ohne Stacktrace für sich steht.
 */

/** Die Konfiguration (konten.yaml o.ä.) ist fehlerhaft oder unvollständig. */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

/** Die eingelesene Datei hat nicht das erwartete Format. */
export class InputFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InputFormatError";
	}
}

/**
 * Der Marker-Block einer generierten Notiz ist beschädigt.
 *
 * Bewusst ein eigener Fehler statt einer stillen Reparatur: die Marker trennen
 * das, was der Importer überschreiben darf, von dem, was der Nutzer geschrieben
 * hat. Wer bei Asymmetrie rät, riskiert genau den Verlust, den die Marker
 * verhindern sollen.
 */
export class MarkerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MarkerError";
	}
}
