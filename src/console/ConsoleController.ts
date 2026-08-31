/**
 * Code Editor Live V3.0 — Console Controller
 * Structured console output with severity badges.
 */
import type { IDEStore, ConsoleEntry } from '../store/index';

export class ConsoleController {
  private store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void };
  private output: HTMLElement;

  constructor(store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void }) {
    this.store = store;
    this.output = document.getElementById('console-output')!;

    // Clear button
    document.getElementById('console-clear')?.addEventListener('click', () => {
      store.getState().clearConsole();
    });

    // Re-render on change
    store.subscribe(() => this.render());
  }

  log(severity: 'info' | 'warn' | 'error', message: string, source?: string, line?: number): void {
    const entry: ConsoleEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      severity,
      message,
      timestamp: Date.now(),
      source,
      line,
    };
    this.store.getState().addConsoleLog(entry);
  }

  private render(): void {
    const logs = this.store.getState().consoleLogs;
    this.output.innerHTML = logs.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const loc = entry.source ? ` <span style="color:var(--text-tertiary)">${entry.source}${entry.line ? ':' + entry.line : ''}</span>` : '';
      return `<div class="log-entry">
        <span class="log-badge ${entry.severity}">${entry.severity}</span>
        <span class="log-time">${time}</span>
        <span class="log-message ${entry.severity}">${this.escapeHtml(entry.message)}${loc}</span>
      </div>`;
    }).join('');

    // Auto-scroll to bottom
    this.output.scrollTop = this.output.scrollHeight;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
