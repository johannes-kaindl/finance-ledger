import { Platform } from 'obsidian';

export interface GitBackupResult {
  committed: boolean;
  sha?: string;
  error?: string;
}

const MAX_LOCK_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

// Own wrapper so vi.mock('child_process') works without promisify.custom dance
async function gitRun(cwd: string, args: string[]): Promise<string> {
  // Desktop-only (Node-Subprozess-API). Guard = Mobile-Safety + erlaubt den
  // dynamischen Node-Import für eslint (no-nodejs-modules).
  if (!Platform.isDesktop) {
    throw new Error('Git backup is available on desktop only.');
  }
  const { execFile } = await import('child_process');
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], (err, stdout) => {
      if (err) reject(err instanceof Error ? err : new Error('git execFile failed'));
      else resolve(stdout);
    });
  });
}

type HeadState = 'ok' | 'detached' | 'no-repo';

/**
 * Classify the vault's HEAD via a single `symbolic-ref HEAD` call.
 * A non-git directory and a detached HEAD both make that call fail, but with
 * distinguishable errors — so we don't misreport "kein Repo" as detached HEAD.
 */
async function classifyHead(vaultPath: string): Promise<HeadState> {
  try {
    await gitRun(vaultPath, ['symbolic-ref', 'HEAD']);
    return 'ok';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not a git repository/i.test(msg)) return 'no-repo';
    return 'detached';
  }
}

export async function runGitBackup(
  vaultPath: string,
  rulesFolder: string,
  message: string,
  retryDelayMs = 1000,
): Promise<GitBackupResult> {
  if (!Platform.isDesktop) {
    return { committed: false, error: 'Git-Backup ist nur auf Desktop verfügbar (Subprozess-API auf Mobile nicht unterstützt)' };
  }

  const { existsSync } = await import('fs');
  const path = (await import('path')).default;

  const headState = await classifyHead(vaultPath);
  if (headState === 'no-repo') {
    return { committed: false, error: 'Vault ist kein Git-Repo — Backup übersprungen' };
  }
  if (headState === 'detached') {
    return { committed: false, error: 'Vault-Repo ist im Detached-HEAD-State — manueller Eingriff nötig' };
  }

  if (existsSync(path.join(vaultPath, '.git', 'MERGE_HEAD'))) {
    return { committed: false, error: 'Vault-Repo hat aktiven Merge — manueller Eingriff nötig' };
  }

  // git add — retry on index.lock
  let lastError: string | null = null;
  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
    try {
      await gitRun(vaultPath, ['add', '--', rulesFolder]);
      lastError = null;
      break;
    } catch (err) {
      const msg = String(err);
      if (msg.includes('index.lock')) {
        lastError = msg;
        if (attempt < MAX_LOCK_RETRIES - 1) await sleep(retryDelayMs);
      } else {
        return { committed: false, error: `git add fehlgeschlagen: ${msg}` };
      }
    }
  }

  if (lastError !== null) {
    return { committed: false, error: `index.lock blockiert nach ${MAX_LOCK_RETRIES} Versuchen: ${lastError}` };
  }

  // diff --cached: exit 0 → nothing staged, non-0 → changes staged
  try {
    await gitRun(vaultPath, ['diff', '--cached', '--quiet', '--', rulesFolder]);
    return { committed: false }; // nothing staged → no-op
  } catch {
    // changes staged → proceed
  }

  try {
    const stdout = await gitRun(vaultPath, ['commit', '-m', message]);
    const shaMatch = stdout.match(/\[[\w./-]+ ([a-f0-9]+)\]/);
    return { committed: true, sha: shaMatch?.[1] };
  } catch (err) {
    return { committed: false, error: `git commit fehlgeschlagen: ${String(err)}` };
  }
}
