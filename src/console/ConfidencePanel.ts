import type { IDEStore } from '../store/index';
import type { ConfidenceSummary } from '../product/ConfidenceEngine';
import { IdentityVoice } from '../product/IdentityVoice';

type StoreApi = {
  getState: () => IDEStore;
  subscribe: (listener: () => void) => () => void;
};

export class ConfidencePanel {
  private root: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(root: HTMLElement, store: StoreApi) {
    this.root = root;
    this.root.className = 'confidence-panel';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Project Confidence');
    this.root.setAttribute('aria-live', 'polite');
    this.unsubscribe = store.subscribe(() => this.render(store.getState().confidence));
    this.render(store.getState().confidence);
  }

  private render(summary: ConfidenceSummary | null): void {
    this.root.replaceChildren();
    if (!summary) {
      const empty = document.createElement('p');
      empty.className = 'confidence-empty';
      empty.textContent = IdentityVoice.emptyState('confidence');
      this.root.appendChild(empty);
      return;
    }

    const header = document.createElement('div');
    header.className = 'confidence-header';

    const title = document.createElement('h2');
    title.className = 'confidence-title';
    title.textContent = 'Project Confidence';

    const score = document.createElement('strong');
    score.className = 'confidence-score';
    score.textContent = String(summary.score);
    score.setAttribute('aria-label', `Project Confidence ${summary.score}`);

    header.append(title, score);

    const subtitle = document.createElement('p');
    subtitle.className = 'confidence-subtitle';
    subtitle.textContent = summary.subtitle;

    const facts = document.createElement('p');
    facts.className = 'confidence-facts';
    const duration = summary.buildDurationMs == null ? 'n/a' : `${summary.buildDurationMs}ms`;
    facts.textContent = `${formatCount(summary.errors, 'error')} · ${formatCount(summary.warnings, 'warning')} · build ${duration}`;

    const evidence = document.createElement('div');
    evidence.className = 'confidence-evidence';
    evidence.setAttribute('aria-label', 'Confidence evidence');
    for (const item of summary.evidence) {
      const row = document.createElement('div');
      row.className = 'confidence-evidence-row';
      const label = document.createElement('span');
      label.textContent = item.label;
      const penalty = document.createElement('span');
      penalty.textContent = `−${item.penalty}`;
      row.append(label, penalty);
      evidence.appendChild(row);
    }

    const issue = document.createElement('div');
    issue.className = 'confidence-issue';
    const issueTitle = document.createElement('strong');
    issueTitle.textContent = 'Most significant issue';
    issue.appendChild(issueTitle);
    if (summary.primaryIssue) {
      const message = document.createElement('p');
      message.textContent = summary.primaryIssue.message;
      const location = document.createElement('p');
      location.className = 'confidence-location';
      location.textContent = formatLocation(summary.primaryIssue.file, summary.primaryIssue.line, summary.primaryIssue.col);
      const why = document.createElement('p');
      why.className = 'confidence-why';
      why.textContent = `Why: ${summary.primaryIssue.reason}`;
      issue.append(message, location, why);
    } else {
      const healthy = document.createElement('p');
      healthy.textContent = 'No active diagnostic is demanding attention.';
      issue.appendChild(healthy);
    }

    this.root.append(header, subtitle, facts, evidence, issue);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

function formatLocation(file?: string, line?: number, col?: number): string {
  if (!file) return 'Location unavailable';
  if (!line) return file;
  return `${file}:${line}${col ? `:${col}` : ''}`;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
