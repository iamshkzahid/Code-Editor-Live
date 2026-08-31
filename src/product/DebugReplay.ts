import { productPolicy } from './productPolicy';

export type ReplaySource = 'edit' | 'build' | 'runtime' | 'git';
export type ReplayConfidence = 'high' | 'medium' | 'low';

export interface ReplayStep {
  event: string;
  affectedFile?: string;
  line?: number;
  col?: number;
  resultingState: string;
  source: ReplaySource;
  confidence: ReplayConfidence;
  causalLink?: string;
}

export class DebugReplay {
  private steps: ReplayStep[] = [];
  private listeners = new Set<() => void>();

  record(step: ReplayStep): void {
    this.steps = [...this.steps, step].slice(-productPolicy.replay.maxEvents);
    this.emit();
  }

  recordEdit(file?: string): void {
    const previous = this.steps[this.steps.length - 1];
    if (previous?.source === 'edit' && previous.affectedFile === file && previous.resultingState === 'editing') {
      return;
    }
    this.record({
      event: file ? `Edited ${file}` : 'Edited source',
      affectedFile: file,
      resultingState: 'editing',
      source: 'edit',
      confidence: 'high',
    });
  }

  recordBuildFailure(file: string | undefined, line: number | undefined, message: string): void {
    const previous = this.steps[this.steps.length - 1];
    const beforePrevious = this.steps[this.steps.length - 2];
    if (
      previous?.resultingState === 'preview: frozen' &&
      beforePrevious?.resultingState === 'build: failure' &&
      beforePrevious.affectedFile === file &&
      beforePrevious.line === line &&
      beforePrevious.event === `Build detected ${message}`
    ) return;
    this.record({
      event: `Build detected ${message}`,
      affectedFile: file,
      line,
      resultingState: 'build: failure',
      source: 'build',
      confidence: 'high',
      causalLink: 'because the latest source could not compile',
    });
  }

  recordPreviewFrozen(): void {
    if (this.steps[this.steps.length - 1]?.resultingState === 'preview: frozen') return;
    this.record({
      event: 'Preview stayed on the last working version',
      resultingState: 'preview: frozen',
      source: 'build',
      confidence: 'high',
      causalLink: 'because the failed build was kept away from the preview',
    });
  }

  recordRecovery(durationMs: number): void {
    this.record({
      event: 'Build recovered',
      resultingState: 'build: success',
      source: 'build',
      confidence: 'high',
      causalLink: `because the latest source compiled successfully in ${Math.round(durationMs)}ms`,
    });
    this.record({
      event: 'Preview updated to the current build',
      resultingState: 'preview: current',
      source: 'build',
      confidence: 'high',
    });
  }

  recordPreviewUpdated(durationMs: number): void {
    this.record({
      event: 'Preview updated to the current build',
      resultingState: 'preview: current',
      source: 'build',
      confidence: 'high',
      causalLink: `because the build completed in ${Math.round(durationMs)}ms`,
    });
  }

  recordRuntimeError(file: string | undefined, line: number | undefined, message: string): void {
    this.record({
      event: `Preview reported ${message}`,
      affectedFile: file,
      line,
      resultingState: 'preview: runtime error',
      source: 'runtime',
      confidence: 'high',
      causalLink: 'because the running preview threw an error',
    });
  }

  getSteps(): ReplayStep[] {
    return [...this.steps];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    if (this.steps.length === 0) return;
    this.steps = [];
    this.emit();
  }

  toMarkdown(): string {
    if (this.steps.length === 0) return '# Debug Replay\n\nNo story yet.\n';
    return [
      '# Debug Replay',
      '',
      ...this.steps.flatMap((step, index) => [
        `${index + 1}. **${step.event}**`,
        `   - State: ${step.resultingState}`,
        `   - Source: ${step.source} (${step.confidence} confidence)`,
        ...(step.affectedFile ? [`   - Location: ${step.affectedFile}${step.line ? `:${step.line}` : ''}`] : []),
        ...(step.causalLink ? [`   - Why: ${step.causalLink}`] : []),
        '',
      ]),
    ].join('\n');
  }

  dispose(): void {
    this.listeners.clear();
    this.steps = [];
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
