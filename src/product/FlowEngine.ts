import { productPolicy } from './productPolicy';

export type FlowContext = 'typing' | 'reading' | 'searching' | 'debugging' | 'idle';
export type FlowListener = (context: FlowContext) => void;

/** Tracks attention context so non-essential status churn can wait. */
export class FlowEngine {
  private context: FlowContext = 'idle';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<FlowListener>();
  private queuedNonCritical: Array<() => void> = [];
  private criticalDepth = 0;

  record(context: FlowContext): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.context = context;
    this.emit();

    if (context === 'idle') {
      this.flushQueued();
      return;
    }
    const delay = productPolicy.flow.activityIdleMs[context];
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.context = 'idle';
      this.emit();
      this.flushQueued();
    }, delay);
  }

  recordTyping(): void { this.record('typing'); }
  recordReading(): void { this.record('reading'); }
  recordSearching(): void { this.record('searching'); }
  recordDebugging(): void { this.record('debugging'); }
  recordIdle(): void { this.record('idle'); }

  getContext(): FlowContext { return this.context; }

  shouldSuppressNonEssential(): boolean {
    return this.context !== 'idle' && this.criticalDepth === 0;
  }

  deferNonCritical(task: () => void): void {
    if (this.shouldSuppressNonEssential()) this.queuedNonCritical.push(task);
    else task();
  }

  runCritical(task: () => void): void {
    this.criticalDepth += 1;
    try {
      this.flushQueued(true);
      task();
    } finally {
      this.criticalDepth -= 1;
    }
  }

  isCritical(): boolean { return this.criticalDepth > 0; }

  getQueuedCount(): number {
    return this.queuedNonCritical.length;
  }

  subscribe(listener: FlowListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.queuedNonCritical = [];
    this.listeners.clear();
  }

  private flushQueued(force = false): void {
    if ((!force && this.shouldSuppressNonEssential()) || this.queuedNonCritical.length === 0) return;
    const queued = this.queuedNonCritical.splice(0);
    for (const task of queued) task();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.context);
  }
}
