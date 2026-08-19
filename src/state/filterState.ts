import type { App } from 'obsidian';
import type { FilterState } from '../views/helpers';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PresetEntry {
  name: string;
  state: FilterState;
}

const KEY_STATE = 'finance:filterState';
const KEY_PRESETS = 'finance:filterPresets';

const LEGACY_KEY_STATE = '26-011-finanzplan:filterState';
const LEGACY_KEY_PRESETS = '26-011-finanzplan:filterPresets';

const DEFAULT_STATE: FilterState = {
  dateFrom: '',
  dateTo: '',
  counterparty: '',
  account: '',
  tags: '',
};

let appRef: App | null = null;

/** Wire the plugin's App so persistence uses vault-scoped App#*LocalStorage. */
export function setStorageApp(app: App): void {
  appRef = app;
}

function appStorage(app: App): StorageAdapter {
  return {
    getItem: (key) => {
      const v: unknown = app.loadLocalStorage(key);
      return typeof v === 'string' ? v : null;
    },
    setItem: (key, value) => { app.saveLocalStorage(key, value); },
    removeItem: (key) => { app.saveLocalStorage(key, null); },
  };
}

const NOOP_STORAGE: StorageAdapter = {
  getItem: () => null,
  setItem: () => { /* no-op until setStorageApp() */ },
  removeItem: () => { /* no-op */ },
};

function getStorage(): StorageAdapter {
  return appRef ? appStorage(appRef) : NOOP_STORAGE;
}

export function migrateLegacyKeys(storage: StorageAdapter = getStorage()): void {
  const legacyState = storage.getItem(LEGACY_KEY_STATE);
  if (legacyState !== null && storage.getItem(KEY_STATE) === null) {
    storage.setItem(KEY_STATE, legacyState);
  }
  if (legacyState !== null) storage.removeItem(LEGACY_KEY_STATE);

  const legacyPresets = storage.getItem(LEGACY_KEY_PRESETS);
  if (legacyPresets !== null && storage.getItem(KEY_PRESETS) === null) {
    storage.setItem(KEY_PRESETS, legacyPresets);
  }
  if (legacyPresets !== null) storage.removeItem(LEGACY_KEY_PRESETS);
}

/**
 * One-time migration vom früheren raw-localStorage-Backend auf App#*LocalStorage
 * (vault-scoped). Liest über `window.localStorage` (Member-Zugriff, NICHT der
 * restricted `localStorage`-Global) — so gehen bestehende finance:* / Legacy-
 * Presets nicht verloren. Auf Mobile/ohne window ein No-op.
 */
export function migrateRawLocalStorageToApp(storage: StorageAdapter = getStorage()): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const raw = window.localStorage;
  const move = (newKey: string, legacyKey: string): void => {
    if (storage.getItem(newKey) === null) {
      const val = raw.getItem(newKey) ?? raw.getItem(legacyKey);
      if (val !== null) storage.setItem(newKey, val);
    }
    raw.removeItem(newKey);
    raw.removeItem(legacyKey);
  };
  move(KEY_STATE, LEGACY_KEY_STATE);
  move(KEY_PRESETS, LEGACY_KEY_PRESETS);
}

export function loadState(storage: StorageAdapter = getStorage()): FilterState {
  const raw = storage.getItem(KEY_STATE);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return { ...DEFAULT_STATE, ...(parsed as Record<string, unknown>) };
    }
    return { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: FilterState, storage: StorageAdapter = getStorage()): void {
  storage.setItem(KEY_STATE, JSON.stringify(state));
}

function isPresetEntry(value: unknown): value is PresetEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === 'string' && typeof entry.state === 'object' && entry.state !== null;
}

export function loadPresets(storage: StorageAdapter = getStorage()): PresetEntry[] {
  const raw = storage.getItem(KEY_PRESETS);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPresetEntry);
  } catch {
    return [];
  }
}

export function savePreset(name: string, state: FilterState, storage: StorageAdapter = getStorage()): void {
  const presets = loadPresets(storage);
  const idx = presets.findIndex(p => p.name === name);
  if (idx >= 0) {
    presets[idx] = { name, state };
  } else {
    presets.push({ name, state });
  }
  storage.setItem(KEY_PRESETS, JSON.stringify(presets));
}

export function deletePreset(name: string, storage: StorageAdapter = getStorage()): void {
  const presets = loadPresets(storage).filter(p => p.name !== name);
  storage.setItem(KEY_PRESETS, JSON.stringify(presets));
}
