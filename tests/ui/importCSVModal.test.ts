import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/state/konten', () => ({
  loadKonten: vi.fn(),
  loadKontenConfig: vi.fn(),
}));

// Die Konten-Quelle: früher ein `list-konten`-Subprozess, jetzt `konten.yaml`
// über die Vault-API. Gemockt wird die Quelle, nicht der Leseweg — der hat
// seine eigenen Tests (tests/state/konten.test.ts).
vi.mock('../../src/obsidian/kontenSource', () => ({
  kontenSourceFor: vi.fn(() => vi.fn()),
}));

// Vorschau und Importlauf sind beide node-frei und einzeln getestet
// (tests/core/import/preview.test.ts, tests/obsidian/nativeImport.test.ts).
// Hier wird geprüft, dass das Modal sie richtig AUFRUFT.
vi.mock('../../src/core/import/preview', () => ({
  previewCsv: vi.fn(),
}));

vi.mock('../../src/obsidian/nativeImport', () => ({
  runNativeImport: vi.fn(),
}));

import { ImportCSVModal, autoDetectKonto, type CheckCsvResult } from '../../src/ui/importCSVModal';
import type { KontoSpec } from '../../src/core/config/konten';
import { loadKonten, loadKontenConfig } from '../../src/state/konten';
import { previewCsv } from '../../src/core/import/preview';
import { runNativeImport } from '../../src/obsidian/nativeImport';
import { Notice } from 'obsidian';

const loadKontenMock = loadKonten as ReturnType<typeof vi.fn>;
const loadKontenConfigMock = loadKontenConfig as ReturnType<typeof vi.fn>;
const previewCsvMock = previewCsv as ReturnType<typeof vi.fn>;
const runNativeImportMock = runNativeImport as ReturnType<typeof vi.fn>;
const NoticeMock = Notice as unknown as ReturnType<typeof vi.fn>;

/** Vollständiger Kern-`KontoSpec` mit den Feldern, die der Test setzt. */
function konto(partial: Partial<KontoSpec> & Pick<KontoSpec, 'id' | 'iban'>): KontoSpec {
  return {
    ledgerAccount: 'Aktiva:Bank:Sparkasse:Hauptkonto',
    bank: 'Sparkasse Musterstadt',
    bic: '',
    kontoTyp: 'giro',
    kontoRolle: 'hauptkonto_privat',
    csvSchema: 'sparkasse_camt52',
    inhaber: 'Max Mustermann',
    aliases: [],
    sticker: '',
    rolleBeschreibung: '',
    filename: null,
    aktiv: true,
    ...partial,
  };
}

