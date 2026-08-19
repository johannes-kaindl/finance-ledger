import type { App } from 'obsidian';

export interface AccountSuggestionsResult {
  accounts: string[];
  sourceCount: { fromLedger: number; fromFrontmatter: number; deduped: number };
}

export async function loadAccountSuggestions(
  app: App,
  vaultPath: string,
  accountsLedgerRelPath: string,
): Promise<AccountSuggestionsResult> {
  const ledgerAccounts: string[] = [];
  const fmAccounts: string[] = [];

  // Parse accounts.ledger
  try {
    const content = await app.vault.adapter.read(accountsLedgerRelPath);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith(';') || !trimmed.startsWith('account ')) continue;
      const account = trimmed.slice('account '.length).trim();
      if (account) ledgerAccounts.push(account);
    }
  } catch {
    // accounts.ledger not found — FM-only fallback
  }

  // Crawl frontmatter for ledger_account + ledger_kategorie
  for (const file of app.vault.getMarkdownFiles()) {
    const fm: Record<string, unknown> | undefined =
      app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    for (const prop of ['ledger_account', 'ledger_kategorie']) {
      const raw: unknown = fm[prop];
      if (typeof raw !== 'string') continue;
      const value = raw.replace(/^["']|["']$/g, '').trim();
      if (value) fmAccounts.push(value);
    }
  }

  const ledgerSet = new Set(ledgerAccounts);
  const union = new Set([...ledgerAccounts, ...fmAccounts]);
  const deduped = fmAccounts.filter(a => ledgerSet.has(a)).length;

  const accounts = [...union].sort();

  return {
    accounts,
    sourceCount: { fromLedger: ledgerAccounts.length, fromFrontmatter: fmAccounts.length, deduped },
  };
}
