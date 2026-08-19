import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/state/konten', () => ({
  loadKonten: vi.fn(),
}));

// Nur runImporter ersetzen, den Rest des Moduls echt lassen — sonst ist jede neu
// hinzukommende Export-Konstante im Test still `undefined` (genau so brach
// FULL_IMPORT_ARGS: `[...undefined]` wirft, und der Aufruf fand nie statt).
vi.mock('../../src/categorizer-rules/spawnImporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/categorizer-rules/spawnImporter')>()),
  runImporter: vi.fn(),
}));

// Die Vorschau braucht einen echten Pfad für den Python-Importer und legt dafür eine
// Temp-Kopie an — `File.path` gibt es seit Electron 32 nicht mehr (s.u.).
vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn(async (prefix: string) => `${prefix}XXXX`),
  writeFile: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
}));

vi.mock('os', () => ({ default: { tmpdir: () => '/tmp' } }));

import { ImportCSVModal, autoDetectKonto, type CheckCsvResult } from '../../src/ui/importCSVModal';
import type { KontoSpec } from '../../src/state/konten';
import { loadKonten } from '../../src/state/konten';
import { runImporter } from '../../src/categorizer-rules/spawnImporter';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { Notice } from 'obsidian';

const loadKontenMock = loadKonten as ReturnType<typeof vi.fn>;
const runImporterMock = runImporter as ReturnType<typeof vi.fn>;
const mkdtempMock = mkdtemp as ReturnType<typeof vi.fn>;
const writeFileMock = writeFile as ReturnType<typeof vi.fn>;
const rmMock = rm as ReturnType<typeof vi.fn>;
const NoticeMock = Notice as unknown as ReturnType<typeof vi.fn>;

