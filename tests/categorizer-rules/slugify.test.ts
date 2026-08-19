import { it, expect, describe } from 'vitest';
import { slugifyPattern } from '../../src/categorizer-rules/writer';

describe('slugifyPattern', () => {
  // Burst-A Pflicht-Test
  it('umlaut: müller mering → mueller-mering', () => {
    expect(slugifyPattern('müller mering')).toBe('mueller-mering');
  });

  // Umlaut-Replacements (9 aus Burst-A Recon)
  it('ä → ae', () => expect(slugifyPattern('bäcker')).toBe('baecker'));
  it('ö → oe', () => expect(slugifyPattern('böhm')).toBe('boehm'));
  it('ü → ue', () => expect(slugifyPattern('brüder')).toBe('brueder'));
  it('ß → ss', () => expect(slugifyPattern('straße')).toBe('strasse'));
  it('multiple umlauts in one pattern', () => {
    expect(slugifyPattern('bäckerei konditorei müller')).toBe('baeckerei-konditorei-mueller');
  });
  it('uppercase via lowercase first', () => {
    expect(slugifyPattern('MÜLLER')).toBe('mueller');
  });

  // Punkt strip (11 aus Burst-A Recon)
  it('dots stripped', () => expect(slugifyPattern('p.h.b gmbh')).toBe('phb-gmbh'));
  it('trailing dot stripped', () => expect(slugifyPattern('amazon.')).toBe('amazon'));
  it('multiple dots stripped', () => expect(slugifyPattern('a.b.c.d')).toBe('abcd'));

  // Apostroph (1 aus Burst-A Recon)
  it("straight apostrophe stripped", () => expect(slugifyPattern("o'reilly")).toBe('oreilly'));
  it('curly apostrophes stripped', () => {
    expect(slugifyPattern('‘reilly’')).toBe('reilly');
  });

  // Trailing/Leading Spaces (5 aus Burst-A Recon)
  it('leading space trimmed', () => expect(slugifyPattern(' amazon')).toBe('amazon'));
  it('trailing space trimmed', () => expect(slugifyPattern('amazon ')).toBe('amazon'));
  it('multiple spaces → single hyphen', () => expect(slugifyPattern('pop  mart')).toBe('pop-mart'));
  it('internal spaces → hyphens', () => expect(slugifyPattern('aldi sued')).toBe('aldi-sued'));

  // Plus + Ampersand (6 aus Burst-A Recon)
  it('+ → -und-', () => expect(slugifyPattern('foo+bar')).toBe('foo-und-bar'));
  it('& → -und-', () => expect(slugifyPattern('foo&bar')).toBe('foo-und-bar'));
  it('no double hyphens from -und-', () => {
    expect(slugifyPattern('foo + bar')).toBe('foo-und-bar');
  });

  // Hyphen handling (7 aus Burst-A Recon)
  it('existing hyphen preserved', () => expect(slugifyPattern('pop-mart')).toBe('pop-mart'));
  it('multiple hyphens collapsed', () => expect(slugifyPattern('a--b')).toBe('a-b'));
  it('leading/trailing hyphens stripped', () => {
    expect(slugifyPattern('-foo-')).toBe('foo');
  });

  // Sonderzeichen strip
  it('slash stripped', () => expect(slugifyPattern('foo/bar')).toBe('foobar'));
  it('parentheses stripped', () => expect(slugifyPattern('foo (bar)')).toBe('foo-bar'));

  // Empty/whitespace only
  it('empty string → empty string', () => expect(slugifyPattern('')).toBe(''));
  it('whitespace only → empty string', () => expect(slugifyPattern('   ')).toBe(''));
});
