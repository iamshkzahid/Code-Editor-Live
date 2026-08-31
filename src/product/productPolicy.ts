/**
 * Phase 5A — centralized behavioral thresholds.
 * All Phase 5 timing/limits must be read from here.
 */
export type VerbosityMode = 'beginner' | 'intermediate' | 'expert';

export const productPolicy = {
  build: {
    debounceMs: 150,
    workerTimeoutMs: 30_000,
    maxConsecutiveFailuresBeforeRestart: 2,
    heartbeatIntervalMs: 5_000,
    gracefulShutdownMs: 2_000,
  },
  flow: {
    activityIdleMs: {
      typing: 2_000,
      reading: 8_000,
      debugging: 15_000,
      searching: 5_000,
    },
  },
  confidence: {
    weights: {
      critical: 15,
      error: 8,
      warning: 3,
      runtime: 10,
      buildFail: 20,
      bundleRegression: 5,
    },
    label: 'Project Confidence',
    subtitle: 'heuristic · based on diagnostics & build state',
  },
  toast: {
    maxVisible: 3,
    dismissMs: 5_000,
  },
  replay: {
    maxEvents: 20,
  },
  animation: {
    hoverMs: 100,
    toastEnterMs: 200,
    lineFlashMs: 1_200,
  },
  perceivedPerformance: {
    silentBelowMs: 150,
    updatingBelowMs: 500,
    optimizingBelowMs: 2_000,
  },
  adaptive: {
    intermediateAfterSessions: 5,
    expertAfterSessions: 20,
    defaultVerbosity: 'beginner' as VerbosityMode,
  },
  diagnostics: {
    maxRecords: 5_000,
  },
} as const;
