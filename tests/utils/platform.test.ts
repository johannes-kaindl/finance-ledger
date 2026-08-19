import { describe, it, expect, beforeEach } from 'vitest';
import { isMobile, isDesktop } from '../../src/utils/platform';
import { Platform } from 'obsidian';

describe('platform helpers', () => {
  beforeEach(() => {
    Platform.isMobile = false;
    Platform.isDesktop = true;
  });

  it('isMobile() spiegelt Platform.isMobile', () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    expect(isMobile()).toBe(true);
    expect(isDesktop()).toBe(false);
  });

  it('isDesktop() spiegelt Platform.isDesktop', () => {
    Platform.isMobile = false;
    Platform.isDesktop = true;
    expect(isMobile()).toBe(false);
    expect(isDesktop()).toBe(true);
  });
});
