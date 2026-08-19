import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  constants: { X_OK: 1 },
}));

// Default: Importer-Verzeichnis existiert — einzelne Tests setzen das gezielt auf false.
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

import { runImporter, FULL_IMPORT_ARGS } from '../../src/categorizer-rules/spawnImporter';
import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { existsSync } from 'fs';
import { Platform } from 'obsidian';

const spawnMock = spawn as ReturnType<typeof vi.fn>;
const accessMock = access as ReturnType<typeof vi.fn>;
const existsSyncMock = existsSync as ReturnType<typeof vi.fn>;

function makeMockChild(opts: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  spawnError?: Error;
  delayMs?: number;
}) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();

  const delay = opts.delayMs ?? 0;
  setTimeout(() => {
    if (opts.spawnError) {
      proc.emit('error', opts.spawnError);
      return;
    }
    if (opts.stdout) proc.stdout.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) proc.stderr.emit('data', Buffer.from(opts.stderr));
    proc.emit('close', opts.exitCode ?? 0);
  }, delay);

  return proc;
}

describe('runImporter (explicit uvBinaryPath)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('spawns the provided uv binary path with correct cwd', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0, stdout: 'Geladen: 955 Buchungen\n' }));
    await runImporter('/path/to/importer', '/usr/local/bin/uv');
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/uv',
      ['run', 'python', '-m', 'importer.cli'],
      expect.objectContaining({ cwd: '/path/to/importer' }),
    );
  });

  it('resolves ImporterResult on exit code 0', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0, stdout: 'Done\n', stderr: '' }));
    const result = await runImporter('/path/to/importer', '/usr/local/bin/uv');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Done');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('resolves with non-0 exitCode on error (no throw)', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 1, stderr: 'ImportError: module not found' }));
    const result = await runImporter('/path/to/importer', '/usr/local/bin/uv');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ImportError');
  });

  it('calls onProgress for each non-empty stdout line', async () => {
    const lines = 'Geladen: 955 Buchungen\nLedger-Output:\n  journal: /path\n';
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0, stdout: lines }));
    const received: string[] = [];
    await runImporter('/path/to/importer', '/usr/local/bin/uv', 120_000, (line) => received.push(line));
    expect(received).toContain('Geladen: 955 Buchungen');
    expect(received).toContain('Ledger-Output:');
    expect(received).toContain('  journal: /path');
  });

  it('rejects with timeout error and sends SIGTERM after timeoutMs', async () => {
    // Real timers + small timeout — fakeTimers don't compose cleanly with the
    // dynamic import('child_process') microtask added for mobile-load-fix.
    const proc = makeMockChild({ exitCode: 0, delayMs: 999_999 });
    spawnMock.mockReturnValue(proc);

    await expect(
      runImporter('/path/to/importer', '/usr/local/bin/uv', 50),
    ).rejects.toThrow('timeout nach 50ms');
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects on spawn error', async () => {
    spawnMock.mockReturnValue(makeMockChild({ spawnError: new Error('uv not found') }));
    await expect(runImporter('/path/to/importer', '/usr/local/bin/uv')).rejects.toThrow('uv not found');
  });

  it('passes extra args through to spawn (slice-7-c)', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0, stdout: '[]\n' }));
    await runImporter(
      '/path/to/importer',
      '/usr/local/bin/uv',
      120_000,
      () => {},
      ['list-konten', '--aktiv-only'],
    );
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/uv',
      ['run', 'python', '-m', 'importer.cli', 'list-konten', '--aktiv-only'],
      expect.objectContaining({ cwd: '/path/to/importer' }),
    );
  });

  it('default args=[] preserves legacy spawn signature (slice-7-c)', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0, stdout: 'Done\n' }));
    await runImporter('/path/to/importer', '/usr/local/bin/uv');
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/uv',
      ['run', 'python', '-m', 'importer.cli'],
      expect.anything(),
    );
  });
});

describe('runImporter — uv auto-detection (uvBinaryPath = null)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses PATH uv when --version probe succeeds', async () => {
    spawnMock.mockImplementation(() => makeMockChild({ exitCode: 0 }));
    await runImporter('/path/to/importer', null);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      'uv',
      ['run', 'python', '-m', 'importer.cli'],
      expect.objectContaining({ cwd: '/path/to/importer' }),
    );
  });

  it('falls back to /usr/local/bin/uv when PATH probe fails', async () => {
    spawnMock
      .mockImplementationOnce(() => makeMockChild({ spawnError: new Error('ENOENT') }))
      .mockImplementation(() => makeMockChild({ exitCode: 0 }));
    accessMock.mockImplementation((p: string) => {
      if (p === '/usr/local/bin/uv') return Promise.resolve();
      return Promise.reject(new Error('ENOENT'));
    });

    await runImporter('/path/to/importer', null);
    expect(spawnMock).toHaveBeenLastCalledWith(
      '/usr/local/bin/uv',
      ['run', 'python', '-m', 'importer.cli'],
      expect.objectContaining({ cwd: '/path/to/importer' }),
    );
  });

  it('throws descriptive error when all uv paths fail', async () => {
    spawnMock.mockImplementationOnce(() => makeMockChild({ spawnError: new Error('ENOENT') }));
    accessMock.mockRejectedValue(new Error('ENOENT'));

    await expect(runImporter('/path/to/importer', null)).rejects.toThrow(
      'uv binary nicht gefunden',
    );
  });

  it('throws error message that lists checked paths', async () => {
    spawnMock.mockImplementationOnce(() => makeMockChild({ spawnError: new Error('ENOENT') }));
    accessMock.mockRejectedValue(new Error('ENOENT'));

    const err = await runImporter('/path/to/importer', null).catch((e: Error) => e);
    expect(err.message).toContain('/usr/local/bin/uv');
    expect(err.message).toContain('/opt/homebrew/bin/uv');
  });
});

