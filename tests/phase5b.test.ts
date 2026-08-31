import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { explainDiagnostic, groupByFile, orderDiagnostics } from '../src/product/Explainability';
import { resolveNextAction } from '../src/product/NextAction';
import { DiagnosticEngine, type DiagnosticRecord } from '../src/core/DiagnosticEngine';
import { SourceMapResolver } from '../src/build/SourceMapResolver';
import { IdentityVoice } from '../src/product/IdentityVoice';
import { FlowEngine } from '../src/product/FlowEngine';

function record(overrides: Partial<DiagnosticRecord> & { message: string }): DiagnosticRecord {
  return {
    id: 'diag-test',
    hash: 'hash',
    severity: 'error',
    technicalMessage: overrides.message,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: 'esbuild',
    ...overrides,
  };
}

describe('Explainability', () => {
  it('explains unexpected token with calibrated language', () => {
    const explained = explainDiagnostic(record({ message: 'Unexpected token' }));
    expect(explained.headline).toContain('unexpected syntax');
    expect(explained.confidence).toBe('medium');
    expect(explained.technicalMessage).toBe('Unexpected token');
  });

  it('explains missing bracket with high confidence', () => {
    const explained = explainDiagnostic(record({ message: 'Expected ")" but found ";"' }));
    expect(explained.headline).toContain("closing ')'");
    expect(explained.confidence).toBe('high');
    expect(explained.explanation).toContain('parser');
  });

  it('explains missing module', () => {
    const explained = explainDiagnostic(
      record({ message: 'Could not resolve "./missing"', file: '/main.jsx', line: 3 })
    );
    expect(explained.headline).toContain('could not be found');
    expect(explained.nextAction.label).toContain('import');
  });

  it('uses calibrated language for ambiguous diagnostics', () => {
    const explained = explainDiagnostic(record({ message: 'Something went wrong internally' }));
    expect(explained.confidence).toBe('low');
    expect(
      explained.headline.includes('may') ||
        explained.explanation.includes('may') ||
        explained.explanation.includes('Based on available evidence')
    ).toBe(true);
  });
});

describe('NextAction', () => {
  it('generates specific file/line actions', () => {
    const action = resolveNextAction(record({ message: 'Error', file: '/App.tsx', line: 41 }));
    expect(action.label).toBe('Open App.tsx line 41');
    expect(action.estimatedFixTime).toBeUndefined();
  });

  it('generates import-specific action for missing module', () => {
    const action = resolveNextAction(
      record({ message: 'Could not resolve "./foo"', file: '/App.tsx', line: 2 })
    );
    expect(action.label).toBe('Open import in App.tsx');
  });

  it('never fabricates fix estimates', () => {
    const action = resolveNextAction(record({ message: 'Expected ")" but found ";"', file: '/a.js', line: 1 }));
    expect(action.estimatedFixTime).toBeUndefined();
  });
});

describe('DiagnosticEngine ordering and dedup', () => {
  let diagnostics: unknown[] = [];
  const sink = { setDiagnostics: (d: unknown[]) => { diagnostics = d; } };

  beforeEach(() => {
    diagnostics = [];
  });

  it('dedupes diagnostics', () => {
    const engine = new DiagnosticEngine(sink);
    engine.ingest([
      { severity: 'error', message: 'A', file: '/a.js', source: 'esbuild' },
      { severity: 'error', message: 'A', file: '/a.js', source: 'esbuild' },
    ]);
    expect(diagnostics).toHaveLength(1);
    engine.dispose();
  });

  it('orders with current-file prioritization', () => {
    const records = orderDiagnostics(
      [
        record({ id: '1', message: 'b', file: '/other.js', line: 5, severity: 'error' }),
        record({ id: '2', message: 'a', file: '/main.jsx', line: 2, severity: 'warning' }),
      ],
      '/main.jsx'
    );
    expect(records[0].file).toBe('/main.jsx');
  });

  it('groups diagnostics by file', () => {
    const groups = groupByFile(
      [
        record({ id: '1', message: 'a', file: '/a.js' }),
        record({ id: '2', message: 'b', file: '/b.js' }),
      ],
      null
    );
    expect(groups.size).toBe(2);
  });

  it('ignores stale build generation when superseded', () => {
    const engine = new DiagnosticEngine(sink);
    engine.setBuildGeneration(2);
    engine.ingest([
      { severity: 'error', message: 'old', source: 'esbuild', buildGeneration: 1 },
      { severity: 'error', message: 'new', source: 'esbuild', buildGeneration: 2 },
    ]);
    const active = engine.getOrdered();
    expect(active.some((r) => r.message === 'new')).toBe(true);
    engine.dispose();
  });
});

