import { productPolicy } from '../product/productPolicy';
import type { IDisposable } from './IDisposable';

export interface BuildError {
  text: string;
  location?: { file: string; line: number; column: number };
}

export interface BuildWarning {
  text: string;
  location?: { file: string; line: number; column: number };
}

export interface BuildResult {
  errors: BuildError[];
  warnings: BuildWarning[];
  outputJS: string;
  outputCSS: string;
  sourceMapJson?: string;
}

interface PendingBuild {
  resolve: (r: BuildResult) => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export type WorkerHealthStatus = 'healthy' | 'busy' | 'unresponsive' | 'dead';

export interface WorkerHealth {
  status: WorkerHealthStatus;
  lastHeartbeat: number;
  buildCount: number;
}

/**
 * Manages compiler worker lifecycle: cancellation, timeouts, bounded restart.
 */
export class WorkerSupervisor implements IDisposable {
  private worker: Worker | null = null;
  private pending: PendingBuild | null = null;
  private activeBuildId = 0;
  private consecutiveFailures = 0;
  private buildCount = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAt = 0;
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private errorHandler: ((e: ErrorEvent) => void) | null = null;

  constructor() {
    this.spawnWorker();
  }

  getHealth(): WorkerHealth {
    const heartbeatAge = this.lastHeartbeatAt === 0 ? Infinity : Date.now() - this.lastHeartbeatAt;
    const heartbeatMissed = this.lastHeartbeatAt > 0 && heartbeatAge > productPolicy.build.heartbeatIntervalMs * 2;
    return {
      status: !this.worker
        ? 'dead'
        : heartbeatMissed
          ? 'unresponsive'
          : this.pending
            ? 'busy'
            : 'healthy',
      lastHeartbeat: this.lastHeartbeatAt,
      buildCount: this.buildCount,
    };
  }

  build(files: Record<string, string>): Promise<BuildResult> {
    this.cancelActive('Superseded by newer build');

    const buildId = ++this.activeBuildId;
    if (!this.worker) {
      this.spawnWorker();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pending && buildId === this.activeBuildId) {
          this.pending = null;
          this.handleFailure(new Error('Build timed out'));
          reject(new Error('Build timed out'));
        }
      }, productPolicy.build.workerTimeoutMs);

      this.pending = { resolve, reject, timeoutId };

      this.worker!.postMessage({ type: 'BUILD', id: buildId, files });
    });
  }

  cancelActive(reason = 'Cancelled'): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timeoutId);
    const { reject } = this.pending;
    this.pending = null;
    reject(new Error(reason));
  }

  async restart(): Promise<void> {
    this.cancelActive('Worker restarting');
    this.disposeWorker();
    this.spawnWorker();
    this.consecutiveFailures = 0;
  }

  dispose(): void {
    this.cancelActive('Worker disposed');
    this.disposeWorker();
  }

  private spawnWorker(): void {
    this.lastHeartbeatAt = 0;
    this.worker = new Worker(
      new URL('../worker/compiler.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.messageHandler = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'PONG') {
        this.lastHeartbeatAt = Date.now();
        return;
      }

      if (data.type === 'BUILD_RESULT') {
        if (data.id !== this.activeBuildId || !this.pending) {
          return;
        }

        const { resolve, timeoutId } = this.pending;
        clearTimeout(timeoutId);
        this.pending = null;
        this.buildCount += 1;
        this.consecutiveFailures = 0;

        resolve({
          errors: data.errors ?? [],
          warnings: data.warnings ?? [],
          outputJS: data.outputJS ?? '',
          outputCSS: data.outputCSS ?? '',
          sourceMapJson: data.sourceMapJson,
        });
      }
    };

    this.errorHandler = (e: ErrorEvent) => {
      console.error('[WorkerSupervisor] Worker error:', e);
      this.handleFailure(new Error(e.message || 'Worker error'));
    };

    this.worker.addEventListener('message', this.messageHandler);
    this.worker.addEventListener('error', this.errorHandler);

    this.heartbeatTimer = setInterval(() => {
      try {
        this.worker?.postMessage({ type: 'PING' });
      } catch {
        /* worker may be terminating */
      }
    }, productPolicy.build.heartbeatIntervalMs);
  }

  private disposeWorker(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.worker && this.messageHandler) {
      this.worker.removeEventListener('message', this.messageHandler);
    }
    if (this.worker && this.errorHandler) {
      this.worker.removeEventListener('error', this.errorHandler);
    }
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'SHUTDOWN' });
      } catch {
        /* ignore */
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.messageHandler = null;
    this.errorHandler = null;
  }

  private async handleFailure(error: Error): Promise<void> {
    this.consecutiveFailures += 1;
    if (this.pending) {
      clearTimeout(this.pending.timeoutId);
      this.pending.reject(error);
      this.pending = null;
    }
    if (this.consecutiveFailures >= productPolicy.build.maxConsecutiveFailuresBeforeRestart) {
      await this.restart();
    }
  }
}
