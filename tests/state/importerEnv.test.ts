import { describe, it, expect } from 'vitest';
import { buildImporterEnv } from '../../src/state/financePaths';

/**
 * Regression 2026-08-01: Das Plugin startete den Importer ohne `FINANCE_VAULT`.
 * Der Importer fiel damit auf `~/ObsidianVault/Finanzplan` zurück, fand dort keine
 * CSVs (→ „0 Duplikate", weil die Vergleichsbasis leer war) und schrieb Journal und
 * Notizen in diesen Fallback-Ordner statt in den Vault (→ „nichts aktualisiert").
 * Sichtbar wurde es erst, als der Import nach vier anderen Reparaturen überhaupt lief.
 */
describe('buildImporterEnv', () => {
  it('setzt FINANCE_VAULT auf den absoluten Projektordner', () => {
    const env = buildImporterEnv('/Users/x/Vault', '20_Projekte/Finanzen');
    expect(env.FINANCE_VAULT).toBe('/Users/x/Vault/20_Projekte/Finanzen');
  });

  it('setzt FINANCE_VAULT_PREFIX auf den vault-relativen Pfad (für Wikilinks)', () => {
    const env = buildImporterEnv('/Users/x/Vault', '20_Projekte/Finanzen');
    expect(env.FINANCE_VAULT_PREFIX).toBe('20_Projekte/Finanzen');
  });

  it('verträgt einen Basispfad mit Schrägstrich am Ende', () => {
    const env = buildImporterEnv('/Users/x/Vault/', '20_Projekte/Finanzen');
    expect(env.FINANCE_VAULT).toBe('/Users/x/Vault/20_Projekte/Finanzen');
  });

  it('verträgt Leerzeichen und Umlaute im Pfad', () => {
    const env = buildImporterEnv('/Users/x/Mein Vault', '20_Projekte/26-011 Finanzplan erstellen');
    expect(env.FINANCE_VAULT).toBe('/Users/x/Mein Vault/20_Projekte/26-011 Finanzplan erstellen');
  });

  it('liefert nichts, solange kein Finance-Ordner konfiguriert ist', () => {
    expect(buildImporterEnv('/Users/x/Vault', '')).toEqual({});
  });

  it('liefert nichts ohne Basispfad — lieber der bisherige Zustand als ein falsches Ziel', () => {
    expect(buildImporterEnv('', '20_Projekte/Finanzen')).toEqual({});
  });
});