describe('SourceMapResolver', () => {
  it('resolves mapped locations when source map is available', () => {
    const resolver = new SourceMapResolver();
    const map = JSON.stringify({
      version: 3,
      sources: ['/main.jsx'],
      mappings: 'AAAA',
    });
    resolver.setFromBundle('//code\n//# sourceMappingURL=data:application/json;base64,' + btoa(map));
    expect(resolver.hasSourceMap()).toBe(true);
    const resolved = resolver.resolve(1, 0);
    expect(resolved?.resolved).toBe(true);
    expect(resolved?.file).toBe('/main.jsx');
  });

  it('falls back truthfully when source map is missing', () => {
    const resolver = new SourceMapResolver();
    const resolved = resolver.resolveRuntime('blob:preview', 10, 1);
    expect(resolved.resolved).toBe(false);
    expect(resolved.limitation).toContain('unavailable');
  });

  it('maps nested worker source paths from an about:srcdoc runtime location', () => {
    const resolver = new SourceMapResolver();
    const map = JSON.stringify({
      version: 3,
      sources: ['../../../../../../main.jsx'],
      mappings: 'AAAA',
    });
    resolver.setFromBundle(
      `bundle\n//# sourceMappingURL=data:application/json;base64,${btoa(map)}`
    );

    const resolved = resolver.resolveRuntime('about:srcdoc', 1, 6);
    expect(resolved).toMatchObject({
      file: '/main.jsx',
      line: 1,
      col: 1,
      resolved: true,
    });
  });

  it('maps the generated runtime line emitted by esbuild', () => {
    const resolver = new SourceMapResolver();
    const map = JSON.stringify({
      version: 3,
      sources: ['../main.jsx'],
      mappings: ';AAAA,SAAS,kBAAkB;AAEwB;AADnD,MAAM,IAAI,MAAM,eAAe;AAC/B,WAAW,SAAS,eAAe,MAAM,CAAC,EAAE,OAAO,oBAAC,UAAK,qBAAO,CAAO;',
    });
    resolver.setFromBundle('bundle', map);

    expect(resolver.resolveRuntime('about:srcdoc', 4, 7)).toMatchObject({
      file: '/main.jsx',
      line: 2,
      resolved: true,
    });
  });
});

describe('IdentityVoice', () => {
  it('uses truthful problems empty state without fabricated confidence', () => {
    expect(IdentityVoice.emptyState('problems')).toBe('Everything looks healthy.');
    expect(IdentityVoice.emptyState('problems')).not.toContain('100%');
  });

  it('preserves stale preview copy', () => {
    const copy = IdentityVoice.previewUpdated({ durationMs: 0, stale: true });
    expect(copy).toContain('last working preview');
  });
});

