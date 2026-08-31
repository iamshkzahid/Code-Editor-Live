Phase 5: The Debugging Experience



Status: APPROVED FOR IMPLEMENTATION — after Checkpoint 0 docs + contracts below. Architecture closed. Remaining risk is execution quality, not design.



Hierarchy: Truth & Safety → Product → Identity → Engineering. A pleasant experience must never override what is technically true.



Core Principle: Truthful UI



Never make the interface appear more certain than the underlying system actually is.







Bad



Better





Confidence 96% (when guessing)



Likely cause — based on available evidence





Preview ready (stale build)



Showing last working preview





Fixed (build not done)



Fix applied · rebuilding…





This is where it started (unverified)



This may be where the problem started

Documented in [TRUTHFUL_UI.md](Code-Editor-Live/TRUTHFUL_UI.md). Supersedes Identity when they conflict.



Mandatory Checkpoint 0 (Docs Before Code)







Document



Purpose





[TRUTHFUL_UI.md](Code-Editor-Live/TRUTHFUL_UI.md)



Certainty calibration rules





[PRODUCT_IDENTITY.md](Code-Editor-Live/PRODUCT_IDENTITY.md)



Voice & personality





[PRODUCT_PHILOSOPHY.md](Code-Editor-Live/PRODUCT_PHILOSOPHY.md)



Why we exist





[MICROINTERACTIONS.md](Code-Editor-Live/MICROINTERACTIONS.md)



How controls feel





[COMPLEXITY_BUDGET.md](Code-Editor-Live/COMPLEXITY_BUDGET.md)



Every feature deletes/simplifies





[DO_NOT_SHIP.md](Code-Editor-Live/DO_NOT_SHIP.md)



Hard product guardrails





[PLATFORM_CONSTITUTION.md](Code-Editor-Live/PLATFORM_CONSTITUTION.md)



Engineering rules





[DESIGN_REVIEW.md](Code-Editor-Live/DESIGN_REVIEW.md)



UI PR checklist + experience regression budget





[FEATURE_LIFECYCLE.md](Code-Editor-Live/FEATURE_LIFECYCLE.md)



Experimental → Removed





[PRODUCT_DEBT.md](Code-Editor-Live/PRODUCT_DEBT.md)



Product debt tracker





[PRODUCT_MIGRATIONS.md](Code-Editor-Live/PRODUCT_MIGRATIONS.md)



Workspace compatibility





[NAVIGATION_CONTRACT.md](Code-Editor-Live/NAVIGATION_CONTRACT.md)



One way to navigate



Seven Production Contracts (P13–P19)

Added to Appendix A. Non-negotiable.







ID



Contract





P13



Truthful UI — UI never communicates greater certainty than the system supports





P14



Expert escape hatch — Friendly copy is adaptive verbosity; raw technical detail always one action away, never hidden





P15



Stale-state transparency — Stale preview, queued diagnostic, delayed build, cached result always distinguishable from current state





P16



Confidence calibration — Confidence is a heuristic health indicator, not probability of correctness; show breakdown





P17



Critical bypass — Security, data-loss, auth, destructive Git warnings bypass Flow suppression





P18



Product threshold config — All behavioral thresholds in productPolicy.ts, not scattered constants





P19



Trust validation — Phase 5 passes Trust, Silence, Recovery tests — not visual preference alone



DO_NOT_SHIP.md (Summary)





Fake confidence / fake progress / fake success



Unexplained personalization



Disruptive AI / auto-edit without approval



Animations that compete with code



Technical jargon as primary explanation (jargon in detail is fine)



Silent data collection



Stale preview presented as current



Friendly language that obscures serious failures



Product Policy (src/product/productPolicy.ts)

P18. Single configurable object — tune UX from sessions without code changes.

export const productPolicy = {
  flow: {
    activityIdleMs: { typing: 2000, reading: 8000, debugging: 15000, searching: 5000 },
    deferNonCritical: true,
  },
  confidence: {
    weights: { critical: 15, error: 8, warning: 3, runtime: 10, buildFail: 20, bundleRegression: 5 },
    label: 'Project Confidence',  // subtitle: 'heuristic · based on diagnostics & build state'
  },
  toast: { maxVisible: 3, dismissMs: 5000 },
  replay: { maxEvents: 20 },
  animation: { hoverMs: 100, toastEnterMs: 200, lineFlashMs: 1200 },
  perceivedPerformance: { silentBelowMs: 150, updatingBelowMs: 500, optimizingBelowMs: 2000 },
  adaptive: { intermediateAfterSessions: 5, expertAfterSessions: 20 },
};



