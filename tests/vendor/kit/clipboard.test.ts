// Waechter ueber vendorten Code (obsidian-kit@0.27.0, src/pure/clipboard.ts).
// Der Grund fuers Vendoring steht in TBCPanel.ts:41 — bis dahin stand die Erfolgs-Notice
// unbedingt neben `void navigator.clipboard.writeText(...)`, der Nutzer las also "Kopiert!"
// auch bei leerer Zwischenablage. Diese Faelle nageln genau die Zusage fest, auf die sich
// der Knopf jetzt verlaesst: onCopied laeuft NUR nach erfolgreichem Schreiben.
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../../../src/vendor/kit/clipboard";

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function setClipboard(writeText: unknown): void {
	Object.defineProperty(globalThis, "navigator", {
		value: { clipboard: writeText === undefined ? undefined : { writeText } },
		configurable: true,
	});
}

afterEach(() => {
	if (original) Object.defineProperty(globalThis, "navigator", original);
	else Reflect.deleteProperty(globalThis as object, "navigator");
});

describe("writeClipboard", () => {
	it("meldet Erfolg erst nach erfolgreichem Schreiben", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const onCopied = vi.fn();
		setClipboard(writeText);

		await expect(writeClipboard("befehl", { onCopied })).resolves.toBe(true);

		expect(writeText).toHaveBeenCalledWith("befehl");
		expect(onCopied).toHaveBeenCalledTimes(1);
	});

	it("meldet KEINEN Erfolg, wenn writeText ablehnt", async () => {
		const onCopied = vi.fn();
		const onFailed = vi.fn();
		setClipboard(vi.fn().mockRejectedValue(new Error("not focused")));

		await expect(writeClipboard("befehl", { onCopied, onFailed })).resolves.toBe(false);

		expect(onCopied).not.toHaveBeenCalled();
		expect(onFailed).toHaveBeenCalledTimes(1);
		expect(onFailed.mock.calls[0][0]).toBe("denied");
	});

	it("meldet KEINEN Erfolg, wenn es gar keine Clipboard-API gibt", async () => {
		const onCopied = vi.fn();
		const onFailed = vi.fn();
		setClipboard(undefined);

		await expect(writeClipboard("befehl", { onCopied, onFailed })).resolves.toBe(false);

		expect(onCopied).not.toHaveBeenCalled();
		expect(onFailed.mock.calls[0][0]).toBe("unavailable");
	});
});
