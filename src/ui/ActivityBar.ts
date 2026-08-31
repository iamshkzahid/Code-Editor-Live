/**
 * Code Editor Live V3.0 — Activity Bar Controller
 */
import type { IDEStore, SidebarView } from '../store/index';

export class ActivityBar {
  constructor(store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void }) {
    const bar = document.getElementById('activity-bar')!;
    const sidebar = document.getElementById('sidebar')!;

    // Click handlers for view switching
    bar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.activity-btn') as HTMLElement | null;
      if (!btn || btn.id === 'settings-btn') return;
      const view = btn.dataset.view as SidebarView | undefined;
      if (!view) return;

      const state = store.getState();
      if (state.activeView === view && state.sidebarVisible) {
        store.getState().toggleSidebar();
      } else {
        store.getState().setActiveView(view);
      }
    });

    // Double-click to toggle sidebar
    bar.addEventListener('dblclick', (e) => {
      const btn = (e.target as HTMLElement).closest('.activity-btn');
      if (btn && !btn.id) store.getState().toggleSidebar();
    });

    // React to state changes
    store.subscribe(() => {
      const state = store.getState();

      // Update active button
      bar.querySelectorAll('.activity-btn[data-view]').forEach((btn) => {
        const el = btn as HTMLElement;
        el.classList.toggle('active', el.dataset.view === state.activeView && state.sidebarVisible);
      });

      // Toggle sidebar visibility
      sidebar.classList.toggle('collapsed', !state.sidebarVisible);

      // Update sidebar width in grid
      const app = document.getElementById('app')!;
      if (state.sidebarVisible) {
        app.style.gridTemplateColumns = `var(--activity-bar-width) ${state.sidebarWidth}px 1fr`;
      } else {
        app.style.gridTemplateColumns = `var(--activity-bar-width) 0px 1fr`;
      }

      // Show/hide sidebar views
      document.querySelectorAll('.sidebar-view').forEach((view) => {
        const el = view as HTMLElement;
        const viewId = el.id.replace('view-', '');
        el.classList.toggle('active', viewId === state.activeView);
      });
    });

    // Settings button
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      // TODO: Open settings modal
    });
  }
}
