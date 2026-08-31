import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiagnosticEngine } from '../src/core/DiagnosticEngine';
import { PreviewRecovery } from '../src/core/PreviewRecovery';
import { LifecycleManager, attachBootGatedBuildListener } from '../src/core/LifecycleManager';

vi.mock('esbuild-wasm', () => ({
  initialize: vi.fn(() => Promise.resolve()),
  build: vi.fn(),
}));

describe('DiagnosticEngine', () => {
  let diagnostics: Diagnostic[] = [];
  const sink = {
    setDiagnostics: (d: Diagnostic[]) => {
      diagnostics = d;
    },
  };

  beforeEach(() => {
    diagnostics = [];
  });

  it('dedupes diagnostics by hash and preserves stable count', () => {
    const engine = new DiagnosticEngine(sink);
    engine.ingest([
      { severity: 'error', message: 'Unexpected token', file: '/main.jsx', line: 10, source: 'esbuild' },
      { severity: 'error', message: 'Unexpected token', file: '/main.jsx', line: 10, source: 'esbuild' },
    ]);
    expect(diagnostics).toHaveLength(1);
    engine.ingest([
      { severity: 'error', message: 'Unexpected token', file: '/main.jsx', line: 10, source: 'esbuild' },
    ]);
    expect(diagnostics).toHaveLength(1);
    engine.dispose();
  });

  it('replaceAll clears previous build diagnostics', () => {
    const engine = new DiagnosticEngine(sink);
    engine.ingest([{ severity: 'error', message: 'A', source: 'esbuild' }]);
    engine.replaceAll([{ severity: 'error', message: 'B', source: 'esbuild' }]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toBe('B');
    engine.dispose();
  });
});

type Diagnostic = {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  col?: number;
};

describe('PreviewRecovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves last working preview on failure', () => {
    const recovery = new PreviewRecovery();
    const url = recovery.commitSuccess('<html></html>', 'console.log(1)', '');
    expect(recovery.getMode()).toBe('current');
    expect(recovery.getDisplayUrl()).toBe(url);

    recovery.freezeOnFailure();
    expect(recovery.getMode()).toBe('last_working');
    expect(recovery.isStale()).toBe(true);
    expect(recovery.getDisplayUrl()).toBe(url);
    recovery.dispose();
  });

  it('keeps separate last working blob after a newer successful build', () => {
    const recovery = new PreviewRecovery();
    const first = recovery.commitSuccess('', 'v1', '');
    const second = recovery.commitSuccess('', 'v2', '');
    recovery.freezeOnFailure();
    expect(recovery.getDisplayUrl()).toBe(second);
    expect(recovery.getDisplayUrl()).not.toBe(first);
    expect(recovery.getLastWorking()?.js).toBe('v2');
    recovery.dispose();
  });

  it('revokes blob URLs on dispose without double-revoke', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const recovery = new PreviewRecovery();
    recovery.commitSuccess('', 'js', '');
    recovery.dispose();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('Compiler initialization', () => {
  it('initializes esbuild once for concurrent callers', async () => {
    vi.resetModules();
    const esbuild = await import('esbuild-wasm');
    const { ensureInit } = await import('../src/worker/compiler.worker');

    await Promise.all([ensureInit(), ensureInit(), ensureInit()]);
    expect(esbuild.initialize).toHaveBeenCalledTimes(1);
  });

  it('does not prefix already-absolute CDN module URLs', async () => {
    const { resolveExternalModule } = await import('../src/worker/compiler.worker');

    expect(resolveExternalModule('https://esm.sh/react@18/jsx-runtime')).toEqual({
      path: 'https://esm.sh/react@18/jsx-runtime',
      external: true,
    });
    expect(resolveExternalModule('react-dom@18/client')).toEqual({
      path: 'https://esm.sh/react-dom@18/client',
      external: true,
    });
  });
});

describe('BootBuildGate', () => {
  it('holds VFS-triggered builds until bootstrap is complete', () => {
    const listeners: Array<() => void> = [];
    const scheduleBuild = vi.fn();
    const enable = attachBootGatedBuildListener(
      (listener) => listeners.push(listener),
      scheduleBuild
    );

    listeners[0]();
    expect(scheduleBuild).not.toHaveBeenCalled();
    enable();
    listeners[0]();
    expect(scheduleBuild).toHaveBeenCalledTimes(1);
  });
});

describe('WorkerSupervisor heartbeat', () => {
  it('reports the last PONG and detects a missed heartbeat', async () => {
    vi.useFakeTimers();
    const workers: MockWorker[] = [];
    class MockWorker {
      private listeners = new Map<string, (event: MessageEvent) => void>();
      constructor() { workers.push(this); }
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      removeEventListener(type: string): void { this.listeners.delete(type); }
      postMessage(): void {}
      terminate(): void {}
      emit(data: unknown): void { this.listeners.get('message')?.({ data } as MessageEvent); }
    }
    vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);

    const { WorkerSupervisor } = await import('../src/core/WorkerSupervisor');
    const supervisor = new WorkerSupervisor();
    expect(supervisor.getHealth().lastHeartbeat).toBe(0);
    workers[0].emit({ type: 'PONG' });
    expect(supervisor.getHealth().lastHeartbeat).toBeGreaterThan(0);

    vi.advanceTimersByTime(10_001);
    expect(supervisor.getHealth().status).toBe('unresponsive');
    supervisor.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe('LifecycleManager', () => {
  it('disposes registered instances and prevents duplicates', () => {
    const lifecycle = new LifecycleManager();
    const disposeA = vi.fn();
    const disposeB = vi.fn();

    lifecycle.register('worker', { dispose: disposeA });
    lifecycle.register('worker', { dispose: disposeB });
    expect(disposeA).toHaveBeenCalledTimes(1);

    lifecycle.unregister('worker');
    expect(disposeB).toHaveBeenCalledTimes(1);
    expect(lifecycle.getRegistered()).not.toContain('worker');
  });

  it('disposeAll cleans every registration', () => {
    const lifecycle = new LifecycleManager();
    const dispose = vi.fn();
    lifecycle.register('build', { dispose });
    lifecycle.registerCleanup('listener', () => {});
    lifecycle.disposeAll();
    expect(dispose).toHaveBeenCalled();
    expect(lifecycle.getRegistered()).toHaveLength(0);
  });
});

describe('BuildController stale generation', () => {
  it('ignores superseded build results via generation guard', async () => {
    class MockWorker {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);

    const { BuildController } = await import('../src/build/BuildController');

    let buildState = 'idle';
    const store = {
      getState: () => ({
        setBuildState: (s: string) => {
          buildState = s;
        },
        setBuildStatusText: vi.fn(),
        setPreviewMode: vi.fn(),
        setDiagnostics: vi.fn(),
      }),
    };

    const vfs = {
      readAllFiles: vi.fn().mockResolvedValue({ '/main.jsx': 'code' }),
      readFile: vi.fn().mockResolvedValue('<html></html>'),
    };

    const sandbox = {
      attachPreviewRecovery: vi.fn(),
      attachDiagnosticEngine: vi.fn(),
      setPreviewUrl: vi.fn(),
      applyPreviewState: vi.fn(),
    };

    const boundary = {
      guardAsync: async (_: string, fn: () => Promise<void>) => fn(),
    };

    const controller = new BuildController(
      store as never,
      vfs as never,
      sandbox as never,
      boundary as never
    );

    const worker = controller.getWorker();
    const buildSpy = vi.spyOn(worker, 'build').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                errors: [],
                warnings: [],
                outputJS: 'out',
                outputCSS: '',
              }),
            50
          );
        })
    );

    const first = controller.runBuild();
    const second = controller.runBuild();
    await Promise.all([first, second]);

    expect(buildSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sandbox.setPreviewUrl).toHaveBeenCalledTimes(1);
    controller.dispose();
    vi.unstubAllGlobals();
  });
});
