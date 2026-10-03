/**
 * Die aktiven Konten, einmal gelesen und gemerkt.
 *
 * Die Quelle wird injiziert (`loadConfig`), damit dieses Modul obsidian-frei
 * bleibt — die Vault-Berührung liegt in `src/obsidian/kontenSource.ts`.
 * Vorher lief der Weg über `list-konten` im Python-Importer; das kostete einen
 * Subprozess, die Store-Bestnote und die Mobile-Fähigkeit.
 */

import { activeKonten, type KontenConfig, type KontoSpec } from '../core/config/konten';

export type { KontoSpec };

export interface KontenLoadDeps {
  /** Liest und prüft `konten.yaml`. Fehler werden unverändert durchgereicht. */
  loadConfig: () => Promise<KontenConfig>;
}

let cached: KontenConfig | null = null;

/**
 * Die geprüfte Konfiguration — auch die stillgelegten Konten.
 *
 * Die Vorschau im Import-Dialog braucht sie vollständig: `detectSchema` ordnet
 * eine Datei über die IBAN-Enden ALLER Konten zu, und ein stillgelegtes Konto
 * erklärt eine alte CSV besser als keines.
 */
export async function loadKontenConfig(deps: KontenLoadDeps): Promise<KontenConfig> {
  if (cached) return cached;
  cached = await deps.loadConfig();
  return cached;
}

/** Nur die aktiven Konten — die Auswahl im Dialog. */
export async function loadKonten(deps: KontenLoadDeps): Promise<KontoSpec[]> {
  return activeKonten(await loadKontenConfig(deps));
}

export function invalidateKonten(): void {
  cached = null;
}