IdentityVoice — Semantic API (Not a Dictionary)

// src/product/IdentityVoice.ts
IdentityVoice.buildFailed(ctx, mode: VerbosityMode)
IdentityVoice.previewUpdated({ durationMs, stale: boolean, changedFiles })
IdentityVoice.problemFound(diagnostic, mode)
IdentityVoice.recovered(summary)
IdentityVoice.emptyState(surface)
IdentityVoice.explainBeforeError({ confidence: 'high' | 'low', ... })

Verbosity modes (P14) — control verbosity, not truth:







Mode



Example for type error





Beginner



"You're close — a string was expected here, but a number was provided."





Intermediate



"Type mismatch — number is not assignable to string."





Expert



"TS2322 · number → string · client.ts:42"

Expert mode: always available via toggle, problem card expand, or Cmd+. — never force friendliness.

Copy rule: Never use raw technical labels as the primary UX explanation. Words like "error", "failed", "loading" are allowed when technically appropriate (Runtime error, TS2322, Loading Python runtime).



Confidence Engine (Recalibrated — P16)

Not "your project is 72% correct." Is heuristic health from available signals.

Display:

Project Confidence  72
heuristic · based on diagnostics & build state

−16   2 errors
−10   runtime failure
−2    1 warning
      bundle unchanged

Most significant issue
App.tsx · line 42
Fixing this may restore ~18 points

Primary metric + objective facts (experts need evidence):

Confidence 72  ·  2 errors · 1 warning · build 48ms

Confidence = summary. Raw counts = evidence. Both visible.

Attribution language: "Most likely cause based on available evidence" — never stated as fact.



Flow Engine (Activity Context — Not Rigid 2s)

Flow = no meaningful interruption of non-essential updates.

Activity states (inferred, not user-selected):







State



Idle threshold



Defer non-critical?





Typing



2s



Yes





Reading



8s



Yes





Debugging



15s



Partial (badge updates OK)





Searching



5s



Yes





Idle



immediate flush



No

P17 — Never defer:





Critical runtime errors (queued badge + full detail on demand immediately)



Security warnings



Destructive Git operations



Authentication failures



Data-loss warnings

Status bar (refined): No non-essential visual churn during flow — not "no changes whatsoever." Git conflict detected still surfaces. Compiling… text suppressed; dot pulse OK after 150ms.

Internal only: Flow score drives policy tuning. Not user-visible.



TUC — Formal Definition (P15)

TUC = time from user-triggering an operation
    until the user can continue meaningful work
    without uncertainty about system state.

Not "time until something appears on screen."







Class



Meaning





TUC-success



Preview reflects latest successful build





TUC-stale-preview



Editing continues; preview shows last working version (labeled)





TUC-error



Build failed; user knows preview may be stale





TUC-recovery



Worker/subsystem restarted; state explicit





TUC-cancelled



Superseded by newer operation

Stale preview copy: "Showing last working preview. You can keep editing while we rebuild."

PerformanceBudget records tucMs by class. CI gate on TUC-success path.



Explainability + Explain-Before-Error

After error: headline (calibrated) → explanation → why showing → next action.

Calibrated language: "may", "likely", "based on available evidence".

Before error (confidence-gated):

High confidence:

This import doesn't match any file. Did you mean ./components/Button.tsx?

Low confidence:

This may fail at runtime — `user` might be undefined here.
Check whether `user` is initialized before this line.

Never present guesses as certainty.



Debug Replay (Causal — Not Event Log)

Differentiation hypothesis — validate through competitive testing, not absolute market claims.

Causal chain example:

You renamed UserCard
        ↓
App.tsx still imports ButtonCard
        ↓
Build detected a missing export
        ↓
Preview stayed on the last working version

Each item:

interface ReplayStep {
  event: string;
  affectedFile?: string;
  resultingState: string;   // e.g. "build: failure", "preview: frozen"
  source: 'edit' | 'build' | 'runtime' | 'git';
  confidence: 'high' | 'medium' | 'low';
  causalLink?: string;      // "because import was not updated"
}

Replaces separate build timeline UI. MVP: last 20 steps, list + click-to-navigate, export markdown.



Recovery Delight

On fix (Identity voice, truthful):

✓ Build recovered
  Recovered in 842ms · 2 issues resolved · Confidence +14