const KONTEN: KontoSpec[] = [
  konto({
    id: 'hauptkonto',
    iban: 'DE89370400440532013000',
    aliases: ['Hauptkonto'],
  }),
  konto({
    id: 'vermietung',
    iban: 'DE02120300000000202051',
    ledgerAccount: 'Aktiva:Bank:Sparkasse:Vermietung',
    kontoRolle: 'vermietung',
    aliases: ['Vermietung'],
  }),
  konto({
    id: 'visa_daily',
    iban: '4000 **** **** 0729',
    ledgerAccount: 'Aktiva:Bank:Sparkasse:Visa',
    kontoRolle: 'kreditkarte',
    csvSchema: 'sparkasse_visa',
    aliases: ['Visa Daily'],
  }),
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
    kontenFile: 'R/konten.yaml', vertraegeFile: 'R/vertraege.yaml',
    snapshotsFolder: 'R/.fl-snapshots',
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
  loadKontenConfigMock.mockResolvedValue({ konten: KONTEN });
  runNativeImportMock.mockResolvedValue({
    transactionCount: 12,
    files: ['a.CSV'],
    duplicatesSkipped: 3,
    vorgemerktSkipped: 0,
    unkategorisiert: 1,
    writtenFiles: ['R/Ledger/journal.ledger'],
    notesWritten: 0,
    dateRange: { first: '2026-08-01', last: '2026-08-31' },
    incompleteRules: [],
  });
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
  it('lädt die Konten über die Vault-Quelle, nicht über einen Subprozess', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    expect(loadKontenConfigMock).toHaveBeenCalledOnce();
    expect(loadKontenMock).toHaveBeenCalledOnce();
    // Die Deps tragen eine Lese-Funktion — keinen Repo-Pfad und keine uv-Binary.
    const deps = loadKontenMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(deps)).toEqual(['loadConfig']);
    expect(typeof deps.loadConfig).toBe('function');
  });

  it('renders error when loadKonten throws', async () => {
    loadKontenConfigMock.mockRejectedValueOnce(
      new Error('konten.yaml ist kein gültiges YAML: bad indent'),
    );
    const { modal } = makeModal();
    await modal.onOpen();
    const texts = collectTexts((modal as unknown as { contentEl: { children: unknown[] } }).contentEl);
    expect(texts.some(t => t.includes('Could not load accounts'))).toBe(true);
    expect(texts.some(t => t.includes('kein gültiges YAML'))).toBe(true);
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
  const PREVIEW: CheckCsvResult = {
    neu: 100,
    duplikate: 0,
    dateRange: { first: '2025-08-01', last: '2026-05-10' },
    kontoMatch: 'hauptkonto',
    warnings: [],
  };

  it('ruft die Vorschau je Datei mit INHALT auf — kein Pfad, keine Temp-Datei', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV', 'Datum;Betrag\n');
    invokeFileSelection(modal, [file]);
    previewCsvMock.mockResolvedValue(PREVIEW);

    await (modal as unknown as { runPreview: () => Promise<void> }).runPreview();

    expect(previewCsvMock).toHaveBeenCalledOnce();
    const arg = previewCsvMock.mock.calls[0][0] as {
      umsatzDir: string;
      incoming: { name: string; bytes: ArrayBuffer };
      konto: KontoSpec;
      konten: { konten: KontoSpec[] };
    };
    expect(arg.umsatzDir).toBe('20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze');
    expect(arg.incoming.name).toBe('20260506-0532013000-umsatz-camt52v8.CSV');
    // Der Inhalt reist als Bytes mit — genau das machte die Temp-Kopie überflüssig.
    expect(arg.incoming.bytes.byteLength).toBeGreaterThan(0);
    expect(arg.konto.id).toBe('hauptkonto');
    expect(arg.konten.konten).toHaveLength(3);

    const previews = (modal as unknown as { previewData: Map<File, CheckCsvResult> }).previewData;
    expect(previews.get(file)).toEqual(PREVIEW);
  });

  it('meldet eine gescheiterte Vorschau und macht mit der nächsten Datei weiter', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    const kaputt = makeFile('20260506-0532013000-umsatz-camt52v8.CSV');
    const gut = makeFile('20260506-0000202051-umsatz-camt52v8.CSV');
    invokeFileSelection(modal, [kaputt, gut]);
    previewCsvMock
      .mockRejectedValueOnce(new Error('Kopfzeile unbekannt'))
      .mockResolvedValueOnce(PREVIEW);
    NoticeMock.mockClear();

    await (modal as unknown as { runPreview: () => Promise<void> }).runPreview();

    expect(previewCsvMock).toHaveBeenCalledTimes(2);
    expect(
      NoticeMock.mock.calls.some((c) => String(c[0]).includes('Kopfzeile unbekannt')),
    ).toBe(true);
    const previews = (modal as unknown as { previewData: Map<File, CheckCsvResult> }).previewData;
    expect(previews.get(gut)).toEqual(PREVIEW);
  });

  it('lässt Dateien ohne Konto-Zuordnung aus', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('random.CSV')]);
    previewCsvMock.mockClear();

    await (modal as unknown as { runPreview: () => Promise<void> }).runPreview();

    expect(previewCsvMock).not.toHaveBeenCalled();
  });
});

