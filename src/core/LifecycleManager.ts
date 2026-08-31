import type { IDisposable } from './IDisposable';

export function attachBootGatedBuildListener(
  onChange: (listener: () => void) => void,
  scheduleBuild: () => void
): () => void {
  let booting = true;
  onChange(() => {
    if (!booting) scheduleBuild();
  });
  return () => {
    booting = false;
  };
}

type CleanupFn = () => void;

/**
 * Tracks disposables and cleanup callbacks. Prevents duplicate listeners after restart.
 */
export class LifecycleManager implements IDisposable {
  private readonly disposables = new Map<string, IDisposable>();
  private readonly cleanups = new Map<string, CleanupFn>();

  register(name: string, instance: IDisposable): void {
    if (this.disposables.has(name)) {
      this.disposables.get(name)!.dispose();
    }
    this.disposables.set(name, instance);
  }

  registerCleanup(name: string, fn: CleanupFn): void {
    const existing = this.cleanups.get(name);
    if (existing) existing();
    this.cleanups.set(name, fn);
  }

  unregister(name: string): void {
    this.disposables.get(name)?.dispose();
    this.disposables.delete(name);
    const cleanup = this.cleanups.get(name);
    if (cleanup) {
      cleanup();
      this.cleanups.delete(name);
    }
  }

  disposeAll(): void {
    for (const name of [...this.disposables.keys()]) {
      this.unregister(name);
    }
    for (const name of [...this.cleanups.keys()]) {
      this.unregister(name);
    }
  }

  getRegistered(): string[] {
    return [...new Set([...this.disposables.keys(), ...this.cleanups.keys()])];
  }

  dispose(): void {
    this.disposeAll();
  }
}