Only after build actually succeeds (P15). Not "Fixed" while rebuilding.



Project Intelligence

Ambient hints (max 1/session, dismissible, calibrated):





"Bundle grew 31% — moment.js was added recently."



"Build time +18% — import count increased."

Pin suggestion: "You've edited App.tsx frequently. Pin it?" with subtle "Suggested from your recent files."



Developer Memory — Privacy Boundary

Stores: preferences, navigation patterns, UI mode, open frequency (paths only).

Never stores: source content, secrets, API keys, Git tokens.

User controls: Command Palette → Export profile · Reset · Inspect (JSON view).

Predictable personalization (P13): Any reordered UI explains why.



Frozen Platform (~1,200 lines)

DiagnosticEngine, NotificationCenter, WorkerSupervisor, PreviewRecovery, LifecycleManager, BuildHistory, SourceMapResolver, ProblemsPanel, Console refactor, ToastRenderer, components.css.

No new engines/managers/coordinators for Phase 5.



Complexity Budget

~3,500 lines · ~35 files cap. Every PR: "This deletes/simplifies: ___"

Cuts retained: AdaptiveInterface (→ memory + policy), FlowScore (→ internal), separate dashboards, ExperienceQualityEngine.



Validation Gates (P19 — Mandatory Before Ship)

Trust Test

Deliberately ambiguous errors. Ask: "Did the explanation feel accurate?" Fail if: "Sounded confident but was wrong."

Silence Test

30 min coding session. Measure: notifications, panel auto-changes, focus loss, cursor jumps, unnecessary animation. Target: zero non-critical interruptions during flow states.

Recovery Test

Build fail → worker crash → preview frozen → user keeps typing → worker restart → build success → preview recovers. At no point lose: code, cursor, focus, context, certainty about preview state.

Cohort Benchmarks (not 4/5 preference)







Cohort



Metrics





Beginner



First project time, error comprehension, first preview, help requests





Intermediate



Time-to-fix, navigation efficiency, keyboard usage





Expert



Task time, keystrokes/clicks, false-positive annoyance, diagnostic trust

Compare against CodePen, StackBlitz, CodeSandbox, Replit for relevant workflows. Document results; no superiority claims without data.



Delivery Checkpoints







#



Gate





0



All docs + productPolicy.ts skeleton





5A



Platform thin + IdentityVoice wired





5B



Explainability, Problems, source maps, next-action





5C



Flow, Confidence (calibrated), Debug Replay causal MVP





5D



Microinteractions, empty states, memory privacy, TUC





5E



Trust + Silence + Recovery tests pass; CI green



Appendix A — Product Contracts (P1–P19)







#



Contract





P1



All copy via IdentityVoice semantic API





P2



Flow = no meaningful interruption; activity contexts not single timeout





P3



Confidence primary + objective facts visible (errors, build ms)





P4



Zero config on; settings only disable





P5



Progress messages explain why (trust)





P6



TUC formal definition + stale/cancelled classes





P7



Recovery delight only after verified success





P8



Debug Replay causal; replaces timeline UIs





P9



Empty states teach (Identity voice)





P10



Complexity budget per PR





P11



Microinteraction spec





P12



Editor never disabled during build





P13



Truthful UI





P14



Expert escape hatch





P15



Stale-state transparency





P16



Confidence calibration





P17



Critical bypass





P18



productPolicy.ts thresholds





P19



Trust / Silence / Recovery validation





P20



Accessibility — truthful calibrated copy in aria-live; stale state exposed to AT; axe-core pass

Appendix B — Engineering (Frozen)

E1–E8: DiagnosticEngine gateway, dispose, error boundary, preview freeze, perf CI, source maps, axe-core, no new core without approval.



Files Summary

Docs: TRUTHFUL_UI, PRODUCT_IDENTITY, PRODUCT_PHILOSOPHY, MICROINTERACTIONS, COMPLEXITY_BUDGET, DO_NOT_SHIP, PLATFORM_CONSTITUTION, DESIGN_REVIEW, FEATURE_LIFECYCLE, PRODUCT_DEBT, PRODUCT_MIGRATIONS, NAVIGATION_CONTRACT

Product (~2,300 lines):





productPolicy.ts



IdentityVoice.ts



FlowEngine.ts



ConfidenceEngine.ts



Explainability.ts



DebugReplay.ts



NextAction.ts



ProjectIntelligence.ts



DeveloperMemory.ts



PerceivedPerformance.ts

