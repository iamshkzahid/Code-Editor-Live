export type SubsystemHealth = 'healthy' | 'degraded' | 'failed';

export interface SubsystemError {
  subsystem: string;
  error: unknown;
  timestamp: number;
}

/**
 * Minimal error boundary — subsystem failures must not take down the editor.
 */
export class PlatformErrorBoundary {
  private health = new Map<string, SubsystemHealth>();
  private listeners: Array<(err: SubsystemError) => void> = [];

  guard<T>(subsystem: string, fn: () => T): T | undefined {
    try {
      const result = fn();
      this.health.set(subsystem, 'healthy');
      return result;
    } catch (error) {
      this.markFailed(subsystem, error);
      return undefined;
    }
  }

  async guardAsync<T>(subsystem: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn();
      this.health.set(subsystem, 'healthy');
      return result;
    } catch (error) {
      this.markFailed(subsystem, error);
      return undefined;
    }
  }

  onError(callback: (err: SubsystemError) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  getHealth(): Record<string, SubsystemHealth> {
    return Object.fromEntries(this.health);
  }

  recover(subsystem: string): void {
    this.health.set(subsystem, 'degraded');
  }

  private markFailed(subsystem: string, error: unknown): void {
    this.health.set(subsystem, 'failed');
    const payload: SubsystemError = { subsystem, error, timestamp: Date.now() };
    console.error(`[PlatformErrorBoundary] ${subsystem}`, error);
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        /* listener errors must not propagate */
      }
    }
  }
}
