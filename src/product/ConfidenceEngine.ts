import type { Diagnostic } from '../store/index';
import type { BuildState } from '../store/index';
import { productPolicy } from './productPolicy';

export interface ConfidenceEvidence {
  label: string;
  penalty: number;
}

export interface ConfidenceIssue {
  file?: string;
  line?: number;
  col?: number;
  message: string;
  reason: string;
}

export interface ConfidenceSummary {
  score: number;
  errors: number;
  warnings: number;
  runtimeErrors: number;
  buildDurationMs?: number;
  buildState: BuildState;
  primaryIssue: ConfidenceIssue | null;
  evidence: ConfidenceEvidence[];
  subtitle: string;
  isHeuristic: true;
}

export interface ConfidenceInput {
  diagnostics: Diagnostic[];
  buildState: BuildState;
  buildDurationMs?: number;
}

export class ConfidenceEngine {
  evaluate(input: ConfidenceInput): ConfidenceSummary {
    const errors = input.diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = input.diagnostics.filter((d) => d.severity === 'warning').length;
    const runtimeErrors = input.diagnostics.filter((d) => d.source === 'runtime').length;
    const evidence: ConfidenceEvidence[] = [];
    const weights = productPolicy.confidence.weights;

    if (errors > 0) evidence.push({ label: `${errors} error${errors === 1 ? '' : 's'}`, penalty: errors * weights.error });
    if (warnings > 0) evidence.push({ label: `${warnings} warning${warnings === 1 ? '' : 's'}`, penalty: warnings * weights.warning });
    if (runtimeErrors > 0) evidence.push({ label: `${runtimeErrors} runtime error${runtimeErrors === 1 ? '' : 's'}`, penalty: runtimeErrors * weights.runtime });
    const hasBuildFailure = input.buildState === 'error' && input.diagnostics.some((d) => d.source !== 'runtime');
    if (hasBuildFailure) evidence.push({ label: 'build failure', penalty: weights.buildFail });

    const penalty = evidence.reduce((sum, item) => sum + item.penalty, 0);
    const primary = input.diagnostics.find((d) => d.severity === 'error')
      ?? input.diagnostics.find((d) => d.severity === 'warning');

    return {
      score: Math.max(0, Math.min(100, 100 - penalty)),
      errors,
      warnings,
      runtimeErrors,
      buildDurationMs: input.buildDurationMs == null ? undefined : Math.max(0, Math.round(input.buildDurationMs)),
      buildState: input.buildState,
      primaryIssue: primary ? {
        file: primary.file,
        line: primary.line,
        col: primary.col,
        message: primary.message,
        reason: this.issueReason(primary, input.buildState),
      } : null,
      evidence,
      subtitle: productPolicy.confidence.subtitle,
      isHeuristic: true,
    };
  }

  private issueReason(diagnostic: Diagnostic, buildState: BuildState): string {
    if (diagnostic.source === 'runtime') return 'runtime evidence points to this location';
    if (buildState === 'error') return 'the build stopped on this diagnostic';
    if (diagnostic.severity === 'warning') return 'available warning evidence points here';
    return 'available diagnostic evidence points here';
  }
}