const KONTEN: KontoSpec[] = [
  {
    id: 'hauptkonto',
    iban: 'DE89370400440532013000',
    ledger_account: 'Aktiva:Bank:Sparkasse:Hauptkonto',
    bank: 'Sparkasse Musterstadt',
    konto_rolle: 'hauptkonto_privat',
    csv_schema: 'sparkasse_camt52',
    aliases: ['Hauptkonto'],
    aktiv: true,
  },
  {
    id: 'vermietung',
    iban: 'DE02120300000000202051',
    ledger_account: 'Aktiva:Bank:Sparkasse:Vermietung',
    bank: 'Sparkasse Musterstadt',
    konto_rolle: 'vermietung',
    csv_schema: 'sparkasse_camt52',
    aliases: ['Vermietung'],
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

/**
 * Bewusst OHNE `path`-Property: Electron hat `File.path` in Version 32 entfernt, Obsidian
 * 1.12.4 läuft auf Electron 39. Die alten Tests hefteten den Pfad künstlich ans File und
 * hielten damit eine Annahme grün, die in der echten App seit Langem falsch war.
 */
function makeFile(name: string, content = 'Datum;Betrag\n'): File {
  return new File([content], name);
}

function makeFakeApp() {
  return {
    vault: {
      adapter: {
        // basePath: nur für die Importer-Umgebung (FINANCE_VAULT), NICHT zum Schreiben —
        // geschrieben wird vault-relativ über writeBinary.
        basePath: '/Users/x/ExampleVault',
        exists: vi.fn().mockResolvedValue(true),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeBinary: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

function makeFakeAccessor() {
  const data = {
    lastReimportTimestamp: null as string | null,
    rulesAddedSinceReimport: 0,
    importerCwd: '/path/to/importer',
    importerTimeoutMs: 120_000,
    uvBinaryPath: '/usr/local/bin/uv',
  };
  return {
    loadData: vi.fn().mockResolvedValue(data),
    saveData: vi.fn().mockResolvedValue(undefined),
    _data: data,
  };
}

function makeModal(opts?: { onImportSuccess?: () => Promise<void> }) {
  const app = makeFakeApp();
  const accessor = makeFakeAccessor();
  const paths = {
    isConfigured: true, root: 'R',
    journal: 'R/Ledger/journal.ledger', openingBalances: 'R/Ledger/opening_balances.ledger', accounts: 'R/Ledger/accounts.ledger',
    rulesFolder: 'R/55-Categorizer-Rules', basesFolder: 'R/05-Bases', kategorienFolder: 'R/45-Kategorien', empfaengerFolder: 'R/60-Empfänger',
    umsatzDir: '20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze',
  };
  const modal = new ImportCSVModal(
    app as unknown as Parameters<typeof ImportCSVModal>[0],
    accessor,
    () => paths,
    { onImportSuccess: opts?.onImportSuccess },
  );
  // Modal-mock initialises contentEl in ctor; ensure app is wired
  (modal as unknown as { app: unknown }).app = app;
  return { modal, app, accessor };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadKontenMock.mockResolvedValue(KONTEN);
  mkdtempMock.mockImplementation(async (prefix: string) => `${prefix}XXXX`);
});

describe('autoDetectKonto', () => {
  it('matches IBAN-suffix in filename', () => {
    expect(autoDetectKonto('20260506-0532013000-umsatz-camt52v8.CSV', KONTEN)?.id).toBe('hauptkonto');
  });

  it('matches even when filename has spaces stripped', () => {
    // Visa filename uses underscores in masked positions, suffix "0729" alone is too short
    // → strict 10-char suffix won't match Visa here; this validates we don't false-positive
    expect(autoDetectKonto('umsatz-4111________1111-2026.CSV', KONTEN)?.id).toBeUndefined();
  });

  it('returns null when no IBAN-suffix in filename', () => {
    expect(autoDetectKonto('random-name.CSV', KONTEN)).toBeNull();
  });

  it('matches Vermietung via 0000202051 suffix', () => {
    expect(autoDetectKonto('20260506-0000202051-umsatz-camt52v8.CSV', KONTEN)?.id).toBe('vermietung');
  });
});

describe('ImportCSVModal — onOpen', () => {
  it('calls loadKonten with importerCwd + uvBinaryPath from accessor', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    expect(loadKontenMock).toHaveBeenCalledWith({
      importerCwd: '/path/to/importer',
      uvBinaryPath: '/usr/local/bin/uv',
    });
  });

  it('renders error when loadKonten throws', async () => {
    loadKontenMock.mockRejectedValueOnce(new Error('list-konten failed: yaml not found'));
    const { modal } = makeModal();
    await modal.onOpen();
    const texts = collectTexts((modal as unknown as { contentEl: { children: unknown[] } }).contentEl);
    expect(texts.some(t => t.includes('Could not load accounts'))).toBe(true);
    expect(texts.some(t => t.includes('list-konten failed'))).toBe(true);
  });

  it('adds finance-import-csv-modal class to contentEl', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const cls = (modal as unknown as { contentEl: { cls: string } }).contentEl.cls;
    expect(cls).toContain('finance-import-csv-modal');
  });
});

describe('ImportCSVModal — auto-detect on file selection', () => {
  it('auto-maps file to konto via IBAN suffix when handleFileSelection is invoked', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV');
    invokeFileSelection(modal, [file]);
    const map = (modal as unknown as { kontoZuordnung: Map<File, KontoSpec> }).kontoZuordnung;
    expect(map.get(file)?.id).toBe('hauptkonto');
  });

  it('does not auto-map when no IBAN-suffix matches', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const file = makeFile('random-name.CSV');
    invokeFileSelection(modal, [file]);
    const map = (modal as unknown as { kontoZuordnung: Map<File, KontoSpec> }).kontoZuordnung;
    expect(map.has(file)).toBe(false);
  });
});

describe('ImportCSVModal — runPreview', () => {
  it('calls runImporter with check-csv per file when triggered', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV');
    invokeFileSelection(modal, [file]);

    const previewResult: CheckCsvResult = {
      new: 100,
      duplicate: 0,
      first_date: '2025-08-01',
      last_date: '2026-05-10',
      konto_match: 'DE89370400440532013000',
      warnings: [],
    };
    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(previewResult),
      stderr: '',
      durationMs: 200,
    });

    await (modal as unknown as { runPreview: () => Promise<void> }).runPreview();

    // Der Importer bekommt den Pfad der Temp-Kopie — NICHT `file.path` (das gibt es nicht mehr).
    const args = runImporterMock.mock.calls[0][4] as string[];
    expect(args[0]).toBe('check-csv');
    expect(args[1]).toBe('--file');
    expect(args[2]).toContain('20260506-0532013000-umsatz-camt52v8.CSV');
    expect(args[2]).toMatch(/^\/tmp\//);
    expect(args.slice(3)).toEqual(['--konto', 'DE89370400440532013000']);

    // Inhalt der ausgewählten Datei landet in der Temp-Kopie …
    expect(writeFileMock).toHaveBeenCalledOnce();
    // … und die Temp-Kopie wird wieder aufgeräumt.
    expect(rmMock).toHaveBeenCalledOnce();

    const previews = (modal as unknown as { previewData: Map<File, CheckCsvResult> }).previewData;
    expect(previews.get(file)).toEqual(previewResult);
  });

  it('räumt die Temp-Kopie auch auf, wenn der Importer fehlschlägt', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('20260506-0532013000-umsatz-camt52v8.CSV')]);
    runImporterMock.mockRejectedValue(new Error('boom'));

    await (modal as unknown as { runPreview: () => Promise<void> }).runPreview().catch(() => { /* egal */ });

    expect(rmMock).toHaveBeenCalledOnce();
  });

  it('does not call runImporter when no konto is mapped', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const file = makeFile('random.CSV');
    invokeFileSelection(modal, [file]);
    runImporterMock.mockClear();

    await (modal as unknown as { runPreview: () => Promise<void> }).runPreview();

    expect(runImporterMock).not.toHaveBeenCalled();
  });
});