describe('ProblemsPanel keyboard and navigation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('supports F8 navigation between problems', async () => {
    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    document.body.appendChild(root);

    let diagnostics: DiagnosticRecord[] = [
      record({ id: 'a', message: 'Error A', file: '/a.js', line: 1 }),
      record({ id: 'b', message: 'Error B', file: '/b.js', line: 2 }),
    ];

    const engine = {
      subscribe: (fn: () => void) => { engine._fn = fn; return () => {}; },
      _fn: null as (() => void) | null,
      getBuildGeneration: () => 1,
      getOrdered: () => diagnostics,
      getById: (id: string) => diagnostics.find((d) => d.id === id),
      dismiss: vi.fn(),
    };

    const store = {
      getState: () => ({
        panelVisible: true,
        panelTab: 'problems',
        openTabs: [],
        activeTabId: null,
      }),
      subscribe: (fn: () => void) => { fn(); return () => {}; },
    };

    const panel = new ProblemsPanel(
      root,
      engine as never,
      store as never,
      { getCurrentFile: () => null, jumpToLine: vi.fn(() => true) } as never,
      { openFile: vi.fn() } as never,
      { fileExists: vi.fn(async () => true) } as never,
      new SourceMapResolver()
    );

    await new Promise((r) => setTimeout(r, 0));
    const cards = root.querySelectorAll('.problem-card');
    expect(cards.length).toBe(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('.problem-card.focused')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', shiftKey: true, bubbles: true }));

    panel.dispose();
  });

  it('survives panel disposal without throwing', async () => {
    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    const engine = {
      subscribe: () => () => {},
      getBuildGeneration: () => 1,
      getOrdered: () => [],
      getById: () => undefined,
      dismiss: vi.fn(),
    };
    const panel = new ProblemsPanel(
      root,
      engine as never,
      { getState: () => ({ panelVisible: true, panelTab: 'problems', openTabs: [], activeTabId: null }), subscribe: () => () => {} } as never,
      { getCurrentFile: () => null, jumpToLine: vi.fn() } as never,
      { openFile: vi.fn() } as never,
      { fileExists: vi.fn() } as never,
      new SourceMapResolver()
    );
    panel.dispose();
    engine.subscribe(() => panel);
    expect(() => panel.dispose()).not.toThrow();
  });

  it('defers live diagnostic rendering while the editor is active', async () => {
    vi.useFakeTimers();
    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    const flow = new FlowEngine();
    const diagnostics: DiagnosticRecord[] = [];
    let notifyEngine: (() => void) | null = null;
    const engine = {
      subscribe: (fn: () => void) => { notifyEngine = fn; return () => {}; },
      getBuildGeneration: () => 1,
      getOrdered: () => diagnostics,
      getById: (id: string) => diagnostics.find((d) => d.id === id),
      dismiss: vi.fn(),
    };
    const panel = new ProblemsPanel(
      root,
      engine as never,
      { getState: () => ({ panelVisible: true, panelTab: 'problems', openTabs: [], activeTabId: null }), subscribe: () => () => {} } as never,
      { getCurrentFile: () => null, jumpToLine: vi.fn() } as never,
      { openFile: vi.fn() } as never,
      { fileExists: vi.fn(async () => true) } as never,
      new SourceMapResolver(),
      flow
    );

    diagnostics.push(record({ id: 'flow-diagnostic', message: 'Error', file: '/main.jsx', line: 2 }));
    flow.recordTyping();
    notifyEngine?.();
    await Promise.resolve();
    expect(root.querySelector('.problem-card')).toBeNull();

    vi.advanceTimersByTime(2_000);
    await Promise.resolve();
    expect(root.querySelector('.problem-card')).toBeTruthy();

    panel.dispose();
    flow.dispose();
    vi.useRealTimers();
  });

  it('navigates to source on open action', async () => {
    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    document.body.appendChild(root);

    const openFile = vi.fn();
    const jumpToLine = vi.fn(() => true);
    const diagnostics = [record({ id: 'x', message: 'Error', file: '/App.tsx', line: 41 })];

    const engine = {
      subscribe: () => () => {},
      getBuildGeneration: () => 1,
      getOrdered: () => diagnostics,
      getById: (id: string) => diagnostics.find((d) => d.id === id),
      dismiss: vi.fn(),
    };

    const panel = new ProblemsPanel(
      root,
      engine as never,
      { getState: () => ({ panelVisible: true, panelTab: 'problems', openTabs: [], activeTabId: null }), subscribe: (fn: () => void) => { fn(); return () => {}; } } as never,
      { getCurrentFile: () => null, jumpToLine } as never,
      { openFile } as never,
      { fileExists: vi.fn(async () => true) } as never,
      new SourceMapResolver()
    );

    await new Promise((r) => setTimeout(r, 0));
    await panel.openProblem('x');
    expect(openFile).toHaveBeenCalledWith('/App.tsx', expect.anything());
    expect(jumpToLine).toHaveBeenCalledWith(41, undefined);
    panel.dispose();
  });

  it('handles invalid locations truthfully', async () => {
    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    const jumpToLine = vi.fn(() => false);
    const diagnostics = [record({ id: 'bad', message: 'Error', file: '/App.tsx', line: 9999 })];

    const engine = {
      subscribe: () => () => {},
      getBuildGeneration: () => 1,
      getOrdered: () => diagnostics,
      getById: (id: string) => diagnostics.find((d) => d.id === id),
      dismiss: vi.fn(),
    };

    const panel = new ProblemsPanel(
      root,
      engine as never,
      { getState: () => ({ panelVisible: true, panelTab: 'problems', openTabs: [], activeTabId: null }), subscribe: () => () => {} } as never,
      { getCurrentFile: () => null, jumpToLine } as never,
      { openFile: vi.fn() } as never,
      { fileExists: vi.fn(async () => true) } as never,
      new SourceMapResolver()
    );

    await panel.openProblem('bad');
    expect(root.querySelector('.problems-status')?.textContent).toContain('Could not navigate');
    panel.dispose();
  });

  it('rejects an invalid editor line without clamping to the last line', async () => {
    const { EditorController } = await import('../src/editor/EditorController');
    const host = document.createElement('div');
    document.body.appendChild(host);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const editor = new EditorController(
      host,
      { getState: () => ({ markTabDirty: vi.fn() }) } as never
    );
    editor.openFile('/main.js', 'one\ntwo');

    expect(editor.jumpToLine(9999)).toBe(false);
    expect(editor.jumpToLine(2, 9999)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('workspace persistence', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    localStorage.clear();
  });

  it('coalesces repeated workspace mutations into one write', async () => {
    vi.useFakeTimers();
    const { store } = await import('../src/store/index');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const saveWorkspace = vi.spyOn(store.getState(), 'saveWorkspace');

    store.getState().setSidebarWidth(200);
    store.getState().setSidebarWidth(220);
    store.getState().setSidebarWidth(240);
    expect(store.getState().sidebarWidth).toBe(240);
    expect(setItem).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('does not persist transient build or console state', async () => {
    vi.useFakeTimers();
    const { store } = await import('../src/store/index');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    store.getState().setBuildState('compiling');
    store.getState().addConsoleLog({ id: '1', severity: 'info', message: 'typing', timestamp: Date.now() });
    await vi.advanceTimersByTimeAsync(100);

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('Sandbox message authenticity', () => {
  it('keeps runtime failures distinct from successful build state', async () => {
    const { SandboxController } = await import('../src/sandbox/SandboxController');
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    let buildState = 'ready';
    let status = '';
    const store = {
      getState: () => ({
        buildState,
        setBuildState: (next: string) => { buildState = next; },
        setBuildStatusText: (next: string) => { status = next; },
        setPreviewMode: vi.fn(),
      }),
    };
    const sandbox = new SandboxController(iframe, store as never, { log: vi.fn() } as never);
    sandbox.attachPreviewRecovery({ getSessionNonce: () => 'runtime-session' } as never);
    sandbox.setPreviewUrl('blob:preview');

    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: {
        type: 'RUNTIME_ERROR',
        nonce: 'runtime-session',
        message: 'Render failed',
        source: '/main.jsx',
        line: 2,
        col: 1,
      },
    }));

    expect(buildState).toBe('ready');
    expect(status).toBe('Preview runtime error. Review the reported issue.');
    sandbox.dispose();
  });

  it('delivers the active preview through srcdoc', async () => {
    const { SandboxController } = await import('../src/sandbox/SandboxController');
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const store = { getState: () => ({ setPreviewMode: vi.fn() }) };
    const sandbox = new SandboxController(iframe, store as never, { log: vi.fn() } as never);
    sandbox.attachPreviewRecovery({
      getSessionNonce: () => 'session-1',
      getDisplayHtml: () => '<!doctype html><p>preview</p>',
    } as never);

    sandbox.setPreviewUrl('blob:unused');

    expect(iframe.getAttribute('src')).toBeNull();
    expect(iframe.getAttribute('srcdoc')).toContain('<p>preview</p>');
    sandbox.dispose();
  });

  it('accepts only typed messages from the active iframe session', async () => {
    const { SandboxController } = await import('../src/sandbox/SandboxController');
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const log = vi.fn();
    const store = {
      getState: () => ({
        setBuildState: vi.fn(),
        setBuildStatusText: vi.fn(),
        setPreviewMode: vi.fn(),
      }),
    };
    const sandbox = new SandboxController(iframe, store as never, { log } as never);
    const recovery = { getSessionNonce: () => 'session-1' };
    sandbox.attachPreviewRecovery(recovery as never);
    sandbox.setPreviewUrl('blob:preview');

    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'CONSOLE_LOG', nonce: 'wrong', message: 'ignored' },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: 'CONSOLE_LOG', nonce: 'session-1', message: 'ignored' },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'UNKNOWN', nonce: 'session-1', message: 'ignored' },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'CONSOLE_LOG', nonce: 'session-1', severity: 'info', message: 'accepted' },
    }));

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('info', 'accepted', undefined, undefined);
    sandbox.dispose();
  });
});

