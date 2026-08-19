import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n/strings';

class PromptModal extends Modal {
  private done: ((value: string | null) => void) | null;
  private inputEl!: HTMLInputElement;

  constructor(
    app: App,
    private message: string,
    private defaultValue: string,
    done: (value: string | null) => void,
  ) {
    super(app);
    this.done = done;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('p', { text: this.message });
    this.inputEl = contentEl.createEl('input', { type: 'text', value: this.defaultValue, cls: 'fl-field-block' });
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.finish(this.inputEl.value);
      else if (e.key === 'Escape') this.finish(null);
    });
    new Setting(contentEl)
      .addButton(b => b.setButtonText(t('common.ok')).setCta().onClick(() => this.finish(this.inputEl.value)))
      .addButton(b => b.setButtonText(t('common.cancel')).onClick(() => this.finish(null)));
    this.inputEl.focus();
    this.inputEl.select();
  }

  onClose(): void {
    this.finish(null);
  }

  private finish(value: string | null): void {
    if (!this.done) return;
    const cb = this.done;
    this.done = null;
    cb(value);
    this.close();
  }
}

export function promptText(app: App, message: string, defaultValue = ''): Promise<string | null> {
  return new Promise(resolve => new PromptModal(app, message, defaultValue, resolve).open());
}
