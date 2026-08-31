/**
 * Code Editor Live V3.0 — Command Palette
 * Ctrl+Shift+P command execution, Ctrl+P quick open.
 */
import type { IDEStore } from '../store/index';
import type { VFSController } from '../vfs/VFSController';
import type { TabController } from './TabController';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

export class CommandPalette {
  private dialog: HTMLDialogElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private commands: Command[] = [];
  private vfs: VFSController;
  private tabController: TabController;
  private isQuickOpen = false;
  private selectedIndex = 0;

  constructor(
    store: { getState: () => IDEStore },
    vfs: VFSController,
    tabController: TabController
  ) {
    this.dialog = document.getElementById('command-palette') as HTMLDialogElement;
    this.input = document.getElementById('palette-input') as HTMLInputElement;
    this.results = document.getElementById('palette-results')!;
    this.vfs = vfs;
    this.tabController = tabController;

    // Register built-in commands
    this.commands = [
      { id: 'toggle-sidebar', label: 'Toggle Sidebar', shortcut: '⌘B', category: 'View', action: () => store.getState().toggleSidebar() },
      { id: 'toggle-panel', label: 'Toggle Panel', shortcut: '⌘J', category: 'View', action: () => store.getState().togglePanel() },
      { id: 'explorer', label: 'Show Explorer', shortcut: '⌘⇧E', category: 'View', action: () => store.getState().setActiveView('explorer') },
      { id: 'search', label: 'Show Search', shortcut: '⌘⇧F', category: 'View', action: () => store.getState().setActiveView('search') },
      { id: 'git', label: 'Show Source Control', shortcut: '⌘⇧G', category: 'View', action: () => store.getState().setActiveView('git') },
      { id: 'console', label: 'Show Console', category: 'View', action: () => store.getState().setPanelTab('console') },
      { id: 'problems', label: 'Show Problems', category: 'View', action: () => store.getState().setPanelTab('problems') },
    ];

    // Input handler
    this.input.addEventListener('input', () => this.renderResults());

    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.moveSelection(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.moveSelection(-1); }
      if (e.key === 'Enter') { e.preventDefault(); this.executeSelected(); }
    });

    // Click outside to close
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.close();
    });

    // Result click
    this.results.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.palette-item') as HTMLElement | null;
      if (item) {
        this.selectedIndex = parseInt(item.dataset.index ?? '0');
        this.executeSelected();
      }
    });
  }

  toggle(): void {
    this.isQuickOpen = false;
    if (this.dialog.open) { this.close(); return; }
    this.input.placeholder = 'Type a command…';
    this.input.value = '';
    this.selectedIndex = 0;
    this.dialog.showModal();
    this.input.focus();
    this.renderResults();
  }

  toggleQuickOpen(): void {
    this.isQuickOpen = true;
    if (this.dialog.open) { this.close(); return; }
    this.input.placeholder = 'Search files…';
    this.input.value = '';
    this.selectedIndex = 0;
    this.dialog.showModal();
    this.input.focus();
    this.renderResults();
  }

  private close(): void {
    this.dialog.close();
  }

  private async renderResults(): Promise<void> {
    const query = this.input.value.toLowerCase();

    if (this.isQuickOpen) {
      // File search
      const files = await this.vfs.listFiles('/');
      const filtered = query
        ? files.filter((f) => f.toLowerCase().includes(query))
        : files;

      this.results.innerHTML = filtered.slice(0, 20).map((file, i) => {
        const name = file.split('/').pop() ?? file;
        const path = file;
        return `<div class="palette-item${i === this.selectedIndex ? ' selected' : ''}" data-index="${i}" data-file="${file}">
          <span>${name}</span>
          <span class="palette-shortcut" style="border:none;background:none;">${path}</span>
        </div>`;
      }).join('');
    } else {
      // Command search
      const filtered = query
        ? this.commands.filter((c) => c.label.toLowerCase().includes(query) || c.category.toLowerCase().includes(query))
        : this.commands;

      this.results.innerHTML = filtered.map((cmd, i) => `
        <div class="palette-item${i === this.selectedIndex ? ' selected' : ''}" data-index="${i}" data-cmd="${cmd.id}">
          <span style="color:var(--text-tertiary);font-size:11px;min-width:60px;">${cmd.category}</span>
          <span>${cmd.label}</span>
          ${cmd.shortcut ? `<span class="palette-shortcut">${cmd.shortcut}</span>` : ''}
        </div>
      `).join('');
    }
  }

  private moveSelection(delta: number): void {
    const items = this.results.querySelectorAll('.palette-item');
    this.selectedIndex = Math.max(0, Math.min(items.length - 1, this.selectedIndex + delta));
    items.forEach((item, i) => {
      (item as HTMLElement).classList.toggle('selected', i === this.selectedIndex);
    });
    items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private async executeSelected(): Promise<void> {
    if (this.isQuickOpen) {
      const item = this.results.querySelectorAll('.palette-item')[this.selectedIndex] as HTMLElement | null;
      const file = item?.dataset.file;
      if (file) {
        this.close();
        await this.tabController.openFile(file, this.vfs);
      }
    } else {
      const query = this.input.value.toLowerCase();
      const filtered = query
        ? this.commands.filter((c) => c.label.toLowerCase().includes(query))
        : this.commands;
      const cmd = filtered[this.selectedIndex];
      if (cmd) { this.close(); cmd.action(); }
    }
  }
}
