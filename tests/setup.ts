// Vitest läuft in der Node-Umgebung (kein DOM). Plugin-Code nutzt aber
// window.setTimeout / window.clearTimeout (Obsidian-Guideline prefer-window-timers,
// Popout-Window-Kompatibilität). In Node existiert `window` nicht — hier auf die
// globalen Timer mappen, damit die Tests dasselbe Verhalten sehen wie der
// Obsidian-Renderer.
(globalThis as { window?: typeof globalThis }).window = globalThis;

// Alle Tests erwarten Englisch (kanonische Sprache) — F2 (i18n DE/EN) macht die
// Sprache settings-/obsidian-gesteuert, aber die bestehenden Fixtures/Assertions
// bleiben Englisch. registerI18n() ist idempotent, daher hier zentral statt pro Testdatei.
import { registerI18n, setLang } from '../src/i18n/strings';
registerI18n();
setLang('en');
