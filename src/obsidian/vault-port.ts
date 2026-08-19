/**
 * Obsidian-Adapter für den `VaultPort` des Importer-Kerns.
 *
 * Bewusst über `vault.adapter` statt über `TFile`: der Importer schreibt
 * Dutzende Dateien, von denen viele noch nicht existieren — ein
 * `getAbstractFileByPath` würde dort jedes Mal `null` liefern. Der Adapter
 * arbeitet pfadbasiert und ist zugleich mobil-tauglich (kein `fs`, kein
 * `basePath`).
 *
 * Muster aus `vault-crews/src/obsidian/vault-port.ts`; jede Methode delegiert
 * 1:1, alle Pfade laufen durch `normalizePath`. Regeln und Grenzen leben im
 * Kern, nicht hier.
 */

import { normalizePath, type App } from "obsidian";
import type { VaultPort } from "../core/ports";

export class ObsidianVaultPort implements VaultPort {
	constructor(private readonly app: App) {}

	async read(path: string): Promise<string> {
		return this.app.vault.adapter.read(normalizePath(path));
	}

	async readBinary(path: string): Promise<ArrayBuffer> {
		return this.app.vault.adapter.readBinary(normalizePath(path));
	}

	async write(path: string, content: string): Promise<void> {
		const np = normalizePath(path);
		await this.ensureParent(np);
		await this.app.vault.adapter.write(np, content);
	}

	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		const np = normalizePath(path);
		await this.ensureParent(np);
		await this.app.vault.adapter.writeBinary(np, data);
	}

	async exists(path: string): Promise<boolean> {
		return this.app.vault.adapter.exists(normalizePath(path));
	}

	async mkdir(path: string): Promise<void> {
		const np = normalizePath(path);
		if (np === "" || np === "/" || (await this.app.vault.adapter.exists(np))) {
			return;
		}
		// adapter.mkdir ist nicht rekursiv — Elternkette selbst hochlaufen.
		const cut = np.lastIndexOf("/");
		if (cut > 0) {
			await this.mkdir(np.slice(0, cut));
		}
		await this.app.vault.adapter.mkdir(np);
	}

	async list(folder: string): Promise<string[]> {
		const np = normalizePath(folder);
		if (!(await this.app.vault.adapter.exists(np))) {
			return [];
		}
		const listing = await this.app.vault.adapter.list(np);
		// Sortiert, damit ein Import über zwei Läufe dieselbe Reihenfolge sieht —
		// bei gleichem Dedupe-Ergebnis darf die Journal-Reihenfolge nicht wackeln.
		return [...listing.files].sort();
	}

	async stat(path: string): Promise<{ mtime: number } | null> {
		const stat = await this.app.vault.adapter.stat(normalizePath(path));
		return stat ? { mtime: stat.mtime } : null;
	}

	private async ensureParent(normalizedPath: string): Promise<void> {
		const cut = normalizedPath.lastIndexOf("/");
		if (cut > 0) {
			await this.mkdir(normalizedPath.slice(0, cut));
		}
	}
}
