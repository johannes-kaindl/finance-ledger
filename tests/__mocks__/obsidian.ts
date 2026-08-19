import { vi } from 'vitest';

export class Modal {
  app: unknown;
  contentEl: ReturnType<typeof makeFakeEl>;
  constructor(app: unknown) {
    this.app = app;
    this.contentEl = makeFakeEl('div');
  }
  close() {}
}

export class ItemView {
  app: unknown;
  containerEl: ReturnType<typeof makeFakeEl>;
  leaf: unknown;
  constructor(leaf: unknown) {
    this.leaf = leaf;
    this.app = (leaf as { app?: unknown })?.app ?? {};
    // Obsidian: containerEl.children[0] = nav header, children[1] = content
    this.containerEl = makeFakeEl('div');
    (this.containerEl.children as unknown[]).push(makeFakeEl('div'));
    (this.containerEl.children as unknown[]).push(makeFakeEl('div'));
  }
  getViewType(): string { return 'unknown'; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export type WorkspaceLeaf = unknown;

export function normalizePath(p: string): string { return p; }

export class TAbstractFile { path = ''; name = ''; }
export class TFile extends TAbstractFile { extension = ''; }
export class TFolder extends TAbstractFile { children: TAbstractFile[] = []; }

export const Notice = vi.fn();

/**
 * Obsidians parseYaml, für Tests auf JSON eingedampft.
 *
 * YAML ist eine Obermenge von JSON, also sind JSON-Fixtures gültige Eingaben.
 * Der echte Parser ist Obsidian-API und nicht unser Code — getestet wird hier,
 * was der Adapter mit dem Ergebnis macht, nicht das Parsen selbst.
 */
export function parseYaml(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function setIcon(el: { setAttribute(k: string, v: string): void }, icon: string): void {
  el.setAttribute('data-icon', icon);
}

// Mutable Platform-Mock: Tests können isMobile/isDesktop pro-Test toggeln.
// Default = Desktop, damit bestehende Tests unverändert grün bleiben.
export const Platform = {
  isMobile: false,
  isDesktop: true,
};

// ── Settings API (minimal, faithful to real Obsidian for unit tests) ──────
type FakeEl = ReturnType<typeof makeFakeEl>;

class TextComponent {
  inputEl: FakeEl;
  constructor(containerEl: FakeEl) {
    this.inputEl = containerEl.createEl('input', { type: 'text' });
  }
  setValue(v: string): this { this.inputEl.value = v; return this; }
  getValue(): string { return this.inputEl.value as string; }
  setPlaceholder(p: string): this { (this.inputEl as Record<string, unknown>).placeholder = p; return this; }
  onChange(cb: (v: string) => void): this { this.inputEl.oninput = () => cb(this.inputEl.value as string); return this; }
}

class DropdownComponent {
  selectEl: FakeEl;
  constructor(containerEl: FakeEl) {
    this.selectEl = containerEl.createEl('select');
  }
  addOption(value: string, text: string): this { this.selectEl.createEl('option', { value, text }); return this; }
  setValue(v: string): this { this.selectEl.value = v; return this; }
  getValue(): string { return this.selectEl.value as string; }
  onChange(cb: (v: string) => void): this { this.selectEl.onchange = () => cb(this.selectEl.value as string); return this; }
}

class ButtonComponent {
  buttonEl: FakeEl;
  constructor(containerEl: FakeEl) {
    this.buttonEl = containerEl.createEl('button');
  }
  setButtonText(t: string): this { this.buttonEl.setText(t); return this; }
  setCta(): this { this.buttonEl.addClass('mod-cta'); return this; }
  setWarning(): this { this.buttonEl.addClass('mod-warning'); return this; }
  onClick(cb: () => void): this { this.buttonEl.onclick = cb; return this; }
}

export class Setting {
  settingEl: FakeEl;
  infoEl: FakeEl;
  nameEl: FakeEl;
  descEl: FakeEl;
  controlEl: FakeEl;
  constructor(containerEl: FakeEl) {
    this.settingEl = containerEl.createDiv({ cls: 'setting-item' });
    this.infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.nameEl = this.infoEl.createDiv({ cls: 'setting-item-name' });
    this.descEl = this.infoEl.createDiv({ cls: 'setting-item-description' });
    this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
  }
  setName(n: string): this { this.nameEl.setText(n); return this; }
  setDesc(d: string): this { this.descEl.setText(d); return this; }
  addText(cb: (t: TextComponent) => void): this { cb(new TextComponent(this.controlEl)); return this; }
  addDropdown(cb: (d: DropdownComponent) => void): this { cb(new DropdownComponent(this.controlEl)); return this; }
  addButton(cb: (b: ButtonComponent) => void): this { cb(new ButtonComponent(this.controlEl)); return this; }
}

export function makeFakeEl(tag: string, opts?: { text?: string; value?: string; cls?: string; type?: string }) {
  const el: Record<string, unknown> = {
    tag,
    text: opts?.text ?? '',
    value: opts?.value ?? '',
    cls: opts?.cls ?? '',
    className: opts?.cls ?? '',
    textContent: opts?.text ?? '',
    title: '',
    style: { cssText: '', setProperty() { /* no-op */ } },
    id: '',
    children: [] as unknown[],
    rows: [] as unknown[],
    dataset: {} as Record<string, string>,
    disabled: false,
    oninput: null as unknown,
    onclick: null as unknown,
    selected: false,
    attrs: {} as Record<string, string>,
    createEl(childTag: string, childOpts?: Record<string, unknown>) {
      const child = makeFakeEl(childTag, childOpts as { text?: string; value?: string; cls?: string });
      (el.children as unknown[]).push(child);
      return child;
    },
    createDiv(divOpts?: { cls?: string }) {
      const child = makeFakeEl('div', divOpts);
      (el.children as unknown[]).push(child);
      return child;
    },
    createSpan(spanOpts?: { text?: string; cls?: string }) {
      const child = makeFakeEl('span', spanOpts);
      (el.children as unknown[]).push(child);
      return child;
    },
    createTHead() {
      const child = makeFakeEl('thead');
      (el.children as unknown[]).push(child);
      return child;
    },
    createTBody() {
      const child = makeFakeEl('tbody');
      (el.children as unknown[]).push(child);
      return child;
    },
    insertRow() {
      const row = makeFakeEl('tr');
      (el.children as unknown[]).push(row);
      (el.rows as unknown[]).push(row);
      return row;
    },
    setText(t: string) { el.text = t; el.textContent = t; },
    empty() { (el.children as unknown[]).length = 0; },
    setAttribute(key: string, val: string) { (el.attrs as Record<string, string>)[key] = val; },
    addClass(...cs: string[]) { for (const c of cs) { el.cls = `${el.cls as string} ${c}`.trim(); } el.className = el.cls; },
    addClasses(cs: string[]) { for (const c of cs) { el.cls = `${el.cls as string} ${c}`.trim(); } el.className = el.cls; },
    removeClass(...cs: string[]) {
      const rm = new Set(cs);
      el.cls = (el.cls as string).split(/\s+/).filter(x => x && !rm.has(x)).join(' ');
      el.className = el.cls;
    },
    toggleClass(c: string, on: boolean) {
      const has = (el.cls as string).split(/\s+/).includes(c);
      if (on && !has) { el.cls = `${el.cls as string} ${c}`.trim(); }
      else if (!on && has) { el.cls = (el.cls as string).split(/\s+/).filter(x => x !== c).join(' '); }
      el.className = el.cls;
    },
    addEventListener() { /* no-op */ },
    removeEventListener() { /* no-op */ },
  };
  return el;
}
