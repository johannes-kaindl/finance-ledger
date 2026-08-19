import { describe, it, expect } from 'vitest';
import { EN, DE, registerI18n, tPlural } from '../../src/i18n/strings';
import { setLang, t } from '../../src/vendor/kit/i18n';

describe('i18n strings', () => {
  it('EN und DE haben identische Keysets (Parität)', () => {
    const en = Object.keys(EN).sort();
    const de = Object.keys(DE).sort();
    expect(de).toEqual(en);
  });

  it('registerI18n + setLang liefert die richtige Sprache, EN als Fallback', () => {
    registerI18n();
    setLang('de');
    expect(t('common.cancel')).toBe('Abbrechen');
    setLang('en');
    expect(t('common.cancel')).toBe('Cancel');
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('t substituiert Positionsargumente', () => {
    registerI18n();
    setLang('en');
    expect(t('notice.noAccountNote', 'Aktiva:Girokonto')).toBe('No note for account "Aktiva:Girokonto"');
  });

  it('tPlural wählt one/other und interpoliert n', () => {
    registerI18n();
    setLang('en');
    expect(tPlural('diag.skippedLine', 1)).toBe('1 ignored line');
    expect(tPlural('diag.skippedLine', 3)).toBe('3 ignored lines');
    setLang('de');
    expect(tPlural('diag.unbalanced', 1)).toBe('1 unausgeglichene Transaktion');
    expect(tPlural('diag.unbalanced', 2)).toBe('2 unausgeglichene Transaktionen');
  });
});
