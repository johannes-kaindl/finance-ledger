/**
 * Eine bestehende Notiz mit Marker-Block nachziehen: die Felder, die der Import besitzt, in der Frontmatter
 * setzen, den Auto-Block ersetzen, Kopf und Benutzerteil stehen lassen.
 *
 * Gemeinsamer Weg der Berichte (E5) und der Dimensions-Notizen (E6). Python schrieb dabei die ganze Frontmatter neu
 * und setzte `created` bei jedem Lauf auf heute; hier bleibt alles, was der Import nicht besitzt.
 */

import { parseFrontmatter } from "../../vendor/kit/frontmatter";
import { patchFrontmatter } from "./frontmatter";
import { replaceAutoSection } from "./markers";

export interface AutoNoteUpdate {
	/** Skalare Felder, die der Import besitzt (einschließlich `updated`). */
	set: Record<string, string>;
	/** Der neue Auto-Block. */
	auto: string;
	/** Benutzerteil, falls die Notiz noch keinen hat. */
	userDefault: string;
}

export function updateAutoNote(existing: string, update: AutoNoteUpdate): string {
	const patched = patchFrontmatter(existing, { set: update.set });
	// Der Zeilenumbruch hinter dem schließenden Zaun gehört zum Rumpf: `assembleBody` setzt ihn selbst, und
	// bliebe er im Kopf stehen, wüchse bei jedem Lauf eine Leerzeile nach.
	let cut = patched.length - parseFrontmatter(patched).body.length;
	if (cut > 0 && patched[cut - 1] === "\n") cut -= 1;
	if (cut > 0 && patched[cut - 1] === "\r") cut -= 1;
	return patched.slice(0, cut) + replaceAutoSection(patched.slice(cut), update.auto, update.userDefault);
}