describe('ImportCSVModal — runImport', () => {
  it('schreibt CSVs über die Vault-API nach Umsätze + runs importer + saves timestamp', async () => {
    const { modal, app, accessor } = makeModal();
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV', 'Datum;Betrag\n2026-08-01;1,23\n');
    invokeFileSelection(modal, [file]);

    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: 'Importer Done\n',
      stderr: '',
      durationMs: 1500,
    });

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    // Vault-relativer Pfad über den Adapter — kein Dateisystem, kein basePath, kein file.path.
    expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
      '20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze/20260506-0532013000-umsatz-camt52v8.CSV',
      expect.any(ArrayBuffer),
    );
    // Der Importer MUSS FINANCE_VAULT mitbekommen — sonst schreibt er in seinen
    // eigenen Fallback-Ordner statt in den Vault, und zwar mit Exit-Code 0.
    expect(runImporterMock).toHaveBeenCalledWith(
      '/path/to/importer',
      '/usr/local/bin/uv',
      120_000,
      undefined,
      // Voller Lauf — ohne diese Flags entstehen die Berichts- und Dimensions-Notizen nicht.
      expect.arrayContaining(['--all-aggregates', '--all-empfaenger-notes']),
      expect.objectContaining({
        FINANCE_VAULT: '/Users/x/ExampleVault/R',
        FINANCE_VAULT_PREFIX: 'R',
      }),
    );
    expect(accessor.saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        lastReimportTimestamp: expect.any(String),
        rulesAddedSinceReimport: 0,
      }),
    );
  });

  it('creates Umsätze dir when missing', async () => {
    const { modal, app } = makeModal();
    app.vault.adapter.exists.mockResolvedValue(false);
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV');
    invokeFileSelection(modal, [file]);

    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: 'Done\n',
      stderr: '',
      durationMs: 1000,
    });

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    expect(app.vault.adapter.mkdir).toHaveBeenCalledWith(
      '20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze',
    );
  });

  it('triggers onImportSuccess callback after successful import', async () => {
    const onImportSuccess = vi.fn().mockResolvedValue(undefined);
    const { modal } = makeModal({ onImportSuccess });
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV');
    invokeFileSelection(modal, [file]);

    runImporterMock.mockResolvedValue({
      exitCode: 0,
      stdout: 'Done\n',
      stderr: '',
      durationMs: 1000,
    });

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();
    expect(onImportSuccess).toHaveBeenCalledOnce();
  });

  it('shows Notice with stderr when importer exits non-zero', async () => {
    const { modal, accessor } = makeModal();
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV');
    invokeFileSelection(modal, [file]);

    runImporterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'ParserError: invalid header',
      durationMs: 500,
    });

    NoticeMock.mockClear();
    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    expect(NoticeMock).toHaveBeenCalled();
    const lastCall = NoticeMock.mock.calls[NoticeMock.mock.calls.length - 1];
    expect(String(lastCall[0])).toContain('ParserError');
    expect(accessor.saveData).not.toHaveBeenCalled();
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

type FakeEl = { tag: string; text?: string; cls?: string; children: FakeEl[] };

function collectTexts(root: { children: unknown[] }): string[] {
  const out: string[] = [];
  function walk(el: unknown): void {
    const e = el as FakeEl;
    if (typeof e.text === 'string' && e.text) out.push(e.text);
    if (Array.isArray(e.children)) for (const c of e.children) walk(c);
  }
  walk(root);
  return out;
}