Platform (~1,200 lines): core + ProblemsPanel + Console + ToastRenderer + components.css

Tests: tests/trust/, tests/silence/, tests/recovery/, perf, a11y, worker



Final Verdict







Dimension



Score





Engineering / Architecture / Reliability



10/10 — closed





Product direction



10/10





Trust model



10/10 — with P13–P19





Differentiation



9.8/10 — validate Debug Replay hypothesis





Production approval



YES — implement now

Win condition: "I always know what is happening. I always know what to do next. The editor never gets in my way. When something breaks, it helps me understand and recover."

Next step: Checkpoint 0 (docs) → 5A. Stop redesigning. Start building.



Appendix C — Principal Review Concordance

All items from the final production review are incorporated. No further plan iteration required unless scope changes.







Review item



Plan section





Architecture freeze + 15/25/60 allocation



Frozen Platform, Complexity Budget





Truth & Safety → Product → Identity → Engineering



Hierarchy (line 39)





Calibrated language ("may", "likely", evidence-based)



Truthful UI, Explainability, Confidence





Confidence as heuristic + breakdown



Confidence Engine (P16)





Confidence + objective facts (errors, build ms)



P3, Confidence display





Flow by activity context, not rigid 2s



Flow Engine table





Critical bypass (security, Git, auth, data-loss)



P17





Non-essential churn only (not frozen status bar)



Flow Engine, status bar rule





TUC = work without uncertainty + classes



TUC section (P15)





Explain-before-error confidence-gated



Explainability section





Debug Replay causal chain + ReplayStep



Debug Replay section





No absolute competitive claims



"Differentiation hypothesis"





Expert escape hatch (verbosity, not truth)



IdentityVoice, P14





IdentityVoice semantic API



IdentityVoice section





Jargon OK in detail, not as primary UX



Copy rule





Developer Memory privacy + export/reset



Developer Memory section





Predictable personalization hints



Project Intelligence, P13





Trust / Silence / Recovery tests + cohorts



Validation Gates (P19)





productPolicy.ts thresholds



Product Policy (P18)





DO_NOT_SHIP list



DO_NOT_SHIP.md





P13–P19 contracts



Seven Production Contracts, Appendix A

P20 — Accessibility (added)

Truthful UI applies to assistive technology: aria-live announcements use the same calibrated copy as visual UI; stale preview state exposed via aria-describedby; confidence breakdown available to screen readers (not only visual chart). axe-core zero violations remain mandatory (E7).



Appendix D — Long-Term Resilience (Final Review)







#



Addition



Document / Contract





1



Design Review Gate



DESIGN_REVIEW.md — PR checklist for UI





2



Feature Lifecycle



FEATURE_LIFECYCLE.md — Experimental → Removed + metadata





3



Experience Regression Budget



productPolicy.experienceBudget — max notifications-in-flow, focus steals, auto-opens





4



Navigation Contract



One way: Problems → Enter → Editor → Esc → Problems





5



Product Debt



PRODUCT_DEBT.md — tracked like technical debt





6



Versioned Philosophy



PRODUCT_PHILOSOPHY.md v1 with changelog section





7



Learning Measurement



Explanation expanded → fix → same error not repeated (internal metric)





8



Consistency Test



Every screen: What happened? What to do? Safe to continue? (< 2s)





9



Replay Narrative



Cause → Effect → Consequence → Recovery (not event log)





10



User Agency



P21 — never auto-fix/suppress/rewrite without approval





11



Upgrade Safety



PRODUCT_MIGRATIONS.md — workspace compatibility across phases





12



Explainability Tests



correct · actionable · calibrated · concise · expandable





13



Opinionated Defaults



P22 — config is escape hatch, not prerequisite





14



No Surprise Test



"Did anything unexpected happen?" — mandatory UX gate





15



Scale Language



Target 100k addressable; Guaranteed 5k @ 60fps





16



Workflow Benchmark



Observe → Understand → Act → Recover vs competitors





17



Durable Simplicity



P23 — each release feels simpler despite more capability

P21 — User Agency

Recommend, never take control. No auto-fix, auto-suppress, auto-ignore, or auto-rewrite without explicit user approval.

P22 — Opinionated Defaults

Every feature ships with a default that works for most users. Settings only disable or reduce — never required to enable.

P23 — Durable Simplicity



Every release should make the editor feel simpler than the previous release, even if it becomes more capable internally.

Placed directly under Truthful UI in document hierarchy.