/**
 * Problems Panel — DiagnosticEngine-integrated debugging surface (Phase 5B).
 */
import type { DiagnosticEngine, DiagnosticRecord } from '../core/DiagnosticEngine';
import type { EditorController } from '../editor/EditorController';
import type { TabController } from '../ui/TabController';
import type { VFSController } from '../vfs/VFSController';
import type { IDEStore } from '../store/index';
import type { SourceMapResolver } from '../build/SourceMapResolver';
import { explainDiagnostic, groupByFile } from '../product/Explainability';
import { IdentityVoice } from '../product/IdentityVoice';
import type { FlowEngine } from '../product/FlowEngine';

type StoreApi = {
  getState: () => IDEStore;
  subscribe: (fn: () => void) => () => void;
};

export class ProblemsPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private status: HTMLElement;
  private engine: DiagnosticEngine;
  private store: StoreApi;
  private editor: EditorController;
  private tabs: TabController;
  private vfs: VFSController;
  private sourceMaps: SourceMapResolver;
  private flow: FlowEngine | undefined;
  private renderQueued = false;
  private orderedIds: string[] = [];
  private focusIndex = -1;
  private expandedIds = new Set<string>();
  private disposed = false;
  private renderGeneration = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  private clickHandler: (e: Event) => void;
  private engineUnsubscribe: (() => void) | null = null;
  private storeUnsubscribe: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    engine: DiagnosticEngine,
    store: StoreApi,
    editor: EditorController,
    tabs: TabController,
    vfs: VFSController,
    sourceMaps: SourceMapResolver,
    flow?: FlowEngine
  ) {
    this.root = root;
    this.engine = engine;
    this.store = store;
    this.editor = editor;
    this.tabs = tabs;
    this.vfs = vfs;
    this.sourceMaps = sourceMaps;
    this.flow = flow;

    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Problems');
    this.root.className = 'problems-panel';

    this.status = document.createElement('div');
    this.status.className = 'problems-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.setAttribute('aria-atomic', 'true');

    this.list = document.createElement('div');
    this.list.className = 'problems-list';

    this.root.append(this.status, this.list);

    this.clickHandler = (e) => this.handleClick(e);
    this.list.addEventListener('click', this.clickHandler);

    this.keyHandler = (e) => this.handleKeydown(e);
    document.addEventListener('keydown', this.keyHandler);

    this.engineUnsubscribe = engine.subscribe(() => {
      this.requestRender();
    });

    this.storeUnsubscribe = store.subscribe(() => {
      if (store.getState().panelTab === 'problems') this.requestRender();
    });

    void this.render();
  }

  private requestRender(): void {
    if (this.disposed || this.renderQueued) return;
    if (!this.flow?.shouldSuppressNonEssential() || this.flow.isCritical()) {
      void this.render();
      return;
    }
    this.renderQueued = true;
    this.flow.deferNonCritical(() => {
      this.renderQueued = false;
      if (!this.disposed) void this.render();
    });
  }

  private getActiveFile(): string | null {
    const state = this.store.getState();
    const tab = state.openTabs.find((t) => t.id === state.activeTabId);
    return tab?.filepath ?? this.editor.getCurrentFile();
  }

  private getVisibleRecords(): DiagnosticRecord[] {
    const buildGen = this.engine.getBuildGeneration();
    return this.engine.getOrdered(this.getActiveFile()).filter((r) => {
      if (r.source === 'runtime') return true;
      if (r.buildGeneration == null) return true;
      return r.buildGeneration === buildGen;
    });
  }

  private async render(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.renderGeneration;

    const records = this.getVisibleRecords();
    this.orderedIds = records.map((r) => r.id);

    if (records.length === 0) {
      this.list.replaceChildren();
      this.status.textContent = IdentityVoice.emptyState('problems');
      this.status.hidden = false;
      return;
    }

    this.status.hidden = true;
    const activeFile = this.getActiveFile();
    const groups = groupByFile(records, activeFile);
    const fragment = document.createDocumentFragment();

    for (const [file, items] of groups) {
      const groupEl = document.createElement('section');
      groupEl.className = 'problem-group';
      groupEl.setAttribute('aria-label', file === '(no file)' ? 'Problems without file' : file);

      const heading = document.createElement('h3');
      heading.className = 'problem-group-title';
      heading.textContent = file === '(no file)' ? 'General' : file;
      groupEl.appendChild(heading);

      const groupList = document.createElement('div');
      groupList.className = 'problem-group-list';
      groupList.setAttribute('role', 'list');

      for (const record of items) {
        if (generation !== this.renderGeneration || this.disposed) return;
        groupList.appendChild(this.renderProblemCard(record));
      }

      groupEl.appendChild(groupList);

      fragment.appendChild(groupEl);
    }

    if (generation !== this.renderGeneration || this.disposed) return;
    this.list.replaceChildren(fragment);
    this.applyFocusRing();
  }

  private renderProblemCard(record: DiagnosticRecord): HTMLElement {
    const explained = explainDiagnostic(record);
    const card = document.createElement('div');
    card.className = 'problem-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = record.id;
    card.tabIndex = 0;
    card.setAttribute('aria-labelledby', `problem-headline-${record.id}`);

    const severity = document.createElement('span');
    severity.className = `problem-severity problem-severity-${record.severity}`;
    severity.textContent = record.severity;
    severity.setAttribute('aria-hidden', 'true');

    const headline = document.createElement('p');
    headline.className = 'problem-headline';
    headline.id = `problem-headline-${record.id}`;
    headline.setAttribute('role', 'heading');
    headline.setAttribute('aria-level', '4');
    headline.textContent = IdentityVoice.problemFound({
      headline: explained.headline,
      technicalMessage: explained.technicalMessage,
      file: record.file,
      line: record.line,
      col: record.col,
      source: record.source,
    });

    const explanation = document.createElement('p');
    explanation.className = 'problem-explanation';
    explanation.textContent = explained.explanation;

    const why = document.createElement('p');
    why.className = 'problem-why';
    const whyHeading = document.createElement('strong');
    whyHeading.textContent = IdentityVoice.whyShowing();
    why.append(whyHeading, document.createTextNode(` ${explained.whyShowing}`));

    const location = document.createElement('p');
    location.className = 'problem-location';
    const locParts = [record.file, record.line, record.col].filter((v) => v != null).join(':');
    location.textContent = locParts ? `Location: ${locParts}` : 'Location: not available';

    const actions = document.createElement('div');
    actions.className = 'problem-actions';

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'problem-action-primary';
    primary.textContent = explained.nextAction.label;
    primary.dataset.action = 'open';
    primary.dataset.id = record.id;

    const detailsToggle = document.createElement('button');
    detailsToggle.type = 'button';
    detailsToggle.className = 'problem-action-secondary';
    detailsToggle.textContent = this.expandedIds.has(record.id) ? 'Hide technical detail' : 'Show technical detail';
    detailsToggle.dataset.action = 'toggle-detail';
    detailsToggle.dataset.id = record.id;
    detailsToggle.setAttribute('aria-expanded', String(this.expandedIds.has(record.id)));

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'problem-action-secondary';
    dismiss.textContent = 'Dismiss';
    dismiss.dataset.action = 'dismiss';
    dismiss.dataset.id = record.id;

    actions.append(primary, detailsToggle, dismiss);

    const technical = document.createElement('pre');
    technical.className = 'problem-technical';
    technical.id = `problem-technical-${record.id}`;
    technical.hidden = !this.expandedIds.has(record.id);
    const techLines = [
      explained.technicalMessage,
      record.code ? `Code: ${record.code}` : null,
      record.stack ? `Stack:\n${record.stack}` : null,
    ].filter(Boolean);
    technical.textContent = techLines.join('\n\n');
    technical.setAttribute('aria-label', 'Technical diagnostic detail');

    card.append(severity, headline, explanation, why, location, actions, technical);
    return card;
  }

  private applyFocusRing(): void {
    this.list.querySelectorAll('.problem-card').forEach((el, idx) => {
      el.classList.toggle('focused', idx === this.focusIndex);
      if (idx === this.focusIndex) {
        (el as HTMLElement).focus({ preventScroll: true });
      }
    });
  }

  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!id) return;

    if (action === 'open') {
      void this.openProblem(id);
    } else if (action === 'toggle-detail') {
      if (this.expandedIds.has(id)) this.expandedIds.delete(id);
      else this.expandedIds.add(id);
      void this.render();
    } else if (action === 'dismiss') {
      this.engine.dismiss(id);
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (this.disposed) return;
    const state = this.store.getState();
    if (!state.panelVisible || state.panelTab !== 'problems') return;

    const target = e.target;
    const active = document.activeElement;
    const contextEl =
      active instanceof HTMLElement
        ? active
        : target instanceof HTMLElement
          ? target
          : null;
    if (contextEl) {
      const inEditor = contextEl.closest('.cm-editor');
      const inInput =
        contextEl.tagName === 'INPUT' ||
        contextEl.tagName === 'TEXTAREA' ||
        contextEl.isContentEditable;
      if (inEditor || inInput) return;
    }

    if (e.key === 'F8' && !e.shiftKey) {
      e.preventDefault();
      this.focusNext();
    } else if (e.key === 'F8' && e.shiftKey) {
      e.preventDefault();
      this.focusPrevious();
    } else if (e.key === 'Enter' && contextEl?.closest('.problem-card')) {
      e.preventDefault();
      const id = contextEl.closest('.problem-card')?.getAttribute('data-id');
      if (id) void this.openProblem(id);
    } else if (e.key === 'Escape' && contextEl?.closest('.problem-card')) {
      e.preventDefault();
      this.focusIndex = -1;
      this.applyFocusRing();
    }
  }

  private focusNext(): void {
    if (this.orderedIds.length === 0) return;
    this.focusIndex = (this.focusIndex + 1) % this.orderedIds.length;
    this.applyFocusRing();
    this.announceFocus();
  }

  private focusPrevious(): void {
    if (this.orderedIds.length === 0) return;
    this.focusIndex =
      this.focusIndex <= 0 ? this.orderedIds.length - 1 : this.focusIndex - 1;
    this.applyFocusRing();
    this.announceFocus();
  }

  private announceFocus(): void {
    const id = this.orderedIds[this.focusIndex];
    const record = this.engine.getById(id);
    if (!record) return;
    const explained = explainDiagnostic(record);
    this.status.hidden = false;
    this.status.textContent = `${explained.headline} — ${explained.nextAction.label}`;
  }

  async openProblem(id: string): Promise<void> {
    if (this.disposed) return;
    const record = this.engine.getById(id);
    if (!record) return;

    let file = record.file;
    let line = record.line ?? 1;
    let col = record.col;
    let limitation: string | undefined;

    if (record.source === 'runtime') {
      const resolved = this.sourceMaps.resolveRuntime(record.file, line, col);
      if (resolved.resolved && resolved.file && resolved.file.startsWith('/')) {
        file = resolved.file;
        line = resolved.line;
        col = resolved.col;
      }
      if (!resolved.resolved) limitation = resolved.limitation;
    }

    if (!file || !file.startsWith('/')) {
      this.status.hidden = false;
      this.status.textContent = IdentityVoice.sourceLocationUnavailable(limitation);
      return;
    }

    const exists = await this.vfs.fileExists(file).catch(() => false);
    if (!exists) {
      this.status.hidden = false;
      this.status.textContent = IdentityVoice.fileUnavailable(file);
      return;
    }

    await this.tabs.openFile(file, this.vfs);

    const jumped = this.editor.jumpToLine(line, col);
    if (!jumped) {
      this.status.hidden = false;
      this.status.textContent = IdentityVoice.navigationFailed(file, line);
      return;
    }

    if (limitation) {
      this.status.hidden = false;
      this.status.textContent = IdentityVoice.sourceLocationUnavailable(limitation);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.engineUnsubscribe?.();
    this.engineUnsubscribe = null;
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    this.list.removeEventListener('click', this.clickHandler);
    document.removeEventListener('keydown', this.keyHandler);
    this.root.replaceChildren();
  }
}
