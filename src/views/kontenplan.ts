import { normalizePath, type App } from 'obsidian';
import { KEIN_KONTENPLAN, parseKontenplan, type Kontenplan } from '../core/accounts/kontoTyp';

/**
 * Liest den Kontenplan (`accounts.ledger`) für die Kontotypen der Ansichten.
 * Fehlt die Datei oder ist sie leer, gilt der Rückfall auf die Wurzel des Kontonamens.
 */
export async function loadKontenplan(app: App, accountsPath: string): Promise<Kontenplan> {
  if (accountsPath === '') return KEIN_KONTENPLAN;
  try {
    return parseKontenplan(await app.vault.adapter.read(normalizePath(accountsPath)));
  } catch {
    return KEIN_KONTENPLAN;
  }
}
