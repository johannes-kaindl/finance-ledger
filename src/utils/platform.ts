/**
 * ⓘ Stand 2026-10-03 **ohne Aufrufer**: die Plattform-Guards des CSV-Imports und
 * des Re-Imports sind entfallen, weil beide Wege node-frei im Plugin laufen. Das
 * Modul bleibt, weil es die richtige Stelle für eine künftige, echte
 * Plattform-Unterscheidung ist — nicht, weil es gebraucht wird. Wer hier etwas
 * anschließt, prüft zuerst, ob die Unterscheidung einen Grund hat.
 */
import { Platform } from 'obsidian';

export function isMobile(): boolean {
  return Platform.isMobile;
}

export function isDesktop(): boolean {
  return Platform.isDesktop;
}
