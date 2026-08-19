import type { App } from 'obsidian';
import type { SlugMaps } from './helpers';

/** Reads a string-valued frontmatter key, narrowing the untyped cache safely. */
function frontmatterString(frontmatter: unknown, key: string): string | undefined {
  if (typeof frontmatter !== 'object' || frontmatter === null) return undefined;
  const value = (frontmatter as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export async function loadSlugMaps(
  app: App,
  folders: { kategorienFolder: string; empfaengerFolder: string },
): Promise<SlugMaps> {
  const kategorieToPrefix = new Map<string, string>();
  const empfaengerToAccount = new Map<string, string>();

  const allFiles = app.vault.getMarkdownFiles();
  for (const file of allFiles) {
    if (file.path.startsWith(folders.kategorienFolder + '/')) {
      const fm = app.metadataCache.getFileCache(file)?.frontmatter;
      const slug = frontmatterString(fm, 'kategorie_slug');
      const prefix = frontmatterString(fm, 'kategorie_prefix');
      if (slug !== undefined && prefix !== undefined) {
        kategorieToPrefix.set(slug, prefix);
      }
    } else if (file.path.startsWith(folders.empfaengerFolder + '/')) {
      const fm = app.metadataCache.getFileCache(file)?.frontmatter;
      const slug = frontmatterString(fm, 'empfaenger_slug');
      const account = frontmatterString(fm, 'ledger_account');
      if (slug !== undefined && account !== undefined) {
        empfaengerToAccount.set(slug, account);
      }
    }
  }

  return { kategorieToPrefix, empfaengerToAccount };
}
