/**
 * Code Editor Live V3.0 — Split Controller
 * Production splitter with pointer capture, rAF, and drag shield.
 */
import type { IDEStore } from '../store/index';

export class SplitController {
  private store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void };

  constructor(store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void }) {
    this.store = store;
    this.initVerticalSplitter();
    this.initHorizontalSplitter();

    // React to panel state changes
    store.subscribe(() => {
      const s = store.getState();
      const panel = document.getElementById('panel')!;
      panel.classList.toggle('collapsed', !s.panelVisible);
      if (s.panelVisible) {
        panel.style.height = `${s.panelHeight}px`;
      }
    });
  }

  applyLayout(): void {
    const s = this.store.getState();
    const editorPane = document.getElementById('editor-pane')!;
    const previewPane = document.getElementById('preview-pane')!;
    const panel = document.getElementById('panel')!;

    editorPane.style.flex = `${s.editorPreviewRatio * 10}`;
    previewPane.style.flex = `${(1 - s.editorPreviewRatio) * 10}`;
    panel.style.height = `${s.panelHeight}px`;
    panel.classList.toggle('collapsed', !s.panelVisible);

    const app = document.getElementById('app')!;
    if (s.sidebarVisible) {
      app.style.gridTemplateColumns = `var(--activity-bar-width) ${s.sidebarWidth}px 1fr`;
    }
  }

  private initVerticalSplitter(): void {
    const splitter = document.getElementById('v-splitter')!;
    const editorPane = document.getElementById('editor-pane')!;
    const previewPane = document.getElementById('preview-pane')!;
    const container = document.getElementById('editor-preview-split')!;
    const shield = document.getElementById('drag-shield')!;

    let dragging = false;
    let rafId: number | null = null;

    splitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      splitter.setPointerCapture(e.pointerId);
      splitter.classList.add('dragging');
      shield.classList.add('active');
      shield.style.cursor = 'col-resize';
    });

    splitter.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (rafId !== null) return; // throttle to 1 rAF per frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = container.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const clamped = Math.max(0.2, Math.min(0.8, ratio));
        editorPane.style.flex = `${clamped * 10}`;
        previewPane.style.flex = `${(1 - clamped) * 10}`;
        this.store.getState().setEditorPreviewRatio(clamped);
      });
    });

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      shield.classList.remove('active');
      shield.style.cursor = '';
    };
    splitter.addEventListener('pointerup', stopDrag);
    splitter.addEventListener('pointercancel', stopDrag);
  }

  private initHorizontalSplitter(): void {
    const splitter = document.getElementById('h-splitter')!;
    const panel = document.getElementById('panel')!;
    const shield = document.getElementById('drag-shield')!;

    let dragging = false;
    let rafId: number | null = null;

    splitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      splitter.setPointerCapture(e.pointerId);
      splitter.classList.add('dragging');
      shield.classList.add('active');
      shield.style.cursor = 'row-resize';
    });

    splitter.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const windowH = window.innerHeight;
        const statusBarH = 24;
        const newHeight = windowH - e.clientY - statusBarH;
        const clamped = Math.max(100, Math.min(600, newHeight));
        panel.style.height = `${clamped}px`;
        this.store.getState().setPanelHeight(clamped);
      });
    });

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      shield.classList.remove('active');
      shield.style.cursor = '';
    };
    splitter.addEventListener('pointerup', stopDrag);
    splitter.addEventListener('pointercancel', stopDrag);
  }
}
