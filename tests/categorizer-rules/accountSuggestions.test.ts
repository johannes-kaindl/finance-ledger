import { it, expect, describe } from 'vitest';
import { loadAccountSuggestions } from '../../src/categorizer-rules/accountSuggestions';

type Frontmatter = Record<string, unknown>;

interface MockFile {
  name: string;
  frontmatter: Frontmatter | null;
}

function makeApp(files: MockFile[], ledgerContent?: string) {
  return {
    vault: {
      getMarkdownFiles: () => files.map(f => ({ name: f.name })),
      adapter: {
        read: async (path: string) => {
          if (ledgerContent !== undefined) return ledgerContent;
          throw new Error(`File not found: ${path}`);
        },
      },
    },
    metadataCache: {
      getFileCache: (file: { name: string }) => {
        const found = files.find(f => f.name === file.name);
        if (!found || !found.frontmatter) return null;
        return { frontmatter: found.frontmatter };
      },
    },
  } as unknown as Parameters<typeof loadAccountSuggestions>[0];
}

const LEDGER_CONTENT = `
; Aktiva
account Aktiva:Girokonto
account Aktiva:Sparkonto
; Ausgaben
account Ausgaben:Lebensmittel
account Ausgaben:Lebensmittel:REWE
account Ausgaben:Haushalt
; leer — wird ignoriert
account
`.trim();

describe('loadAccountSuggestions', () => {
  describe('accounts.ledger parsing', () => {
    it('parst 5 account-Direktiven, ignoriert Comments und Leerzeile', async () => {
      const app = makeApp([], LEDGER_CONTENT);
      const result = await loadAccountSuggestions(app, '/vault', 'ledger/accounts.ledger');
      expect(result.sourceCount.fromLedger).toBe(5);
      expect(result.accounts).toContain('Aktiva:Girokonto');
      expect(result.accounts).toContain('Ausgaben:Lebensmittel:REWE');
    });

    it('fällt graceful zurück wenn accounts.ledger fehlt', async () => {
      const app = makeApp([], undefined); // throws on read
      const result = await loadAccountSuggestions(app, '/vault', 'missing.ledger');
      expect(result.sourceCount.fromLedger).toBe(0);
      expect(result.accounts).toHaveLength(0);
    });
  });

  describe('frontmatter crawling', () => {
    it('extrahiert ledger_account und ledger_kategorie, ignoriert Notes ohne Property', async () => {
      const files: MockFile[] = [
        { name: 'konto-giro.md', frontmatter: { ledger_account: 'Aktiva:Girokonto' } },
        { name: 'vertrag-strom.md', frontmatter: { ledger_kategorie: 'Ausgaben:Energie:Strom' } },
        { name: 'ohne-props.md', frontmatter: { title: 'Notiz ohne Ledger' } },
      ];
      const app = makeApp(files, undefined);
      const result = await loadAccountSuggestions(app, '/vault', 'missing.ledger');
      expect(result.sourceCount.fromFrontmatter).toBe(2);
      expect(result.accounts).toContain('Aktiva:Girokonto');
      expect(result.accounts).toContain('Ausgaben:Energie:Strom');
    });

    it('strippt Anführungszeichen aus FM-Werten', async () => {
      const files: MockFile[] = [
        { name: 'note.md', frontmatter: { ledger_account: '"Ausgaben:Haushalt"' } },
      ];
      const app = makeApp(files, undefined);
      const result = await loadAccountSuggestions(app, '/vault', 'missing.ledger');
      expect(result.accounts).toContain('Ausgaben:Haushalt');
    });
  });

  describe('dedup + sort', () => {
    it('zählt deduped korrekt wenn FM-Account in accounts.ledger existiert', async () => {
      const files: MockFile[] = [
        { name: 'note.md', frontmatter: { ledger_account: 'Aktiva:Girokonto' } },
      ];
      const app = makeApp(files, LEDGER_CONTENT);
      const result = await loadAccountSuggestions(app, '/vault', 'ledger/accounts.ledger');
      expect(result.sourceCount.deduped).toBeGreaterThan(0);
      // deduped = 1 (Aktiva:Girokonto ist in beiden Quellen)
      expect(result.sourceCount.deduped).toBe(1);
    });

    it('Output ist lexicographisch sortiert', async () => {
      const app = makeApp([], LEDGER_CONTENT);
      const result = await loadAccountSuggestions(app, '/vault', 'ledger/accounts.ledger');
      const sorted = [...result.accounts].sort();
      expect(result.accounts).toEqual(sorted);
    });

    it('keine Duplikate in Output wenn Account in beiden Quellen', async () => {
      const files: MockFile[] = [
        { name: 'note.md', frontmatter: { ledger_account: 'Aktiva:Girokonto' } },
      ];
      const app = makeApp(files, LEDGER_CONTENT);
      const result = await loadAccountSuggestions(app, '/vault', 'ledger/accounts.ledger');
      const unique = new Set(result.accounts);
      expect(result.accounts.length).toBe(unique.size);
    });
  });
});