describe('ImportCSVModal — runImport', () => {
  it('schreibt CSVs über die Vault-API, fährt den Lauf im Plugin und merkt den Zeitpunkt', async () => {
    const { modal, app, accessor } = makeModal();
    await modal.onOpen();
    const file = makeFile('20260506-0532013000-umsatz-camt52v8.CSV', 'Datum;Betrag\n2026-08-01;1,23\n');
    invokeFileSelection(modal, [file]);

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    // Vault-relativer Pfad über den Adapter — kein Dateisystem, kein basePath, kein file.path.
    expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
      '20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze/20260506-0532013000-umsatz-camt52v8.CSV',
      expect.any(ArrayBuffer),
    );
    // Kein Subprozess, keine Umgebungsvariablen, kein Timeout: der Lauf bekommt
    // App und Pfade und liest die CSVs dort, wo sie eben gelandet sind.
    expect(runNativeImportMock).toHaveBeenCalledOnce();
    const arg = runNativeImportMock.mock.calls[0][0] as { paths: { umsatzDir: string } };
    expect(arg.paths.umsatzDir).toBe('20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze');
    expect(accessor.saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        lastReimportTimestamp: expect.any(String),
        rulesAddedSinceReimport: 0,
      }),
    );
  });

  it('zeigt die Zahlen des LAUFS, nicht die der Vorschau', async () => {
    const { modal } = makeModal();
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('20260506-0532013000-umsatz-camt52v8.CSV')]);
    NoticeMock.mockClear();

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    // 12 neu / 3 Doppelungen stehen im Mock-Ergebnis von runNativeImport.
    const texte = NoticeMock.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(texte).toContain('12');
    expect(texte).toContain('3');
  });

  it('creates Umsätze dir when missing', async () => {
    const { modal, app } = makeModal();
    app.vault.adapter.exists.mockResolvedValue(false);
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('20260506-0532013000-umsatz-camt52v8.CSV')]);

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    expect(app.vault.adapter.mkdir).toHaveBeenCalledWith(
      '20_Projekte/02-Aktiv/26-011 Finanzplan erstellen/Umsätze',
    );
  });

  it('triggers onImportSuccess callback after successful import', async () => {
    const onImportSuccess = vi.fn().mockResolvedValue(undefined);
    const { modal } = makeModal({ onImportSuccess });
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('20260506-0532013000-umsatz-camt52v8.CSV')]);

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

    expect(onImportSuccess).toHaveBeenCalledOnce();
  });

  it('meldet den Fehler des Laufs und speichert nichts', async () => {
    const { modal, accessor } = makeModal();
    await modal.onOpen();
    invokeFileSelection(modal, [makeFile('20260506-0532013000-umsatz-camt52v8.CSV')]);
    runNativeImportMock.mockRejectedValueOnce(new Error('ParserError: invalid header'));
    NoticeMock.mockClear();

    await (modal as unknown as { runImport: () => Promise<void> }).runImport();

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
    konto({ id: 'hauptkonto', iban: 'DE89370400440473829165' }),
    konto({ id: 'vermietung', iban: 'DE89370400440000481907' }),
    konto({ id: 'visa_daily', iban: '4000 **** **** 0729', csvSchema: 'sparkasse_visa' }),
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
    const nurDatum: KontoSpec[] = [konto({ id: 'x', iban: 'DE89370400442026080100' })];
    expect(autoDetectKonto('20260801-999999999-umsatz-camt52v8.CSV', nurDatum)).toBeNull();
  });

  it('wählt bei Mehrdeutigkeit lieber nichts aus als das Falsche', () => {
    const doppelt: KontoSpec[] = [
      konto({ id: 'a', iban: 'DE89370400440000123456' }),
      konto({ id: 'b', iban: 'DE89370400440000123456' }),
    ];
    expect(autoDetectKonto('20260801-123456-umsatz-camt52v8.CSV', doppelt)).toBeNull();
  });

  it('bevorzugt bei Teil-Überlappung den längeren Treffer', () => {
    const konten: KontoSpec[] = [
      konto({ id: 'kurz', iban: 'DE89370400440000829165' }),
      konto({ id: 'lang', iban: 'DE89370400440473829165' }),
    ];
    expect(autoDetectKonto('20260801-473829165-umsatz-camt52v8.CSV', konten)?.id).toBe('lang');
  });

  it('ignoriert zu kurze Ziffernfolgen (< 4 Stellen)', () => {
    // Kontonummer 0000000729 → nach dem Strippen nur noch "729" (3 Stellen).
    const kurz: KontoSpec[] = [konto({ id: 'kurz', iban: 'DE89370400440000000729' })];
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
