import { describe, it, expect, beforeEach, vi } from 'vitest';

import { loadKonten, invalidateKonten } from '../../src/state/konten';
import type { KontenConfig, KontoSpec } from '../../src/core/config/konten';
import { Platform } from 'obsidian';

function konto(partial: Partial<KontoSpec> & Pick<KontoSpec, 'id' | 'iban'>): KontoSpec {
  return {
    ledgerAccount: 'Aktiva:Bank:Sparkasse:Hauptkonto',
    bank: 'Sparkasse Musterstadt',
    bic: '',
    kontoTyp: 'giro',
    kontoRolle: 'hauptkonto_privat',
    csvSchema: 'sparkasse_camt52',
    inhaber: 'Muster',
    aliases: [],
    sticker: '',
    rolleBeschreibung: '',
    filename: null,
    aktiv: true,
    ...partial,
  };
}

const HAUPTKONTO = konto({ id: 'hauptkonto', iban: 'DE89370400440532013000' });
const VISA = konto({
  id: 'visa_daily',
  iban: '4000 **** **** 0729',
  ledgerAccount: 'Aktiva:Bank:Sparkasse:Visa',
  kontoRolle: 'kreditkarte',
  csvSchema: 'sparkasse_visa',
});
const STILLGELEGT = konto({ id: 'alt', iban: 'DE02120300000000202051', aktiv: false });

const CONFIG: KontenConfig = { konten: [HAUPTKONTO, VISA, STILLGELEGT] };

describe('loadKonten', () => {
  beforeEach(() => {
    invalidateKonten();
  });

  it('liest die Konten über die übergebene Quelle und liefert nur die aktiven', async () => {
    const loadConfig = vi.fn().mockResolvedValue(CONFIG);

    const result = await loadKonten({ loadConfig });

    expect(result).toEqual([HAUPTKONTO, VISA]);
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  it('reicht den Fehler der Quelle unverändert durch', async () => {
    const loadConfig = vi.fn().mockRejectedValue(new Error('konten.yaml ist kein gültiges YAML'));

    await expect(loadKonten({ loadConfig })).rejects.toThrow(/kein gültiges YAML/);
  });

  it('cached das Ergebnis (Quelle wird einmal gelesen)', async () => {
    const loadConfig = vi.fn().mockResolvedValue(CONFIG);

    await loadKonten({ loadConfig });
    await loadKonten({ loadConfig });

    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  it('invalidateKonten() setzt den Cache zurück, die Quelle wird neu gelesen', async () => {
    const loadConfig = vi.fn().mockResolvedValue(CONFIG);

    await loadKonten({ loadConfig });
    invalidateKonten();
    await loadKonten({ loadConfig });

    expect(loadConfig).toHaveBeenCalledTimes(2);
  });

  it('läuft auch auf Mobilgeräten — der Weg braucht keinen Subprozess mehr', async () => {
    const loadConfig = vi.fn().mockResolvedValue(CONFIG);
    Platform.isMobile = true;
    Platform.isDesktop = false;
    try {
      await expect(loadKonten({ loadConfig })).resolves.toEqual([HAUPTKONTO, VISA]);
    } finally {
      Platform.isMobile = false;
      Platform.isDesktop = true;
    }
  });
});
