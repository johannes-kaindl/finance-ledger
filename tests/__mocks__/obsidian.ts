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

/**
 * Minimal, damit `src/vendor/kit-obsidian/folder-suggest.ts` (Kit-Walker-Abhängigkeit,
 * Welle 3) beim Modul-Laden nicht an einem `extends undefined` scheitert — der Walker
 * importiert sie unbedingt, auch wenn kein Consumer einen `type: 'folder'`-Control
 * einsetzt. Nie tatsächlich instanziiert in den Tests dieses Repos, deshalb genügt der
 * Rumpf ohne echte Vorschlags-Logik (Vorbild: `3d-codeblocks/tests/__mocks__/obsidian.ts`).
 */
export class AbstractInputSuggest<T> {
  app: unknown;
  inputEl: HTMLInputElement;
  constructor(app: unknown, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
  }
  getSuggestions(_query: string): T[] { return []; }
  renderSuggestion(_value: T, _el: unknown): void {}
  selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
  setValue(_value: string): void {}
  close(): void {}
}

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

class ExtraButtonComponent {
  iconName = '';
  tooltip = '';
  clickCB: (() => void) | null = null;
  setIcon(i: string): this { this.iconName = i; return this; }
  setTooltip(t: string): this { this.tooltip = t; return this; }
  onClick(cb: () => void): this { this.clickCB = cb; return this; }
}

export class Setting {
  /** Aufgezeichnet, damit Tests belegen koennen, WAS an den Knoepfen einer Zeile haengt. */
  components: Array<ButtonComponent | ExtraButtonComponent> = [];
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
  /** Obsidian markiert Abschnitts-Ueberschriften mit dieser Klasse am settingEl —
   *  ueber sie zaehlt ein Test die Abschnitte eines Tabs. */
  setHeading(): this { this.settingEl.addClass('setting-item-heading'); return this; }
  setDesc(d: string): this { this.descEl.setText(d); return this; }
  addText(cb: (t: TextComponent) => void): this { cb(new TextComponent(this.controlEl)); return this; }
  addDropdown(cb: (d: DropdownComponent) => void): this { cb(new DropdownComponent(this.controlEl)); return this; }
  addButton(cb: (b: ButtonComponent) => void): this { const b = new ButtonComponent(this.controlEl); this.components.push(b); cb(b); return this; }
  addExtraButton(cb: (b: ExtraButtonComponent) => void): this { const b = new ExtraButtonComponent(); this.components.push(b); cb(b); return this; }
}

type FakeElOpts = {
  text?: string;
  value?: string;
  cls?: string;
  type?: string;
  /** Obsidians createEl/createDiv/createSpan setzen Attribute ueber diese Option.
   *  Der Mock liess sie bis zum Kit-0.27.0-Vendoring fallen — buildHubInto setzt
   *  `data-tab` genau so (statt per setAttribute), und `el.attrs['data-tab']` blieb
   *  dadurch undefined. Wer das nicht mitzieht, haelt einen Mock-Defekt fuer einen
   *  Kit-Fehler. */
  attr?: Record<string, string>;
};

export function makeFakeEl(tag: string, opts?: FakeElOpts) {
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
    attrs: { ...(opts?.attr ?? {}) } as Record<string, string>,
    createEl(childTag: string, childOpts?: Record<string, unknown>) {
      const child = makeFakeEl(childTag, childOpts as FakeElOpts);
      (el.children as unknown[]).push(child);
      return child;
    },
    createDiv(divOpts?: FakeElOpts) {
      const child = makeFakeEl('div', divOpts);
      (el.children as unknown[]).push(child);
      return child;
    },
    createSpan(spanOpts?: FakeElOpts) {
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


/** Minimaler PluginSettingTab: Obsidian setzt `containerEl` selbst, Tests setzen es
 *  danach auf ein FakeEl. Mehr braucht die Basisklasse nicht. */
export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: FakeEl = makeFakeEl('div');
  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
  }
  display(): void {}
  hide(): void {}
}
