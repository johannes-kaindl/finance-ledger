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
    // Zeitzone festnageln: `gfs-retention` rechnet Kalendergrenzen bewusst in der
    // Ortszeit der Laufzeit (ein Schnappschuss „von gestern" ist der, den der Nutzer
    // gestern gesehen hat). Ohne diese Zeile liefe der Golden-Test lokal gegen
    // Europe/Berlin und in CI gegen UTC — und kippte dort an jeder Tagesgrenze.
    env: { TZ: 'Europe/Berlin' },
    setupFiles: ['./tests/setup.ts'],
    // Claude-Worktrees nie mit einscannen — Testkopien dort erzeugen ein
    // Mock-Split-Brain mit dem obsidian-Alias des Hauptrepos
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
