import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { loadSlugMaps } from '../../src/views/slugMaps';

const FOLDERS = { kategorienFolder: '45-Kategorien', empfaengerFolder: '60-Empfänger' };

type FakeFile = { path: string };

/**
 * Build a minimal App whose markdown files each map to a frontmatter object.
 * `files` is a list of [path, frontmatter] tuples.
 */
function makeApp(files: Array<[string, Record<string, unknown> | undefined]>): App {
  const fileObjs: FakeFile[] = files.map(([path]) => ({ path }));
  const fmByPath = new Map(files.map(([path, fm]) => [path, fm]));
  return {
    vault: { getMarkdownFiles: vi.fn().mockReturnValue(fileObjs) },
    metadataCache: {
      getFileCache: vi.fn((file: FakeFile) => {
        const fm = fmByPath.get(file.path);
        return fm ? { frontmatter: fm } : undefined;
      }),
    },
  } as unknown as App;
}

describe('loadSlugMaps', () => {
  it('maps kategorie_slug → kategorie_prefix for files in the Kategorien folder', async () => {
    const app = makeApp([
      ['45-Kategorien/lebensmittel.md', { kategorie_slug: 'lebensmittel', kategorie_prefix: 'Ausgaben:Lebensmittel' }],
    ]);
    const maps = await loadSlugMaps(app, FOLDERS);
    expect(maps.kategorieToPrefix.get('lebensmittel')).toBe('Ausgaben:Lebensmittel');
    expect(maps.empfaengerToAccount.size).toBe(0);
  });

  it('maps empfaenger_slug → ledger_account for files in the Empfänger folder', async () => {
    const app = makeApp([
      ['60-Empfänger/edeka.md', { empfaenger_slug: 'edeka', ledger_account: 'Ausgaben:Lebensmittel:Edeka' }],
    ]);
    const maps = await loadSlugMaps(app, FOLDERS);
    expect(maps.empfaengerToAccount.get('edeka')).toBe('Ausgaben:Lebensmittel:Edeka');
    expect(maps.kategorieToPrefix.size).toBe(0);
  });

  it('ignores files outside both folders', async () => {
    const app = makeApp([
      ['99-Anderes/foo.md', { kategorie_slug: 'x', kategorie_prefix: 'Y' }],
    ]);
    const maps = await loadSlugMaps(app, FOLDERS);
    expect(maps.kategorieToPrefix.size).toBe(0);
    expect(maps.empfaengerToAccount.size).toBe(0);
  });

  it('skips entries with incomplete frontmatter (slug without prefix)', async () => {
    const app = makeApp([
      ['45-Kategorien/incomplete.md', { kategorie_slug: 'incomplete' }],
      ['60-Empfänger/incomplete.md', { empfaenger_slug: 'incomplete' }],
    ]);
    const maps = await loadSlugMaps(app, FOLDERS);
    expect(maps.kategorieToPrefix.size).toBe(0);
    expect(maps.empfaengerToAccount.size).toBe(0);
  });

  it('skips files without a frontmatter cache', async () => {
    const app = makeApp([['45-Kategorien/no-cache.md', undefined]]);
    const maps = await loadSlugMaps(app, FOLDERS);
    expect(maps.kategorieToPrefix.size).toBe(0);
  });

  it('empty vault → empty maps', async () => {
    const maps = await loadSlugMaps(makeApp([]), FOLDERS);
    expect(maps.kategorieToPrefix.size).toBe(0);
    expect(maps.empfaengerToAccount.size).toBe(0);
  });

  it('collects multiple entries across both folders in one pass', async () => {
    const app = makeApp([
      ['45-Kategorien/wohnen.md', { kategorie_slug: 'wohnen', kategorie_prefix: 'Ausgaben:Wohnen' }],
      ['45-Kategorien/mobilitaet.md', { kategorie_slug: 'mobilitaet', kategorie_prefix: 'Ausgaben:Mobilitaet' }],
      ['60-Empfänger/rewe.md', { empfaenger_slug: 'rewe', ledger_account: 'Ausgaben:Lebensmittel:REWE' }],
    ]);
    const maps = await loadSlugMaps(app, FOLDERS);
    expect(maps.kategorieToPrefix.size).toBe(2);
    expect(maps.empfaengerToAccount.get('rewe')).toBe('Ausgaben:Lebensmittel:REWE');
  });
});
