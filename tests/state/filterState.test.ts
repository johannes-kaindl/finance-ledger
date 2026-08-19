import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadState,
  saveState,
  savePreset,
  loadPresets,
  deletePreset,
  migrateLegacyKeys,
  migrateRawLocalStorageToApp,
  type StorageAdapter,
} from '../../src/state/filterState';
import type { FilterState } from '../../src/views/helpers';

class MemoryStorage implements StorageAdapter {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('A2.1 FilterState Persist', () => {
  let store: MemoryStorage;

  beforeEach(() => { store = new MemoryStorage(); });

  it('returns default empty state when storage is empty', () => {
    const state = loadState(store);
    expect(state).toEqual({ dateFrom: '', dateTo: '', counterparty: '', account: '', tags: '' });
  });

  it('roundtrip: save then load returns same state', () => {
    const state: FilterState = {
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      counterparty: 'Telekom',
      account: 'Aktiva',
      tags: 'recurring',
    };
    saveState(state, store);
    expect(loadState(store)).toEqual(state);
  });

  it('partial state in storage merges with defaults', () => {
    store.setItem('finance:filterState', JSON.stringify({ account: 'Ausgaben' }));
    const state = loadState(store);
    expect(state.account).toBe('Ausgaben');
    expect(state.dateFrom).toBe('');
    expect(state.tags).toBe('');
  });

  it('corrupted storage returns default state', () => {
    store.setItem('finance:filterState', 'not-json');
    expect(loadState(store)).toEqual({ dateFrom: '', dateTo: '', counterparty: '', account: '', tags: '' });
  });
});

describe('A2.2 Preset CRUD', () => {
  let store: MemoryStorage;

  beforeEach(() => { store = new MemoryStorage(); });

  it('loadPresets returns empty array when no presets saved', () => {
    expect(loadPresets(store)).toEqual([]);
  });

  it('saved preset appears in loadPresets', () => {
    const state: FilterState = { dateFrom: '2025-01-01', dateTo: '', counterparty: '', account: 'Aktiva', tags: '' };
    savePreset('Konto 1 Q1', state, store);
    const presets = loadPresets(store);
    expect(presets).toHaveLength(1);
    expect(presets[0]).toEqual({ name: 'Konto 1 Q1', state });
  });

  it('multiple presets all appear in loadPresets', () => {
    const s1: FilterState = { dateFrom: '', dateTo: '', counterparty: '', account: 'Aktiva', tags: '' };
    const s2: FilterState = { dateFrom: '', dateTo: '', counterparty: '', account: '', tags: 'tbc' };
    savePreset('Alle TBC', s2, store);
    savePreset('Aktiva', s1, store);
    expect(loadPresets(store)).toHaveLength(2);
  });

  it('duplicate name overwrites existing preset', () => {
    const s1: FilterState = { dateFrom: '2025-01-01', dateTo: '', counterparty: '', account: '', tags: '' };
    const s2: FilterState = { dateFrom: '2025-06-01', dateTo: '', counterparty: '', account: '', tags: '' };
    savePreset('Mein Preset', s1, store);
    savePreset('Mein Preset', s2, store);
    const presets = loadPresets(store);
    expect(presets).toHaveLength(1);
    expect(presets[0].state.dateFrom).toBe('2025-06-01');
  });

  it('deleted preset no longer appears in loadPresets', () => {
    const state: FilterState = { dateFrom: '', dateTo: '', counterparty: 'Telekom', account: '', tags: '' };
    savePreset('Telekom', state, store);
    deletePreset('Telekom', store);
    expect(loadPresets(store)).toHaveLength(0);
  });

  it('deleting unknown preset name does not throw', () => {
    expect(() => deletePreset('existiert-nicht', store)).not.toThrow();
  });
});

describe('migrateLegacyKeys (Slice-6 Plugin-Umbenennung)', () => {
  let store: MemoryStorage;

  beforeEach(() => { store = new MemoryStorage(); });

  it('moves legacy filterState to new key and deletes old one', () => {
    const payload = JSON.stringify({ account: 'Aktiva' });
    store.setItem('26-011-finanzplan:filterState', payload);
    migrateLegacyKeys(store);
    expect(store.getItem('finance:filterState')).toBe(payload);
    expect(store.getItem('26-011-finanzplan:filterState')).toBeNull();
  });

  it('moves legacy filterPresets to new key and deletes old one', () => {
    const payload = JSON.stringify([{ name: 'p1', state: { dateFrom: '', dateTo: '', counterparty: '', account: 'Aktiva', tags: '' } }]);
    store.setItem('26-011-finanzplan:filterPresets', payload);
    migrateLegacyKeys(store);
    expect(store.getItem('finance:filterPresets')).toBe(payload);
    expect(store.getItem('26-011-finanzplan:filterPresets')).toBeNull();
  });

  it('does not overwrite existing new-key value when legacy key also present', () => {
    store.setItem('finance:filterState', JSON.stringify({ account: 'NEW' }));
    store.setItem('26-011-finanzplan:filterState', JSON.stringify({ account: 'OLD' }));
    migrateLegacyKeys(store);
    expect(JSON.parse(store.getItem('finance:filterState')!).account).toBe('NEW');
    expect(store.getItem('26-011-finanzplan:filterState')).toBeNull();
  });

  it('is idempotent: running twice does nothing on second run', () => {
    store.setItem('26-011-finanzplan:filterState', JSON.stringify({ account: 'X' }));
    migrateLegacyKeys(store);
    migrateLegacyKeys(store);
    expect(JSON.parse(store.getItem('finance:filterState')!).account).toBe('X');
  });
});

describe('migrateRawLocalStorageToApp (raw localStorage -> vault-scoped App backend)', () => {
  let store: MemoryStorage;
  const win = window as unknown as { localStorage: MemoryStorage | undefined };
  let rawBackup: MemoryStorage | undefined;

  beforeEach(() => {
    store = new MemoryStorage();
    rawBackup = win.localStorage;
    win.localStorage = new MemoryStorage();
  });
  afterEach(() => { win.localStorage = rawBackup; });

  it('moves raw finance:* values into the app-backed adapter and clears raw', () => {
    const payload = JSON.stringify({ account: 'Aktiva' });
    win.localStorage!.setItem('finance:filterState', payload);
    migrateRawLocalStorageToApp(store);
    expect(store.getItem('finance:filterState')).toBe(payload);
    expect(win.localStorage!.getItem('finance:filterState')).toBeNull();
  });

  it('migrates legacy 26-011-finanzplan:* from raw into app finance:* keys', () => {
    const payload = JSON.stringify([{ name: 'p1', state: {} }]);
    win.localStorage!.setItem('26-011-finanzplan:filterPresets', payload);
    migrateRawLocalStorageToApp(store);
    expect(store.getItem('finance:filterPresets')).toBe(payload);
    expect(win.localStorage!.getItem('26-011-finanzplan:filterPresets')).toBeNull();
  });

  it('does not overwrite an existing app-backed value', () => {
    store.setItem('finance:filterState', JSON.stringify({ account: 'NEW' }));
    win.localStorage!.setItem('finance:filterState', JSON.stringify({ account: 'OLD' }));
    migrateRawLocalStorageToApp(store);
    expect(JSON.parse(store.getItem('finance:filterState')!).account).toBe('NEW');
  });

  it('is a no-op when window.localStorage is unavailable', () => {
    win.localStorage = undefined;
    expect(() => migrateRawLocalStorageToApp(store)).not.toThrow();
  });
});