describe('runImporter — importerCwd-Validierung', () => {
  // Regression: ein umgezogenes Importer-Repo hinterließ einen toten `importerCwd`
  // in data.json. Node meldete das als "spawn <uv-pfad> ENOENT" — die Meldung zeigt
  // aufs uv-Binary, obwohl uv völlig in Ordnung ist und das Arbeitsverzeichnis fehlt.
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
  });
  afterEach(() => existsSyncMock.mockReturnValue(true));

  it('wirft mit dem fehlenden Pfad im Text, wenn importerCwd nicht existiert', async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(runImporter('/gone/importer', '/usr/local/bin/uv'))
      .rejects.toThrow('/gone/importer');
  });

  it('nennt die Einstellung, statt uv zu beschuldigen', async () => {
    existsSyncMock.mockReturnValue(false);
    const err = await runImporter('/gone/importer', '/usr/local/bin/uv').catch((e: Error) => e);
    expect(err.message).toContain('Importer repo path');
    expect(err.message).not.toContain('uv');
  });

  it('ruft spawn gar nicht erst auf, wenn das Verzeichnis fehlt', async () => {
    existsSyncMock.mockReturnValue(false);
    await runImporter('/gone/importer', '/usr/local/bin/uv').catch(() => { /* expected */ });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('lässt den Normalfall unberührt, wenn das Verzeichnis existiert', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0, stdout: 'Done\n' }));
    const result = await runImporter('/path/to/importer', '/usr/local/bin/uv');
    expect(result.exitCode).toBe(0);
  });
});

describe('runImporter — Mobile-Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.isMobile = false;
    Platform.isDesktop = true;
  });
  afterEach(() => {
    Platform.isMobile = false;
    Platform.isDesktop = true;
  });

  it('wirft mit klarem Mobile-Hinweis wenn Platform.isMobile = true', async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    await expect(runImporter('/path/to/importer', '/usr/local/bin/uv'))
      .rejects.toThrow(/nur auf Desktop verfügbar/);
  });

  it('ruft spawn nicht auf wenn Mobile-Guard greift', async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    await runImporter('/path/to/importer', '/usr/local/bin/uv').catch(() => { /* expected */ });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('runImporter — Vault-Umgebung durchreichen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
  });

  it('gibt zusätzliche Umgebungsvariablen an den Subprozess weiter', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0 }));
    await runImporter('/path/to/importer', '/usr/local/bin/uv', 120_000, undefined, [], {
      FINANCE_VAULT: '/Users/x/Vault/Finanzen',
    });
    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.FINANCE_VAULT).toBe('/Users/x/Vault/Finanzen');
  });

  it('behält die bestehende Prozess-Umgebung bei (uv braucht PATH & Co.)', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0 }));
    await runImporter('/path/to/importer', '/usr/local/bin/uv', 120_000, undefined, [], {
      FINANCE_VAULT: '/x',
    });
    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.PATH).toBe(process.env.PATH);
  });

  it('funktioniert unverändert, wenn keine Zusatz-Umgebung übergeben wird', async () => {
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 0 }));
    await runImporter('/path/to/importer', '/usr/local/bin/uv');
    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env).toBeDefined();
  });
});

describe('FULL_IMPORT_ARGS', () => {
  // Regression 2026-08-01: Das Plugin rief den Importer nackt auf. Ein nackter Lauf
  // schreibt nur Journal, Kontenplan, Eröffnungsbilanz, Konto-/Vertrags-Notizen und
  // den Report — Monats-/Quartals-/Jahresberichte, Kategorie-, Empfänger-, Tx-Typ-
  // und Mandats-Notizen entstehen NUR mit expliziten Flags. Nach einem Import über
  // das Plugin blieben sie deshalb auf altem Stand.
  it('fordert die Perioden-Berichte an', () => {
    expect(FULL_IMPORT_ARGS).toContain('--all-aggregates');
  });

  it('fordert die Dimensions-Notizen an', () => {
    expect(FULL_IMPORT_ARGS).toContain('--all-kategorie-notes');
    expect(FULL_IMPORT_ARGS).toContain('--all-empfaenger-notes');
    expect(FULL_IMPORT_ARGS).toContain('--all-tx-typ-notes');
    expect(FULL_IMPORT_ARGS).toContain('--all-mandate-notes');
  });

  it('nutzt die schonende Sparziel-Variante, nicht die Legacy-Migration', () => {
    // --all-sparziele lässt Notizen ohne Marker in Ruhe; --all-sparziele-bodies
    // würde sie umschreiben. Das ist eine Migration, kein Import-Schritt.
    expect(FULL_IMPORT_ARGS).toContain('--all-sparziele');
    expect(FULL_IMPORT_ARGS).not.toContain('--all-sparziele-bodies');
  });

  it('enthält nur Flags, keine Positionsargumente', () => {
    expect(FULL_IMPORT_ARGS.every(a => a.startsWith('--'))).toBe(true);
  });
});
