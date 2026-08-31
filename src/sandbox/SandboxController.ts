/**
 * Code Editor Live V3.0 — Sandbox Controller
 * Sandboxed srcdoc preview engine with nonce-authenticated parent messaging.
 */
import type { IDEStore } from '../store/index';
import type { ConsoleController } from '../console/ConsoleController';
import type { PreviewRecovery } from '../core/PreviewRecovery';
import { IdentityVoice } from '../product/IdentityVoice';
import type { DiagnosticEngine, DiagnosticInput } from '../core/DiagnosticEngine';

export class SandboxController {
  private iframe: HTMLIFrameElement;
  private store: { getState: () => IDEStore };
  private console: ConsoleController;
  private previewRecovery: PreviewRecovery | null = null;
  private runtimeDiagnostics: DiagnosticEngine | null = null;
  private activePreviewNonce: string | null = null;
  private messageHandler: (e: MessageEvent) => void;
  private refreshHandler: () => void;

  constructor(
    iframe: HTMLIFrameElement,
    store: { getState: () => IDEStore },
    consoleCtrl: ConsoleController
  ) {
    this.iframe = iframe;
    this.store = store;
    this.console = consoleCtrl;

    this.messageHandler = (e: MessageEvent) => {
      if (!this.isTrustedPreviewMessage(e)) return;

      switch (e.data.type) {
        case 'CONSOLE_LOG':
          this.console.log(e.data.severity ?? 'info', e.data.message, e.data.source, e.data.line);
          break;
        case 'RUNTIME_ERROR': {
          this.console.log('error', e.data.message, e.data.source, e.data.line);
          const runtimeInput: DiagnosticInput = {
            severity: 'error',
            message: e.data.message,
            file: e.data.source,
            line: e.data.line,
            col: e.data.col,
            stack: e.data.stack,
            source: 'runtime',
          };
          this.runtimeDiagnostics?.ingest([runtimeInput]);
          this.store.getState().setBuildState('error');
          this.store.getState().setBuildStatusText(
            IdentityVoice.buildStopped({
              errorCount: 1,
              technicalSummary: e.data.message,
            })
          );
          break;
        }
        default:
          return;
      }
    };

    window.addEventListener('message', this.messageHandler);

    this.refreshHandler = () => {
      this.applyPreviewState();
    };
    document.getElementById('preview-refresh')?.addEventListener('click', this.refreshHandler);
  }

  attachPreviewRecovery(recovery: PreviewRecovery): void {
    this.previewRecovery = recovery;
  }

  attachDiagnosticEngine(engine: DiagnosticEngine): void {
    this.runtimeDiagnostics = engine;
  }

  setPreviewUrl(url: string): void {
    this.activePreviewNonce = this.previewRecovery?.getSessionNonce() ?? null;
    const html = this.previewRecovery && typeof this.previewRecovery.getDisplayHtml === 'function'
      ? this.previewRecovery.getDisplayHtml()
      : null;
    if (html !== null && html !== undefined) {
      this.iframe.removeAttribute('src');
      this.iframe.srcdoc = html;
    } else {
      this.iframe.srcdoc = '';
      this.iframe.src = url;
    }
    this.updatePreviewBanner();
  }

  applyPreviewState(): void {
    this.activePreviewNonce = this.previewRecovery?.getSessionNonce() ?? null;
    const url = this.previewRecovery?.getDisplayUrl();
    const html = this.previewRecovery && typeof this.previewRecovery.getDisplayHtml === 'function'
      ? this.previewRecovery.getDisplayHtml()
      : null;
    if (html !== null && html !== undefined) {
      this.iframe.removeAttribute('src');
      this.iframe.srcdoc = html;
    } else if (url) {
      this.iframe.srcdoc = '';
      this.iframe.src = url;
    }
    const mode = this.previewRecovery?.getMode() ?? 'none';
    this.store.getState().setPreviewMode(mode);
    this.updatePreviewBanner();
  }

  private updatePreviewBanner(): void {
    const banner = document.getElementById('preview-state-banner');
    if (!banner || !this.previewRecovery) return;

    const kind = this.previewRecovery.getStateKind();
    const label = IdentityVoice.previewStateLabel(kind);

    if (this.previewRecovery.isStale()) {
      banner.textContent = label + ' — ' + IdentityVoice.previewUpdated({ durationMs: 0, stale: true });
      banner.hidden = false;
      banner.setAttribute('data-preview-state', 'stale');
    } else if (kind === 'current') {
      banner.hidden = true;
      banner.removeAttribute('data-preview-state');
    } else {
      banner.textContent = label;
      banner.hidden = kind === 'none';
    }
  }

  private isTrustedPreviewMessage(e: MessageEvent): boolean {
    const data = e.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (!this.iframe.contentWindow || e.source !== this.iframe.contentWindow) return false;
    if (typeof data.nonce !== 'string' || data.nonce !== this.activePreviewNonce) return false;

    if (data.type === 'CONSOLE_LOG') {
      return typeof data.message === 'string' &&
        (data.severity == null || data.severity === 'info' || data.severity === 'warn' || data.severity === 'error') &&
        (data.source == null || typeof data.source === 'string') &&
        (data.line == null || (typeof data.line === 'number' && Number.isFinite(data.line)));
    }
    if (data.type === 'RUNTIME_ERROR') {
      return typeof data.message === 'string' &&
        (data.source == null || typeof data.source === 'string') &&
        (data.line == null || (typeof data.line === 'number' && Number.isFinite(data.line))) &&
        (data.col == null || (typeof data.col === 'number' && Number.isFinite(data.col))) &&
        (data.stack == null || typeof data.stack === 'string');
    }
    return false;
  }

  /** @deprecated Use BuildController + PreviewRecovery */
  render(userHtml: string, compiledJS: string, compiledCSS: string): void {
    if (!this.previewRecovery) {
      const html = this.previewRecoveryCompose(userHtml, compiledJS, compiledCSS);
      const blob = new Blob([html], { type: 'text/html' });
      this.iframe.src = URL.createObjectURL(blob);
      return;
    }
    const url = this.previewRecovery.commitSuccess(userHtml, compiledJS, compiledCSS);
    this.setPreviewUrl(url);
  }

  private previewRecoveryCompose(userHtml: string, js: string, css: string): string {
    return this.previewRecovery?.composeHtml(userHtml, js, css) ?? '';
  }

  dispose(): void {
    window.removeEventListener('message', this.messageHandler);
    document.getElementById('preview-refresh')?.removeEventListener('click', this.refreshHandler);
  }
}
