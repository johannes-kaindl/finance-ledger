import { normalizePath, TFile, type App } from 'obsidian';
import { loadCategorizerRules } from '../categorizer-rules/loader';

export function resolveAccountNote(account: string, app: App): TFile | null {
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    if (fm['ledger_account'] === account || fm['ledger_kategorie'] === account) {
      return file;
    }
  }
  return null;
}

/**
 * The categorizer-rule note for a counterparty — its "page" in this system,
 * where the account/tags/aliases for that payee live. Matched the same way the
 * TBC triage matches rules (pattern OR any alias is a substring of the payee),
 * so aliases resolve too. Returns null when the counterparty has no rule yet.
 */
export function resolveCounterpartyNote(counterparty: string, rulesFolder: string, app: App): TFile | null {
  const rules = loadCategorizerRules(app);
  const all = [...rules.counterpartyRules, ...rules.paypalRules];
  const cpLower = counterparty.toLowerCase();
  const match = all.find(r =>
    [r.pattern, ...r.aliases].some(p => cpLower.includes(p.toLowerCase())),
  );
  if (!match) return null;
  const file = app.vault.getAbstractFileByPath(normalizePath(`${rulesFolder}/${match.noteFile}`));
  return file instanceof TFile ? file : null;
}
