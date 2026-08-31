import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfidenceEngine } from '../src/product/ConfidenceEngine';
import { DebugReplay } from '../src/product/DebugReplay';
import { FlowEngine } from '../src/product/FlowEngine';
import { DiagnosticEngine } from '../src/core/DiagnosticEngine';
import { normalizeCompilerMessage } from '../src/worker/compiler.worker';

describe('FlowEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks activity and returns to idle at the policy threshold', () => {
    vi.useFakeTimers();
    const flow = new FlowEngine();
    flow.recordTyping();
    expect(flow.getContext()).toBe('typing');
    expect(flow.shouldSuppressNonEssential()).toBe(true);

    vi.advanceTimersByTime(1_999);
    expect(flow.getContext()).toBe('typing');
    vi.advanceTimersByTime(1);
    expect(flow.getContext()).toBe('idle');
    expect(flow.shouldSuppressNonEssential()).toBe(false);
    flow.dispose();
  });

  it('lets explicit debugging activity last longer than typing', () => {
    vi.useFakeTimers();
    const flow = new FlowEngine();
    flow.recordDebugging();
    vi.advanceTimersByTime(8_000);
    expect(flow.getContext()).toBe('debugging');
    vi.advanceTimersByTime(7_000);
    expect(flow.getContext()).toBe('idle');
    flow.dispose();
  });

  it('flushes deferred non-critical work when activity becomes idle', () => {
    vi.useFakeTimers();
    const flow = new FlowEngine();
    const flushed: string[] = [];
    flow.recordTyping();
    flow.deferNonCritical(() => flushed.push('diagnostic'));
    expect(flushed).toEqual([]);
    expect(flow.getQueuedCount()).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(flushed).toEqual(['diagnostic']);
    expect(flow.getQueuedCount()).toBe(0);
    flow.dispose();
  });
});

describe('ConfidenceEngine', () => {
  it('produces an evidence-based heuristic summary', () => {
    const engine = new ConfidenceEngine();
    const summary = engine.evaluate({
      buildState: 'error',
      buildDurationMs: 48,
      diagnostics: [
        { severity: 'error', message: 'Missing export', file: '/App.tsx', line: 42 },
        { severity: 'error', message: 'Unexpected token', file: '/Button.tsx', line: 8 },
        { severity: 'warning', message: 'Unused import', file: '/App.tsx', line: 2 },
      ],
    });

    expect(summary.score).toBe(61);
    expect(summary.isHeuristic).toBe(true);
    expect(summary.subtitle).toContain('heuristic');
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(1);
    expect(summary.buildDurationMs).toBe(48);
    expect(summary.primaryIssue).toMatchObject({ file: '/App.tsx', line: 42 });
    expect(summary.primaryIssue?.reason).toContain('build stopped');
  });

  it('recovers to a clean score when build evidence is clean', () => {
    const summary = new ConfidenceEngine().evaluate({
      buildState: 'ready',
      buildDurationMs: 12.4,
      diagnostics: [],
    });
    expect(summary.score).toBe(100);
    expect(summary.evidence).toEqual([]);
    expect(summary.primaryIssue).toBeNull();
  });

  it('keeps confidence tied to the latest authoritative state', () => {
    const engine = new ConfidenceEngine();
    const initial = engine.evaluate({ buildState: 'idle', diagnostics: [] });
    const buildSuccess = engine.evaluate({ buildState: 'ready', diagnostics: [] });
    const compilerFailure = engine.evaluate({
      buildState: 'error',
      diagnostics: [{ severity: 'error', source: 'esbuild', message: 'Missing export' }],
    });
    const runtimeFailure = engine.evaluate({
      buildState: 'ready',
      diagnostics: [{ severity: 'error', source: 'runtime', message: 'Render failed' }],
    });
    const recovered = engine.evaluate({ buildState: 'ready', diagnostics: [] });

    expect(initial.score).toBe(100);
    expect(buildSuccess.score).toBe(100);
    expect(compilerFailure.score).toBeLessThan(runtimeFailure.score);
    expect(runtimeFailure.evidence.some((item) => item.label === 'build failure')).toBe(false);
    expect(recovered.score).toBe(100);
  });

  it('treats runtime evidence separately from a compiler build failure', () => {
    const summary = new ConfidenceEngine().evaluate({
      buildState: 'error',
      diagnostics: [{ severity: 'error', source: 'runtime', message: 'Render failed' }],
    });
    expect(summary.score).toBe(82);
    expect(summary.evidence.some((item) => item.label === 'build failure')).toBe(false);
  });
});

