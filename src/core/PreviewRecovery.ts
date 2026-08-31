import type { PreviewStateKind } from '../product/IdentityVoice';
import type { IDisposable } from './IDisposable';

export type PreviewMode = 'current' | 'last_working' | 'none';

export interface PreviewBlobSet {
  blobUrl: string;
  html: string;
  js: string;
  css: string;
}

function createPreviewNonce(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Preserves last working preview when builds fail. Never presents stale as current.
 */
export class PreviewRecovery implements IDisposable {
  private current: PreviewBlobSet | null = null;
  private lastWorking: PreviewBlobSet | null = null;
  private mode: PreviewMode = 'none';
  private sessionNonce: string | null = null;

  getMode(): PreviewMode {
    return this.mode;
  }

  getStateKind(): PreviewStateKind {
    if (this.mode === 'current') return 'current';
    if (this.mode === 'last_working') return 'last_working';
    return 'none';
  }

  /** URL to display in iframe — may be last working when frozen. */
  getDisplayUrl(): string | null {
    if (this.mode === 'current' && this.current) return this.current.blobUrl;
    if (this.mode === 'last_working' && this.lastWorking) return this.lastWorking.blobUrl;
    return this.current?.blobUrl ?? this.lastWorking?.blobUrl ?? null;
  }

  isStale(): boolean {
    return this.mode === 'last_working';
  }

  /**
   * Register a successful build output. Revokes previous current blob only after new one is ready.
   */
  commitSuccess(html: string, js: string, css: string): string {
    const sessionNonce = createPreviewNonce();
    const blobUrl = URL.createObjectURL(
      new Blob([this.composeHtml(html, js, css, sessionNonce)], { type: 'text/html' })
    );

    const previous = this.current;
    this.current = { blobUrl, html, js, css };
    this.lastWorking = this.current;
    this.sessionNonce = sessionNonce;
    if (previous?.blobUrl) URL.revokeObjectURL(previous.blobUrl);
    this.mode = 'current';
    return blobUrl;
  }

  /** Build failed — freeze on last working preview if available. */
  freezeOnFailure(): void {
    if (this.lastWorking) {
      this.mode = 'last_working';
    } else if (this.current) {
      this.mode = 'last_working';
      this.lastWorking = this.current;
    } else {
      this.mode = 'none';
    }
  }

  getLastWorking(): PreviewBlobSet | null {
    return this.lastWorking;
  }

  getSessionNonce(): string | null {
    return this.sessionNonce;
  }

  getDisplayHtml(): string | null {
    const display = this.mode === 'current'
      ? this.current
      : this.mode === 'last_working'
        ? this.lastWorking
        : this.current ?? this.lastWorking;
    if (!display) return null;
    return this.composeHtml(display.html, display.js, display.css, this.sessionNonce ?? createPreviewNonce());
  }

  composeHtml(userHtml: string, js: string, css: string, sessionNonce = createPreviewNonce()): string {
    let headContent = '';
    let bodyContent = '<div id="root"></div>';

    if (userHtml) {
      const bodyMatch = userHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) bodyContent = bodyMatch[1];

      const headMatch = userHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      if (headMatch) {
        headContent = headMatch[1].replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        headContent = headContent.replace(/<link[^>]*href=["']\.\/style\.css["'][^>]*>/gi, '');
      }
    }

    const previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headContent}
  <style>${css}</style>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18",
      "react-dom/client": "https://esm.sh/react-dom@18/client",
      "react-dom": "https://esm.sh/react-dom@18",
      "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime"
    }
  }
  </script>
</head>
<body>
  ${bodyContent}
  <script>
    (function() {
      const previewModuleLine = 0;
      const origConsole = {};
      ['log', 'warn', 'error', 'info'].forEach(method => {
        origConsole[method] = console[method].bind(console);
        console[method] = function(...args) {
          origConsole[method](...args);
          try {
            const severity = method === 'log' ? 'info' : method;
            const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
            parent.postMessage({ type: 'CONSOLE_LOG', nonce: ${JSON.stringify(sessionNonce)}, severity, message }, '*');
          } catch {}
        };
      });
      window.onerror = function(msg, src, line, col, err) {
        const normalizedLine = typeof line === 'number' && previewModuleLine > 0
          ? line - previewModuleLine + 1
          : line;
        parent.postMessage({
          type: 'RUNTIME_ERROR',
          nonce: ${JSON.stringify(sessionNonce)},
          message: String(msg),
          source: src,
          line: normalizedLine,
          col: col,
          stack: err && err.stack ? String(err.stack) : undefined,
        }, '*');
      };
      window.addEventListener('unhandledrejection', function(e) {
        parent.postMessage({ type: 'RUNTIME_ERROR', nonce: ${JSON.stringify(sessionNonce)}, message: 'Unhandled Promise: ' + String(e.reason) }, '*');
      });
    })();
  </script>
  <!-- code-editor-live-preview-module -->
  <script type="module">${js}</script>
</body>
</html>`;

    const marker = '<!-- code-editor-live-preview-module -->';
    const markerIndex = previewHtml.indexOf(marker);
    const previewModuleLine = markerIndex >= 0
      ? previewHtml.slice(0, markerIndex).split('\n').length + 1
      : 0;
    return previewHtml.replace(
      'const previewModuleLine = 0;',
      `const previewModuleLine = ${previewModuleLine};`
    );
  }

  dispose(): void {
    if (this.current?.blobUrl) URL.revokeObjectURL(this.current.blobUrl);
    if (this.lastWorking?.blobUrl && this.lastWorking.blobUrl !== this.current?.blobUrl) {
      URL.revokeObjectURL(this.lastWorking.blobUrl);
    }
    this.current = null;
    this.lastWorking = null;
    this.sessionNonce = null;
    this.mode = 'none';
  }
}
