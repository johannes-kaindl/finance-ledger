import { it, expect, describe, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false), // no MERGE_HEAD by default
}));

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { runGitBackup } from '../../src/categorizer-rules/gitBackup';

const execFileMock = execFile as ReturnType<typeof vi.fn>;
const existsSyncMock = existsSync as ReturnType<typeof vi.fn>;

// gitBackup.ts uses execFile(file, args, callback) where callback is (err, stdout)
function setupExecSequence(responses: Array<{ err?: Error; stdout?: string }>) {
  let callIdx = 0;
  execFileMock.mockImplementation(
    (_file: string, _args: string[], callback: (err: Error | null, stdout: string) => void) => {
      const r = responses[Math.min(callIdx, responses.length - 1)];
      callIdx++;
      if (r.err) callback(r.err, '');
      else callback(null, r.stdout ?? '');
    },
  );
}

const VAULT = '/vault';
const RULES = '20_Projekte/55-Categorizer-Rules';
const MSG = '[plugin] backup before rule write: edeka';

describe('runGitBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
  });

  it('committed:true + SHA when changes staged and commit succeeds', async () => {
    setupExecSequence([
      { stdout: 'ref: refs/heads/main' },   // symbolic-ref HEAD → not detached
      { stdout: '' },                         // git add OK
      { err: new Error('exit 1') },           // diff --cached non-0 → changes exist
      { stdout: '[main abc1234] backup\n' },  // commit
    ]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(true);
    expect(result.sha).toBe('abc1234');
    expect(result.error).toBeUndefined();
  });

  it('committed:false (no-op) when tree is clean', async () => {
    setupExecSequence([
      { stdout: 'ref: refs/heads/main' }, // symbolic-ref HEAD
      { stdout: '' },                      // git add OK
      { stdout: '' },                      // diff --cached exit 0 → nothing staged
    ]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('git add uses only rulesFolder pathspec — not "." or "-A"', async () => {
    setupExecSequence([
      { stdout: 'ref: refs/heads/main' },
      { stdout: '' },
      { stdout: '' },
    ]);
    await runGitBackup(VAULT, RULES, MSG, 0);

    const addCall = execFileMock.mock.calls.find(
      (args: unknown[]) => Array.isArray(args[1]) && (args[1] as string[]).includes('add'),
    ) as [string, string[], Function] | undefined;
    expect(addCall).toBeDefined();
    const addArgs = addCall![1] as string[];
    expect(addArgs).toContain('--');
    expect(addArgs).toContain(RULES);
    expect(addArgs).not.toContain('.');
    expect(addArgs).not.toContain('-A');
  });

  it('error when detached HEAD', async () => {
    setupExecSequence([{ err: new Error('fatal: ref HEAD is not a symbolic ref') }]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(false);
    expect(result.error).toContain('Detached-HEAD');
  });

  it('error when vault is not a git repo — distinct from detached HEAD (N1)', async () => {
    setupExecSequence([{ err: new Error('fatal: not a git repository (or any of the parent directories): .git') }]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(false);
    expect(result.error).toContain('kein Git-Repo');
    expect(result.error).not.toContain('Detached');
  });

  it('error when MERGE_HEAD exists', async () => {
    existsSyncMock.mockReturnValue(true);
    setupExecSequence([{ stdout: 'ref: refs/heads/main' }]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(false);
    expect(result.error).toContain('Merge');
  });

  it('retries on index.lock and succeeds after 3 failures', async () => {
    const lockErr = new Error('fatal: Unable to create index.lock: File exists');
    setupExecSequence([
      { stdout: 'ref: refs/heads/main' }, // symbolic-ref
      { err: lockErr },                    // git add attempt 1
      { err: lockErr },                    // git add attempt 2
      { err: lockErr },                    // git add attempt 3
      { stdout: '' },                      // git add attempt 4 → success
      { err: new Error('exit 1') },        // diff --cached → changes exist
      { stdout: '[main abc9999] backup\n' },
    ]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(true);
    expect(result.sha).toBe('abc9999');
  });

  it('error after MAX_LOCK_RETRIES lock failures', async () => {
    const lockErr = new Error('fatal: Unable to create index.lock: File exists');
    setupExecSequence([
      { stdout: 'ref: refs/heads/main' },
      { err: lockErr },
      { err: lockErr },
      { err: lockErr },
      { err: lockErr },
      { err: lockErr }, // 5 failures = exhausted
    ]);
    const result = await runGitBackup(VAULT, RULES, MSG, 0);
    expect(result.committed).toBe(false);
    expect(result.error).toContain('index.lock');
  });
});
