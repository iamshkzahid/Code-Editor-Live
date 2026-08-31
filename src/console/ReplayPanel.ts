import type { DebugReplay, ReplayStep } from '../product/DebugReplay';
import { IdentityVoice } from '../product/IdentityVoice';
import type { IDEStore } from '../store/index';
import type { EditorController } from '../editor/EditorController';
import type { TabController } from '../ui/TabController';
import type { VFSController } from '../vfs/VFSController';

type StoreApi = {
  getState: () => IDEStore;
  subscribe: (listener: () => void) => () => void;
};

export class ReplayPanel {
  private root: HTMLElement;
  private replay: DebugReplay;
  private editor: EditorController;
  private tabs: TabController;
  private vfs: VFSController;
  private unsubscribe: (() => void) | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private clickHandler: (event: Event) => void;

  constructor(
    root: HTMLElement,
    replay: DebugReplay,
    store: StoreApi,
    editor: EditorController,
    tabs: TabController,
    vfs: VFSController
  ) {
    this.root = root;
    this.replay = replay;
    this.editor = editor;
    this.tabs = tabs;
    this.vfs = vfs;
    this.root.className = 'replay-panel';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Debug Replay');
    this.clickHandler = (event) => this.handleClick(event);
    this.root.addEventListener('click', this.clickHandler);
    this.unsubscribe = replay.subscribe(() => this.render());
    this.storeUnsubscribe = store.subscribe(() => {
      if (store.getState().panelTab === 'replay') this.render();
    });
    this.render();
  }

  private render(): void {
    this.root.replaceChildren();

    const toolbar = document.createElement('div');
    toolbar.className = 'replay-toolbar';
    const title = document.createElement('h2');
    title.className = 'replay-title';
    title.textContent = 'Debug Replay';
    const exportButton = document.createElement('button');
    exportButton.className = 'replay-export';
    exportButton.type = 'button';
    exportButton.dataset.action = 'export';
    exportButton.textContent = 'Export Markdown';
    exportButton.title = 'Export debug replay as Markdown';
    toolbar.append(title, exportButton);

    const list = document.createElement('div');
    list.className = 'replay-list';
    list.setAttribute('aria-live', 'polite');
    const steps = this.replay.getSteps();
    if (steps.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'replay-empty';
      empty.textContent = IdentityVoice.emptyState('replay');
      list.appendChild(empty);
    } else {
      steps.forEach((step, index) => {
        list.appendChild(this.renderStep(step, index));
        if (index < steps.length - 1) {
          const connector = document.createElement('div');
          connector.className = 'replay-connector';
          connector.setAttribute('aria-hidden', 'true');
          connector.textContent = '↓';
          list.appendChild(connector);
        }
      });
    }

    this.root.append(toolbar, list);
  }

  private renderStep(step: ReplayStep, index: number): HTMLElement {
    const card = document.createElement('button');
    card.className = 'replay-step';
    card.type = 'button';
    card.dataset.stepIndex = String(index);
    card.disabled = !step.affectedFile || !step.affectedFile.startsWith('/');
    card.setAttribute('aria-label', `${step.event}${step.affectedFile ? `, open ${step.affectedFile}` : ''}`);

    const event = document.createElement('strong');
    event.className = 'replay-event';
    event.textContent = step.event;
    const state = document.createElement('span');
    state.className = 'replay-state';
    state.textContent = step.resultingState;
    card.append(event, state);

    if (step.affectedFile) {
      const location = document.createElement('span');
      location.className = 'replay-location';
      location.textContent = `${step.affectedFile}${step.line ? `:${step.line}` : ''}`;
      card.appendChild(location);
    }
    if (step.causalLink) {
      const why = document.createElement('span');
      why.className = 'replay-why';
      why.textContent = step.causalLink;
      card.appendChild(why);
    }
    return card;
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="export"]')) {
      this.exportMarkdown();
      return;
    }
    const stepButton = target.closest('[data-step-index]') as HTMLElement | null;
    if (!stepButton) return;
    const step = this.replay.getSteps()[Number(stepButton.dataset.stepIndex)];
    if (!step?.affectedFile) return;
    void this.tabs.openFile(step.affectedFile, this.vfs).then(() => {
      if (step.line) this.editor.jumpToLine(step.line);
    });
  }

  private exportMarkdown(): void {
    const url = URL.createObjectURL(new Blob([this.replay.toMarkdown()], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'debug-replay.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    this.root.removeEventListener('click', this.clickHandler);
  }
}
