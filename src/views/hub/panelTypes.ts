import type { HubController as KitHubController, HubPanel } from '../../vendor/kit-obsidian/hub';

export type FinanceTabId = 'dashboard' | 'ledger' | 'category' | 'saldo' | 'tbc';

/**
 * A single function inside the finance hub. Mounted once into its container;
 * tab switches only toggle visibility (mount-once pattern, UI-STANDARD §4).
 *
 * Alias des Kit-Typs (obsidian-kit@0.27.0, obsidian/hub.ts) — die lokale Fassung war
 * seine Teilmenge. `onFileOpen` kommt damit als optionaler Zusatz mit; hier ungenutzt.
 */
export type FinancePanel = HubPanel<FinanceTabId>;

/** Narrow navigation channel handed to panels that jump to another tab.
 *  Repo-eigen — im Kit gibt es dafuer kein Gegenstueck. */
export type HubNavigate = (tabId: FinanceTabId) => void;

/** Alias des Kit-Steuerkanals. Zusaetzlich zur lokalen Fassung: `notifyFileOpen`. */
export type HubController = KitHubController<FinanceTabId>;