describe('Runtime recovery diagnostics', () => {
  it('clears runtime evidence after a successful preview build', () => {
    const collected: Array<Array<{ source?: string }>> = [];
    const engine = new DiagnosticEngine({ setDiagnostics: (items) => { collected.push(items); } });
    engine.ingest([{ severity: 'error', source: 'runtime', message: 'Render failed' }]);
    engine.clearRuntimeDiagnostics();
    expect(collected.at(-1)).toEqual([]);
    engine.dispose();
  });

  it('retains warnings alongside errors for the same failed build', () => {
    let current: Array<{ severity: string; message: string }> = [];
    const engine = new DiagnosticEngine({ setDiagnostics: (items) => { current = items; } });
    engine.replaceAll([
      { severity: 'error', message: 'Syntax error', source: 'esbuild', buildGeneration: 4 },
      { severity: 'warning', message: 'Unused import', source: 'esbuild', buildGeneration: 4 },
    ]);
    expect(current.map(({ severity, message }) => ({ severity, message }))).toEqual([
      { severity: 'error', message: 'Syntax error' },
      { severity: 'warning', message: 'Unused import' },
    ]);
    engine.dispose();
  });
});

describe('Compiler diagnostic boundary', () => {
  it('preserves valid locations and normalizes VFS paths', () => {
    expect(normalizeCompilerMessage({
      text: 'Unexpected token',
      location: { file: './main.jsx', line: 2, column: 62 },
    })).toEqual({
      text: 'Unexpected token',
      location: { file: '/main.jsx', line: 2, column: 62 },
    });
  });

  it('keeps missing and invalid locations unknown', () => {
    expect(normalizeCompilerMessage({ text: 'No location' })).toEqual({ text: 'No location' });
    expect(normalizeCompilerMessage({
      text: 'Invalid location',
      location: { file: '<stdin>', line: 0, column: -1 },
    })).toEqual({ text: 'Invalid location' });
  });
});

describe('DebugReplay', () => {
  it('keeps the causal chain and exports it as Markdown', () => {
    const replay = new DebugReplay();
    replay.recordEdit('/App.tsx');
    replay.recordEdit('/App.tsx');
    replay.recordBuildFailure('/App.tsx', 42, 'a missing export');
    replay.recordPreviewFrozen();
    replay.recordRecovery(48);

    expect(replay.getSteps()).toHaveLength(5);
    expect(replay.getSteps()[1].resultingState).toBe('build: failure');
    expect(replay.getSteps()[2].resultingState).toBe('preview: frozen');
    expect(replay.toMarkdown()).toContain('Build recovered');
    expect(replay.toMarkdown()).toContain('Why:');
  });

  it('bounds history to the product limit', () => {
    const replay = new DebugReplay();
    for (let i = 0; i < 25; i += 1) {
      replay.record({
        event: `Event ${i}`,
        resultingState: 'editing',
        source: 'edit',
        confidence: 'high',
      });
    }
    expect(replay.getSteps()).toHaveLength(20);
    expect(replay.getSteps()[0].event).toBe('Event 5');
  });

  it('does not duplicate a repeated failure from one save action', () => {
    const replay = new DebugReplay();
    replay.recordBuildFailure('/App.tsx', 42, 'a missing export');
    replay.recordPreviewFrozen();
    replay.recordBuildFailure('/App.tsx', 42, 'a missing export');
    replay.recordPreviewFrozen();
    expect(replay.getSteps()).toHaveLength(2);
  });
});
