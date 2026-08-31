import { DiagnosticEngine, type DiagnosticInput } from '../core/DiagnosticEngine';
import { PlatformErrorBoundary } from '../core/PlatformErrorBoundary';
import { PreviewRecovery } from '../core/PreviewRecovery';
import { WorkerSupervisor } from '../core/WorkerSupervisor';
import { IdentityVoice } from '../product/IdentityVoice';
import { productPolicy } from '../product/productPolicy';
import type { IDEStore } from '../store/index';
import type { SandboxController } from '../sandbox/SandboxController';
import { SourceMapResolver } from './SourceMapResolver';
import type { VFSController } from '../vfs/VFSController';
import { ConfidenceEngine } from '../product/ConfidenceEngine';
import type { FlowEngine } from '../product/FlowEngine';
import { DebugReplay } from '../product/DebugReplay';

type StoreApi = {
  getState: () => IDEStore;
};

interface ExperienceEngines {
  confidence?: ConfidenceEngine;
  flow?: FlowEngine;
  replay?: DebugReplay;
}

export class BuildController {
  private worker: WorkerSupervisor;
  private diagnostics: DiagnosticEngine;
  private preview: PreviewRecovery;
  private boundary: PlatformErrorBoundary;
  private store: StoreApi;
  private sandbox: SandboxController;
  private vfs: VFSController;
  private buildGeneration = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private compileStartMs = 0;
  private previousErrorCount = 0;
  private sourceMaps = new SourceMapResolver();
  private confidence: ConfidenceEngine;
  private flow: FlowEngine | undefined;
  private replay: DebugReplay | undefined;

  constructor(
    store: StoreApi,
    vfs: VFSController,
    sandbox: SandboxController,
    boundary: PlatformErrorBoundary,
    experience: ExperienceEngines = {}
  ) {
    this.store = store;
    this.vfs = vfs;
    this.sandbox = sandbox;
    this.boundary = boundary;
    this.worker = new WorkerSupervisor();
    this.preview = new PreviewRecovery();
    this.diagnostics = new DiagnosticEngine(store.getState());
    this.confidence = experience.confidence ?? new ConfidenceEngine();
    this.flow = experience.flow;
    this.replay = experience.replay;
    sandbox.attachPreviewRecovery(this.preview);
    sandbox.attachDiagnosticEngine(this.diagnostics);
    sandbox.attachSourceMapResolver?.(this.sourceMaps);
  }

  scheduleBuild(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runBuild();
    }, productPolicy.build.debounceMs);
  }

  async runBuild(): Promise<void> {
    const generation = ++this.buildGeneration;
    this.diagnostics.setBuildGeneration(generation);
    this.compileStartMs = performance.now();
    this.store.getState().setBuildState('compiling');
    this.store.getState().setBuildStatusText(IdentityVoice.previewPreparing());

    await this.boundary.guardAsync('build', async () => {
      const files = await this.vfs.readAllFiles();
      const result = await this.worker.build(files);

      if (generation !== this.buildGeneration) {
        return;
      }

      if (result.errors.length > 0) {
        this.handleBuildFailure(result.errors, generation);
        return;
      }

      await this.handleBuildSuccess(result, generation);
    });

    if (generation === this.buildGeneration && this.store.getState().buildState === 'compiling') {
      this.store.getState().setBuildState('error');
      this.store.getState().setBuildStatusText(
        IdentityVoice.buildStopped({ errorCount: 1, technicalSummary: 'Build subsystem failed' })
      );
    }
  }

  private handleBuildFailure(
    errors: Array<{ text: string; location?: { file: string; line: number; column: number } }>,
    generation: number
  ): void {
    if (generation !== this.buildGeneration) return;

    const inputs: DiagnosticInput[] = errors.map((e) => ({
      severity: 'error' as const,
      message: e.text,
      file: e.location?.file,
      line: e.location?.line,
      col: e.location?.column,
      source: 'esbuild' as const,
      buildGeneration: generation,
    }));

    this.diagnostics.replaceAll(inputs);
    this.preview.freezeOnFailure();
    this.sandbox.applyPreviewState();

    const primary = this.diagnostics.getPrimary();
    this.flow?.recordDebugging();
    this.replay?.recordBuildFailure(primary?.file, primary?.line, primary?.technicalMessage ?? 'a build error');
    this.replay?.recordPreviewFrozen();
    this.publishConfidence(performance.now() - this.compileStartMs, 'error');
    this.store.getState().setBuildState('error');
    this.store.getState().setPreviewMode(this.preview.getMode());
    this.store.getState().setBuildStatusText(
      IdentityVoice.buildStopped({
        primaryFile: primary?.file,
        primaryLine: primary?.line,
        errorCount: errors.length,
        technicalSummary: primary?.technicalMessage,
      })
    );
    this.previousErrorCount = errors.length;
  }

  private async handleBuildSuccess(
    result: { outputJS: string; outputCSS: string; sourceMapJson?: string; warnings?: Array<{ text: string; location?: { file: string; line: number; column: number } }> },
    generation: number
  ): Promise<void> {
    if (generation !== this.buildGeneration) return;

    this.sourceMaps.setFromBundle(result.outputJS, result.sourceMapJson);

    const html = await this.vfs.readFile('/index.html').catch(() => '');
    const blobUrl = this.preview.commitSuccess(html, result.outputJS, result.outputCSS);
    this.sandbox.setPreviewUrl(blobUrl);

    const durationMs = performance.now() - this.compileStartMs;
    const resolvedCount = this.previousErrorCount;
    const runtimeErrorCount = this.diagnostics.getActive().filter((record) => record.source === 'runtime').length;

    this.diagnostics.clearBuildDiagnostics();
    this.diagnostics.clearRuntimeDiagnostics();
    if (result.warnings?.length) {
      this.diagnostics.ingest(
        result.warnings.map((w) => ({
          severity: 'warning' as const,
          message: w.text,
          file: w.location?.file,
          line: w.location?.line,
          col: w.location?.column,
          source: 'esbuild' as const,
          buildGeneration: generation,
        }))
      );
    } else {
      this.diagnostics.ingest([]);
    }

    const nextBuildState = 'ready' as const;
    this.publishConfidence(durationMs, nextBuildState);
    if (resolvedCount > 0 || runtimeErrorCount > 0) this.replay?.recordRecovery(durationMs);
    else this.replay?.recordPreviewUpdated(durationMs);

    this.store.getState().setBuildState(nextBuildState);
    this.store.getState().setPreviewMode('current');
    this.store.getState().setBuildStatusText(
      resolvedCount > 0
        ? IdentityVoice.recovered({ durationMs, issuesResolved: resolvedCount })
        : IdentityVoice.previewUpdated({ durationMs, stale: false })
    );
    this.previousErrorCount = 0;
  }

  private publishConfidence(durationMs: number, buildState: 'error' | 'ready'): void {
    const setConfidence = this.store.getState().setConfidence;
    if (!setConfidence) return;
    setConfidence(this.confidence.evaluate({
      diagnostics: this.store.getState().diagnostics,
      buildState,
      buildDurationMs: durationMs,
    }));
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.worker.dispose();
    this.preview.dispose();
    this.diagnostics.dispose();
  }

  getPreviewRecovery(): PreviewRecovery {
    return this.preview;
  }

  getWorker(): WorkerSupervisor {
    return this.worker;
  }

  getDiagnosticEngine(): DiagnosticEngine {
    return this.diagnostics;
  }

  getSourceMapResolver(): SourceMapResolver {
    return this.sourceMaps;
  }
}