describe('Accessibility', () => {
  it('problem cards expose semantic structure for assistive technology', async () => {
    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    document.body.appendChild(root);

    const diagnostics = [record({ id: 'a11y', message: 'Expected ")" but found ";"', file: '/main.jsx', line: 10 })];

    const engine = {
      subscribe: (fn: () => void) => { fn(); return () => {}; },
      getBuildGeneration: () => 1,
      getOrdered: () => diagnostics,
      getById: (id: string) => diagnostics.find((d) => d.id === id),
      dismiss: vi.fn(),
    };

    const panel = new ProblemsPanel(
      root,
      engine as never,
      { getState: () => ({ panelVisible: true, panelTab: 'problems', openTabs: [], activeTabId: null }), subscribe: (fn: () => void) => { fn(); return () => {}; } } as never,
      { getCurrentFile: () => null, jumpToLine: vi.fn() } as never,
      { openFile: vi.fn() } as never,
      { fileExists: vi.fn() } as never,
      new SourceMapResolver()
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(root.getAttribute('role')).toBe('region');
    const card = root.querySelector('.problem-card');
    expect(card?.getAttribute('role')).toBe('listitem');
    expect(root.querySelector('.problem-action-primary')?.tagName).toBe('BUTTON');
    expect(root.querySelector('.problem-technical')?.getAttribute('aria-label')).toBe('Technical diagnostic detail');

    panel.dispose();
  });

  it('passes axe-core with no critical violations', async () => {
    const axe = await import('axe-core');
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --text-primary: #e6edf3; --text-secondary: #8b949e; --text-tertiary: #6e7681;
        --surface-0: #0d1117; --surface-2: #161b22; --border: #30363d; --border-muted: #21262d;
        --accent: #388bfd; --accent-subtle: #1f2d4a;
        --error: #f85149; --error-subtle: #2d1117;
        --warning: #d29922; --warning-subtle: #2a1f0a;
        --info: #58a6ff; --info-subtle: #0d2137;
        --font-code: monospace;
        --radius-md: 6px; --radius-pill: 999px;
        --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
      }
    `;
    document.head.appendChild(style);

    const { ProblemsPanel } = await import('../src/console/ProblemsPanel');
    const root = document.createElement('div');
    document.body.appendChild(root);

    const diagnostics = [
      record({ id: 'axe1', message: 'Error one', file: '/a.js', line: 1 }),
      record({ id: 'axe2', message: 'Error two', file: '/b.js', line: 2, severity: 'warning' }),
    ];

    const engine = {
      subscribe: (fn: () => void) => { fn(); return () => {}; },
      getBuildGeneration: () => 1,
      getOrdered: () => diagnostics,
      getById: (id: string) => diagnostics.find((d) => d.id === id),
      dismiss: vi.fn(),
    };

    const panel = new ProblemsPanel(
      root,
      engine as never,
      { getState: () => ({ panelVisible: true, panelTab: 'problems', openTabs: [], activeTabId: null }), subscribe: (fn: () => void) => { fn(); return () => {}; } } as never,
      { getCurrentFile: () => null, jumpToLine: vi.fn() } as never,
      { openFile: vi.fn() } as never,
      { fileExists: vi.fn() } as never,
      new SourceMapResolver()
    );

    await new Promise((r) => setTimeout(r, 0));

    const results = await axe.default.run(root, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious.map((v) => v.id)).toEqual([]);

    panel.dispose();
    style.remove();
  });
});

describe('Runtime and build diagnostics', () => {
  it('ingests runtime diagnostics with stack', () => {
    const collected: unknown[] = [];
    const engine = new DiagnosticEngine({ setDiagnostics: (d) => { collected.push(d); } });
    engine.ingest([
      {
        severity: 'error',
        message: 'undefined is not an object',
        source: 'runtime',
        stack: 'at App (main.jsx:10)',
        file: 'blob:preview',
        line: 10,
      },
    ]);
    const last = collected[collected.length - 1] as Array<{ source?: string; stack?: string }>;
    expect(last[0].source).toBe('runtime');
    expect(last[0].stack).toContain('main.jsx');
    engine.dispose();
  });

  it('ingests build diagnostics with generation', () => {
    const collected: unknown[] = [];
    const engine = new DiagnosticEngine({ setDiagnostics: (d) => { collected.push(d); } });
    engine.setBuildGeneration(3);
    engine.replaceAll([
      { severity: 'error', message: 'Build failed', source: 'esbuild', buildGeneration: 3 },
    ]);
    const last = collected[collected.length - 1] as Array<{ buildGeneration?: number }>;
    expect(last[0].buildGeneration).toBe(3);
    engine.dispose();
  });
});

describe('Expert technical detail', () => {
  it('remains accessible in explained output', () => {
    const explained = explainDiagnostic(
      record({ message: 'Expected ")" but found ";"', file: '/App.tsx', line: 41, code: 'E001' })
    );
    expect(explained.technicalMessage).toBe('Expected ")" but found ";"');
    expect(explained.file).toBe('/App.tsx');
    expect(explained.line).toBe(41);
    expect(explained.code).toBe('E001');
  });
});