function invokeFileSelection(modal: ImportCSVModal, files: File[]): void {
  const fakeInput = {
    files: files as unknown as FileList,
  } as HTMLInputElement;
  (modal as unknown as { handleFileSelection: (i: HTMLInputElement) => void })
    .handleFileSelection(fakeInput);
}

describe('autoDetectKonto — reale Sparkasse-Namensformen (2026-08-01)', () => {
  // Deutsche IBANs füllen die Kontonummer links mit Nullen auf, die Dateinamen der
  // Sparkasse tragen sie ohne. Die alte Regel verglich die letzten 10 IBAN-ZEICHEN
  // mit dem Dateinamen und traf deshalb KEINE einzige reale Datei.
  const REAL: KontoSpec[] = [
    { ...KONTEN[0], id: 'hauptkonto', iban: 'DE89370400440473829165' },
    { ...KONTEN[0], id: 'vermietung', iban: 'DE89370400440000481907' },
    { ...KONTEN[2], id: 'visa_daily', iban: '4000 **** **** 0729' },
  ];

  it('trifft trotz führender Null in der IBAN-Kontonummer', () => {
    expect(autoDetectKonto('20260801-473829165-umsatz-camt52v8.CSV', REAL)?.id).toBe('hauptkonto');
  });

  it('trifft auch bei vier führenden Nullen', () => {
    expect(autoDetectKonto('20260801-481907-umsatz-camt52v8.CSV', REAL)?.id).toBe('vermietung');
  });

  it('trifft maskierte Kartennummern über sichtbare Ziffernblöcke (Unterstriche ≠ Sternchen)', () => {
    expect(autoDetectKonto('umsatz-4000________0729-20260801.CSV', REAL)?.id).toBe('visa_daily');
  });

  it('hält die alte Trefferform weiter (voll ausgeschriebene Kontonummer)', () => {
    expect(autoDetectKonto('20260801-0473829165-umsatz-camt52v8.CSV', REAL)?.id).toBe('hauptkonto');
  });

  // ── Gegenproben ──────────────────────────────────────────────────────

  it('hält ein Datum nicht für eine Kontonummer', () => {
    const nurDatum: KontoSpec[] = [{ ...KONTEN[0], id: 'x', iban: 'DE89370400442026080100' }];
    expect(autoDetectKonto('20260801-999999999-umsatz-camt52v8.CSV', nurDatum)).toBeNull();
  });

  it('wählt bei Mehrdeutigkeit lieber nichts aus als das Falsche', () => {
    const doppelt: KontoSpec[] = [
      { ...KONTEN[0], id: 'a', iban: 'DE89370400440000123456' },
      { ...KONTEN[0], id: 'b', iban: 'DE89370400440000123456' },
    ];
    expect(autoDetectKonto('20260801-123456-umsatz-camt52v8.CSV', doppelt)).toBeNull();
  });

  it('bevorzugt bei Teil-Überlappung den längeren Treffer', () => {
    const konten: KontoSpec[] = [
      { ...KONTEN[0], id: 'kurz', iban: 'DE89370400440000829165' },
      { ...KONTEN[0], id: 'lang', iban: 'DE89370400440473829165' },
    ];
    expect(autoDetectKonto('20260801-473829165-umsatz-camt52v8.CSV', konten)?.id).toBe('lang');
  });

  it('ignoriert zu kurze Ziffernfolgen (< 4 Stellen)', () => {
    // Kontonummer 0000000729 → nach dem Strippen nur noch "729" (3 Stellen).
    const kurz: KontoSpec[] = [{ ...KONTEN[0], id: 'kurz', iban: 'DE89370400440000000729' }];
    expect(autoDetectKonto('20260801-729-umsatz-camt52v8.CSV', kurz)).toBeNull();
  });

  it('liefert null, wenn gar nichts passt', () => {
    expect(autoDetectKonto('irgendwas.CSV', REAL)).toBeNull();
  });
});

describe('ImportCSVModal — Importieren ist nie durch fehlende Zuordnung blockiert', () => {
  it('gibt den Import-Knopf frei, auch wenn keine Datei zugeordnet ist', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('voellig-unbekannt.CSV')]);
    const btn = (modal as unknown as { importBtn: { disabled: boolean } }).importBtn;
    expect(btn.disabled).toBe(false);
  });
});
