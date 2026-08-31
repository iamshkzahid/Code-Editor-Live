/**
 * Code Editor Live V3.0 — Tab Controller
 * Manages editor tabs with dirty state and file state preservation.
 */
import type { IDEStore, TabState } from '../store/index';
import type { EditorController } from '../editor/EditorController';
import type { VFSController } from '../vfs/VFSController';

export class TabController {
  private store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void };
  private editor: EditorController;
  private tabBar: HTMLElement;

  constructor(
    store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void },
    editor: EditorController
  ) {
    this.store = store;
    this.editor = editor;
    this.tabBar = document.getElementById('tab-bar')!;

    // Re-render tabs on state change
    store.subscribe(() => this.renderTabs());

    // Handle tab clicks
    this.tabBar.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest('.tab') as HTMLElement | null;
      if (!tab) return;
      const id = tab.dataset.id;
      if (!id) return;

      // Close button
      if ((e.target as HTMLElement).closest('.tab-close')) {
        this.store.getState().closeTab(id);
        return;
      }

      // Switch tab
      this.switchToTab(id);
    });

    // Middle-click to close
    this.tabBar.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const tab = (e.target as HTMLElement).closest('.tab') as HTMLElement | null;
      if (tab?.dataset.id) this.store.getState().closeTab(tab.dataset.id);
    });
  }

  async openFile(filepath: string, vfs: VFSController): Promise<void> {
    const filename = filepath.split('/').pop() ?? filepath;
    const ext = filepath.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      html: 'html', css: 'css', json: 'json', py: 'python', md: 'markdown',
    };

    const tab: TabState = {
      id: filepath,
      filename,
      filepath,
      dirty: false,
      language: langMap[ext] ?? 'text',
    };

    this.store.getState().openTab(tab);

    // Load file content and open in editor
    const content = await vfs.readFile(filepath);
    this.editor.openFile(filepath, content);
    this.updateBreadcrumbs(filepath);
  }

  switchToTab(id: string): void {
    const state = this.store.getState();
    const tab = state.openTabs.find((t) => t.id === id);
    if (!tab) return;
    state.setActiveTab(id);
    // Re-open file in editor (state is cached)
    this.editor.openFile(tab.filepath, ''); // Content comes from cache
    this.updateBreadcrumbs(tab.filepath);
  }

  async saveActive(vfs: VFSController): Promise<void> {
    const state = this.store.getState();
    if (!state.activeTabId) return;
    const content = this.editor.getContent();
    const tab = state.openTabs.find((t) => t.id === state.activeTabId);
    if (!tab) return;
    await vfs.writeFile(tab.filepath, content);
    state.markTabDirty(tab.id, false);
  }

  private updateBreadcrumbs(filepath: string): void {
    const breadcrumbs = document.getElementById('breadcrumbs');
    if (!breadcrumbs) return;
    const segments = filepath.split('/').filter(Boolean);
    breadcrumbs.innerHTML = segments.map((seg, i) => {
      const isCurrent = i === segments.length - 1;
      return `<span class="breadcrumb-segment${isCurrent ? ' current' : ''}">${seg}</span>${
        isCurrent ? '' : '<span class="breadcrumb-sep">›</span>'
      }`;
    }).join('');
  }

  private renderTabs(): void {
    const state = this.store.getState();
    this.tabBar.innerHTML = state.openTabs.map((tab) => {
      const isActive = tab.id === state.activeTabId;
      const icon = this.getFileIcon(tab.filename);
      return `
        <button class="tab${isActive ? ' active' : ''}" data-id="${tab.id}" role="tab" aria-selected="${isActive}" title="${tab.filepath}">
          <span class="tab-icon">${icon}</span>
          <span class="tab-label">${tab.filename}</span>
          ${tab.dirty ? '<span class="tab-dirty"></span>' : ''}
          <span class="tab-close" aria-label="Close ${tab.filename}">×</span>
        </button>
      `;
    }).join('');
  }

  private getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const colors: Record<string, string> = {
      jsx: '#61DAFB', tsx: '#3178C6', js: '#F7DF1E', ts: '#3178C6',
      html: '#E34F26', css: '#1572B6', json: '#A8A8A8', py: '#3776AB',
      md: '#7B7B7B',
    };
    const color = colors[ext] ?? 'var(--text-tertiary)';
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="${color}" stroke-width="1.2"/><text x="8" y="11" text-anchor="middle" font-size="5" font-weight="600" fill="${color}">${ext.toUpperCase().slice(0, 3)}</text></svg>`;
  }
}
