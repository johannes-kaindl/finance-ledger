/**
 * PayPal-Verwendungszweck → echter Empfänger.
 *
 * PayPal steht im Kontoauszug als Zahlungsempfänger, der eigentliche Händler
 * nur im Verwendungszweck. Port von `mapping/paypal.py`.
 */

// Der Name geht bis zum Zeilenende: Empfängernamen enthalten Kommas, Punkte
// und Kürzel wie ".amp" ("Cineplex Deutschland GmbH .amp, Co.KG").
const PAYPAL_RECIPIENT = /Ihr Einkauf bei (.+?)\s*$/;

export function parsePaypalRecipient(
	verwendungszweck: string | null | undefined,
): string | null {
	if (!verwendungszweck) {
		return null;
	}
	const match = PAYPAL_RECIPIENT.exec(verwendungszweck);
	return match ? match[1].trim() : null;
}
