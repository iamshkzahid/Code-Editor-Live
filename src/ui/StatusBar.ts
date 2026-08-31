/**
 * Code Editor Live V3.0 — Status Bar Controller
 */
import type { IDEStore } from '../store/index';
import type { PanelTab } from '../store/index';
import type { EditorController } from '../editor/EditorController';
import { IdentityVoice } from '../product/IdentityVoice';
import type { FlowEngine } from '../product/FlowEngine';

export class StatusBar {
  private storeUnsubscribe: (() => void) | null = null;
  private flowUnsubscribe: (() => void) | null = null;

  constructor(
    store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void },
    _editor: EditorController,
    flow?: FlowEngine
  ) {
    const branchEl = document.getElementById('branch-name')!;
    const buildText = document.getElementById('build-text')!;
    const buildDot = document.querySelector('#status-build .status-dot') as HTMLElement;
    const previewStateEl = document.getElementById('preview-state-status');

    document.querySelectorAll('.panel-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const panelName = (tab as HTMLElement).dataset.panel;
        if (panelName) store.getState().setPanelTab(panelName as PanelTab);
      });
    });

    document.getElementById('panel-close')?.addEventListener('click', () => {
      store.getState().togglePanel();
    });

    document.querySelectorAll('.viewport-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vp = (btn as HTMLElement).dataset.viewport;
        if (vp) store.getState().setPreviewViewport(vp as 'desktop' | 'tablet' | 'mobile');
      });
    });

    let lastStableStatus = buildText.textContent || 'Ready';
    const render = () => {
      const s = store.getState();

      branchEl.textContent = s.branch;

      buildDot.className =
        'status-dot ' +
        (s.buildState === 'ready'
          ? 'ready'
          : s.buildState === 'compiling'
            ? 'compiling'
            : s.buildState === 'error'
              ? 'error'
              : 'ready');

      const suppressProgress = s.buildState === 'compiling' && flow?.shouldSuppressNonEssential();
      if (!suppressProgress) {
        buildText.textContent = s.buildStatusText || 'Ready';
        if (s.buildState !== 'compiling') lastStableStatus = buildText.textContent;
      } else {
        buildText.textContent = lastStableStatus;
      }

      if (previewStateEl) {
        if (s.previewMode === 'last_working') {
          previewStateEl.textContent = IdentityVoice.previewStateLabel('last_working');
          previewStateEl.style.display = '';
        } else if (s.previewMode === 'current') {
          previewStateEl.style.display = 'none';
        } else {
          previewStateEl.style.display = 'none';
        }
      }

      document.querySelectorAll('.panel-tab').forEach((tab) => {
        const el = tab as HTMLElement;
        el.classList.toggle('active', el.dataset.panel === s.panelTab);
      });
      document.querySelectorAll('.panel-view').forEach((view) => {
        const el = view as HTMLElement;
        el.classList.toggle('active', el.id === `panel-${s.panelTab}`);
      });

      const problemsCount = document.getElementById('problems-count');
      if (problemsCount) {
        const count = s.diagnostics.length;
        problemsCount.textContent = String(count);
        problemsCount.style.display = count > 0 ? '' : 'none';
      }

      document.querySelectorAll('.viewport-btn').forEach((btn) => {
        (btn as HTMLElement).classList.toggle(
          'active',
          (btn as HTMLElement).dataset.viewport === s.previewViewport
        );
      });
      const frame = document.getElementById('preview-frame') as HTMLIFrameElement;
      if (frame) {
        const widths = { desktop: '100%', tablet: '768px', mobile: '375px' };
        frame.style.maxWidth = widths[s.previewViewport];
        frame.style.margin = s.previewViewport === 'desktop' ? '0' : '0 auto';
      }
    };

    this.storeUnsubscribe = store.subscribe(render);
    this.flowUnsubscribe = flow?.subscribe(render) ?? null;
    render();
  }

  dispose(): void {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    this.flowUnsubscribe?.();
    this.flowUnsubscribe = null;
  }
}
