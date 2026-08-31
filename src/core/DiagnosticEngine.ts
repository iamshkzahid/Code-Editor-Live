import { productPolicy } from '../product/productPolicy';
import type { Diagnostic } from '../store/index';
import type { IDisposable } from './IDisposable';
import { orderDiagnostics } from '../product/Explainability';

export type DiagnosticSource = 'esbuild' | 'runtime' | 'build';

export interface DiagnosticInput {
  severity: Diagnostic['severity'];
  message: string;
  file?: string;
  line?: number;
  col?: number;
  source?: DiagnosticSource;
  code?: string;
  stack?: string;
  buildGeneration?: number;
}

export interface DiagnosticRecord extends DiagnosticInput {
  id: string;
  hash: string;
  technicalMessage: string;
  createdAt: number;
  updatedAt: number;
}

type StoreSink = {
  setDiagnostics: (d: Diagnostic[]) => void;
};

function hashDiagnostic(input: DiagnosticInput): string {
  const normalized = input.message.trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    input.source ?? 'esbuild',
    input.file ?? '',
    String(input.line ?? ''),
    String(input.col ?? ''),
    normalized,
  ].join('|');
}

function createId(): string {
  return `diag-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Single ingestion point for diagnostics. Dedupes by hash, preserves stable IDs.
 */
export class DiagnosticEngine implements IDisposable {
  private records = new Map<string, DiagnosticRecord>();
  private sink: StoreSink;
  private listeners = new Set<() => void>();
  private currentBuildGeneration = 0;
  private disposed = false;

  constructor(sink: StoreSink) {
    this.sink = sink;
  }

  setBuildGeneration(generation: number): void {
    this.currentBuildGeneration = generation;
  }

  getBuildGeneration(): number {
    return this.currentBuildGeneration;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ingest(batch: DiagnosticInput[]): void {
    if (this.disposed) return;
    const now = Date.now();
    for (const input of batch) {
      const hash = hashDiagnostic(input);
      const existing = this.records.get(hash);
      if (existing) {
        existing.updatedAt = now;
        existing.message = input.message;
        existing.technicalMessage = input.message;
        existing.severity = input.severity;
        existing.file = input.file;
        existing.line = input.line;
        existing.col = input.col;
        existing.source = input.source ?? existing.source;
        existing.code = input.code ?? existing.code;
        existing.stack = input.stack ?? existing.stack;
        if (input.buildGeneration != null) existing.buildGeneration = input.buildGeneration;
      } else {
        this.records.set(hash, {
          ...input,
          id: createId(),
          hash,
          technicalMessage: input.message,
          source: input.source ?? 'esbuild',
          buildGeneration: input.buildGeneration ?? this.currentBuildGeneration,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    this.enforceLimit();
    this.flush();
  }

  replaceAll(batch: DiagnosticInput[]): void {
    if (this.disposed) return;
    this.records.clear();
    this.ingest(batch);
  }

  clearBuildDiagnostics(): void {
    if (this.disposed) return;
    for (const [hash, record] of this.records) {
      if (record.source === 'esbuild' || record.source === 'build') {
        this.records.delete(hash);
      }
    }
    this.flush();
  }

  clearRuntimeDiagnostics(): void {
    if (this.disposed) return;
    for (const [hash, record] of this.records) {
      if (record.source === 'runtime') this.records.delete(hash);
    }
    this.flush();
  }

  getActive(): DiagnosticRecord[] {
    return [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getOrdered(activeFile?: string | null): DiagnosticRecord[] {
    return orderDiagnostics(this.getActive(), activeFile);
  }

  getById(id: string): DiagnosticRecord | undefined {
    return this.getActive().find((r) => r.id === id);
  }

  getPrimary(): DiagnosticRecord | undefined {
    const errors = this.getActive().filter((r) => r.severity === 'error');
    return errors[0] ?? this.getActive()[0];
  }

  dismiss(id: string): void {
    if (this.disposed) return;
    const record = this.getById(id);
    if (record) {
      this.records.delete(record.hash);
      this.flush();
    }
  }

  private enforceLimit(): void {
    const max = productPolicy.diagnostics.maxRecords;
    if (this.records.size <= max) return;
    const sorted = this.getActive();
    const toRemove = sorted.slice(max);
    for (const r of toRemove) {
      this.records.delete(r.hash);
    }
  }

  private flush(): void {
    if (this.disposed) return;
    const diagnostics: Diagnostic[] = this.getOrdered().map((r) => ({
      id: r.id,
      severity: r.severity,
      message: r.message,
      file: r.file,
      line: r.line,
      col: r.col,
      source: r.source,
      code: r.code,
      stack: r.stack,
      buildGeneration: r.buildGeneration,
    }));
    this.sink.setDiagnostics(diagnostics);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* listener errors must not propagate */
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.records.clear();
    this.listeners.clear();
    this.sink.setDiagnostics([]);
  }
}
