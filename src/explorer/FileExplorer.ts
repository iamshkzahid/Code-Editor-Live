/**
 * Code Editor Live V3.0 — File Explorer
 */
import type { VFSController } from '../vfs/VFSController';
import type { IDEStore } from '../store/index';
import type { TabController } from '../ui/TabController';

export class FileExplorer {
  private vfs: VFSController;
  private store: { getState: () => IDEStore };
  private tabController: TabController;
  private tree: HTMLElement;

  constructor(vfs: VFSController, store: { getState: () => IDEStore }, tabController: TabController) {
    this.vfs = vfs;
    this.store = store;
    this.tabController = tabController;
    this.tree = document.getElementById('file-tree')!;

    this.tree.addEventListener('click', async (e) => {
      const item = (e.target as HTMLElement).closest('.tree-item') as HTMLElement | null;
      if (!item) return;
      const filepath = item.dataset.path;
      if (filepath) {
        await this.tabController.openFile(filepath, this.vfs);
        this.highlightActive(filepath);
      }
    });
  }

  async refresh(): Promise<void> {
    const files = await this.vfs.listFiles('/');
    const activeTab = this.store.getState().activeTabId;

    this.tree.innerHTML = files.map((file) => {
      const name = file.split('/').pop() ?? file;
      const icon = this.getIcon(name);
      const isActive = file === activeTab;
      return `<li class="tree-item${isActive ? ' active' : ''}" data-path="${file}">
        ${icon}
        <span class="tree-item-name">${name}</span>
      </li>`;
    }).join('');
  }

  private highlightActive(filepath: string): void {
    this.tree.querySelectorAll('.tree-item').forEach((item) => {
      (item as HTMLElement).classList.toggle('active', (item as HTMLElement).dataset.path === filepath);
    });
  }

  private getIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const iconMap: Record<string, { color: string; label: string }> = {
      jsx: { color: '#61DAFB', label: 'JSX' },
      tsx: { color: '#3178C6', label: 'TSX' },
      js: { color: '#F7DF1E', label: 'JS' },
      ts: { color: '#3178C6', label: 'TS' },
      html: { color: '#E34F26', label: 'HTML' },
      css: { color: '#1572B6', label: 'CSS' },
      json: { color: '#A8A8A8', label: '{}' },
      py: { color: '#3776AB', label: 'PY' },
      md: { color: '#7B7B7B', label: 'MD' },
    };
    const info = iconMap[ext] ?? { color: 'var(--text-tertiary)', label: '📄' };
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="${info.color}" stroke-width="1.2"/><text x="8" y="11" text-anchor="middle" font-size="4.5" font-weight="600" fill="${info.color}">${info.label}</text></svg>`;
  }
}
