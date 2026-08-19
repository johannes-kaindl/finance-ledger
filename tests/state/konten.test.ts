import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/categorizer-rules/spawnImporter', () => ({
  runImporter: vi.fn(),
}));

import { loadKonten, invalidateKonten, type KontoSpec } from '../../src/state/konten';
import { runImporter } from '../../src/categorizer-rules/spawnImporter';
import { Platform } from 'obsidian';

const runImporterMock = runImporter as ReturnType<typeof vi.fn>;

const SAMPLE_KONTEN: KontoSpec[] = [
  {
    id: 'hauptkonto',
    iban: 'DE89370400440532013000',
    ledger_account: 'Aktiva:Bank:Sparkasse:Hauptkonto',
    bank: 'Sparkasse Musterstadt',
    konto_rolle: 'hauptkonto_privat',
    csv_schema: 'sparkasse_camt52',
    aliases: ['Hauptkonto', '0532013000'],
    aktiv: true,
  },
  {
    id: 'visa_daily',
    iban: '4000 **** **** 0729',
    ledger_account: 'Aktiva:Bank:Sparkasse:Visa',
    bank: 'Sparkasse Musterstadt',
    konto_rolle: 'kreditkarte',
    csv_schema: 'sparkasse_visa',
    aliases: ['Visa Daily'],
    aktiv: true,
  },
];

const DEPS = {
  importerCwd: '/path/to/importer',
  uvBinaryPath: '/usr/local/bin/uv',
};

describe('loadKonten', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateKonten();
  });

  it('calls runImporter with list-konten --aktiv-only and returns parsed JSON', async () => {
    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(SAMPLE_KONTEN),
      stderr: '',
      durationMs: 200,
    });

    const result = await loadKonten(DEPS);

    expect(result).toEqual(SAMPLE_KONTEN);
    expect(runImporterMock).toHaveBeenCalledWith(
      '/path/to/importer',
      '/usr/local/bin/uv',
      5_000,
      undefined,
      ['list-konten', '--aktiv-only'],
    );
  });

  it('throws descriptive error on non-zero exit', async () => {
    runImporterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'ImportError: yaml not found\n',
      durationMs: 50,
    });

    await expect(loadKonten(DEPS)).rejects.toThrow(/list-konten failed.*ImportError/);
  });

  it('caches result on second call (subprocess invoked once)', async () => {
    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(SAMPLE_KONTEN),
      stderr: '',
      durationMs: 200,
    });

    await loadKonten(DEPS);
    await loadKonten(DEPS);

    expect(runImporterMock).toHaveBeenCalledTimes(1);
  });

  it('invalidateKonten() resets cache so next call re-fetches', async () => {
    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(SAMPLE_KONTEN),
      stderr: '',
      durationMs: 200,
    });

    await loadKonten(DEPS);
    invalidateKonten();
    await loadKonten(DEPS);

    expect(runImporterMock).toHaveBeenCalledTimes(2);
  });

  it('wirft Mobile-Guard-Error wenn Platform.isMobile = true', async () => {
    invalidateKonten();
    Platform.isMobile = true;
    Platform.isDesktop = false;
    try {
      await expect(loadKonten(DEPS)).rejects.toThrow(/nur auf Desktop verfügbar/);
      expect(runImporterMock).not.toHaveBeenCalled();
    } finally {
      Platform.isMobile = false;
      Platform.isDesktop = true;
    }
  });
});
