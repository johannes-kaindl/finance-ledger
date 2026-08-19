import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve('./tests/__mocks__/obsidian.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Claude-Worktrees nie mit einscannen — Testkopien dort erzeugen ein
    // Mock-Split-Brain mit dem obsidian-Alias des Hauptrepos
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
