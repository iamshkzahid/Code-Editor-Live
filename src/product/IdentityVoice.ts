/**
 * Semantic user-facing copy API. Truthful UI takes precedence over friendly tone.
 */
import type { VerbosityMode } from './productPolicy';

export type PreviewStateKind = 'current' | 'last_working' | 'none' | 'preparing';

export interface BuildFailedContext {
  primaryFile?: string;
  primaryLine?: number;
  errorCount: number;
  technicalSummary?: string;
}

export interface PreviewUpdatedContext {
  durationMs: number;
  stale: boolean;
  changedFileCount?: number;
}

export interface DiagnosticVoiceContext {
  headline: string;
  technicalMessage: string;
  file?: string;
  line?: number;
  col?: number;
  source?: string;
}

export interface RecoveredContext {
  durationMs: number;
  issuesResolved: number;
}

export interface ExplainVoiceContext {
  headline: string;
  technicalMessage: string;
  confidence?: 'high' | 'medium' | 'low';
}

export type EmptySurface = 'console' | 'problems' | 'notifications' | 'replay' | 'preview';

export const IdentityVoice = {
  buildStopped(ctx: BuildFailedContext, mode: VerbosityMode = 'beginner'): string {
    return IdentityVoice.buildFailed(ctx, mode);
  },

  buildFailed(ctx: BuildFailedContext, mode: VerbosityMode = 'beginner'): string {
    const loc =
      ctx.primaryFile != null
        ? `${ctx.primaryFile}${ctx.primaryLine != null ? ` line ${ctx.primaryLine}` : ''}`
        : null;
    if (mode === 'expert' && ctx.technicalSummary) {
      return `Build stopped · ${ctx.technicalSummary}`;
    }
    if (mode === 'intermediate') {
      return loc
        ? `Build stopped. Most likely fix: ${loc}.`
        : `Build stopped. ${ctx.errorCount} issue${ctx.errorCount === 1 ? '' : 's'} to review.`;
    }
    return loc
      ? `Build stopped. Here's the most likely place to start: ${loc}.`
      : `Build stopped. Let's review ${ctx.errorCount} issue${ctx.errorCount === 1 ? '' : 's'}.`;
  },

  previewUpdated(ctx: PreviewUpdatedContext): string {
    if (ctx.stale) {
      return 'Showing last working preview. You can keep editing while we rebuild.';
    }
    if (ctx.durationMs < 150) {
      return 'Preview updated.';
    }
    return `Preview updated in ${Math.round(ctx.durationMs)}ms.`;
  },

  previewPreparing(): string {
    return 'Preparing your preview…';
  },

  previewStateLabel(kind: PreviewStateKind): string {
    switch (kind) {
      case 'current':
        return 'Preview · current build';
      case 'last_working':
        return 'Preview · last working version';
      case 'preparing':
        return 'Preparing your preview…';
      case 'none':
      default:
        return 'Preview · not available';
    }
  },

  buildCompiling(elapsedMs: number): string {
    if (elapsedMs < 150) return '';
    if (elapsedMs < 500) return 'Updating preview…';
    if (elapsedMs < 2_000) return 'Optimizing project…';
    return 'Large project. Previous preview may still be visible.';
  },

  problemFound(ctx: DiagnosticVoiceContext, mode: VerbosityMode = 'beginner'): string {
    if (mode === 'expert') {
      const loc = [ctx.file, ctx.line, ctx.col].filter((v) => v != null).join(':');
      return loc ? `${ctx.technicalMessage} · ${loc}` : ctx.technicalMessage;
    }
    if (mode === 'intermediate') {
      return ctx.headline;
    }
    return ctx.headline;
  },

  problemTechnicalDetail(ctx: DiagnosticVoiceContext): string {
    return ctx.technicalMessage;
  },

  recovered(ctx: RecoveredContext): string {
    return IdentityVoice.recovery(ctx);
  },

  recovery(ctx: RecoveredContext): string {
    return `Build recovered in ${Math.round(ctx.durationMs)}ms · ${ctx.issuesResolved} issue${ctx.issuesResolved === 1 ? '' : 's'} resolved`;
  },

  explain(ctx: ExplainVoiceContext): string {
    if (ctx.confidence === 'low') {
      return ctx.headline.startsWith('This may') || ctx.headline.startsWith('Based on')
        ? ctx.headline
        : `This may be related to: ${ctx.headline}`;
    }
    if (ctx.confidence === 'medium') {
      return ctx.headline.startsWith('This may') ? ctx.headline : `This may be related to ${ctx.headline.toLowerCase()}`;
    }
    return ctx.headline;
  },

  fixAppliedRebuilding(): string {
    return 'Fix applied · rebuilding…';
  },

  emptyState(surface: EmptySurface): string {
    switch (surface) {
      case 'console':
        return 'Logs will appear here when your application runs.';
      case 'problems':
        return 'Everything looks healthy.';
      case 'notifications':
        return "You're all caught up.";
      case 'replay':
        return 'No story yet. Events appear as you build and edit.';
      case 'preview':
        return 'Preparing your preview…';
      default:
        return '';
    }
  },

  workerRecovering(): string {
    return 'Compiler restarting…';
  },

  workerRecovered(): string {
    return 'Compiler ready.';
  },

  sourceLocationUnavailable(detail?: string): string {
    return detail
      ? `Source location is unavailable. ${detail}`
      : 'No source location is available for this problem.';
  },

  fileUnavailable(file: string): string {
    return `The file ${file} is not available. It may have been renamed or deleted.`;
  },

  navigationFailed(file: string, line: number): string {
    return `Could not navigate to line ${line} in ${file}. The location may be invalid.`;
  },

  whyShowing(): string {
    return 'Why am I seeing this?';
  },

  bootFailed(): string {
    return 'Code Editor Live could not finish starting. Please reload.';
  },
};
