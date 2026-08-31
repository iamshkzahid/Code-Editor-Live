import type { DiagnosticRecord } from '../core/DiagnosticEngine';
import { IdentityVoice } from './IdentityVoice';
import { resolveNextAction, type NextAction } from './NextAction';

export type ExplanationConfidence = 'high' | 'medium' | 'low';

export interface ExplainedDiagnostic {
  headline: string;
  explanation: string;
  whyShowing: string;
  nextAction: NextAction;
  confidence: ExplanationConfidence;
  technicalMessage: string;
  code?: string;
  file?: string;
  line?: number;
  col?: number;
  stack?: string;
  source?: string;
}

interface PatternRule {
  test: (msg: string) => boolean;
  confidence: ExplanationConfidence;
  headline: (msg: string) => string;
  explanation: (msg: string) => string;
}

const PATTERNS: PatternRule[] = [
  {
    test: (m) => /expected "\)"|expected '\)'|expected "\}"|expected '\}'/i.test(m),
    confidence: 'high',
    headline: (m) => {
      if (/[\)]/.test(m)) return "Looks like a closing ')' is missing.";
      if (/[\}]/.test(m)) return "Looks like a closing '}' is missing.";
      return 'Looks like a closing bracket is missing.';
    },
    explanation: () =>
      'The parser became confused later in the file. The missing bracket may be closer to the earlier opening expression.',
  },
  {
    test: (m) => /unexpected token/i.test(m),
    confidence: 'medium',
    headline: () => 'The compiler found unexpected syntax here.',
    explanation: () =>
      'Based on available evidence, a symbol or punctuation may be missing or misplaced near this location.',
  },
  {
    test: (m) => /expected .+ but found/i.test(m) || /expected "\)"|expected '\)'/i.test(m),
    confidence: 'high',
    headline: (m) => {
      if (/[\)\]\}]/.test(m)) return "Looks like a closing bracket or parenthesis is missing.";
      return 'The parser expected different syntax here.';
    },
    explanation: () =>
      'Based on available evidence, an opening bracket or parenthesis may not have been closed before this point.',
  },
  {
    test: (m) => /unterminated|unclosed/i.test(m),
    confidence: 'medium',
    headline: () => 'This may be related to an unmatched bracket or quote.',
    explanation: () =>
      'The compiler reported an unterminated construct. The actual mismatch may be earlier in the file.',
  },
  {
    test: (m) => /could not resolve|cannot find module|file not found/i.test(m),
    confidence: 'high',
    headline: (m) => {
      const mod = m.match(/['"]([^'"]+)['"]/);
      return mod
        ? `The module "${mod[1]}" could not be found.`
        : 'An import could not be resolved.';
    },
    explanation: () =>
      'Check that the import path is correct and the file exists in your project.',
  },
  {
    test: (m) => /has no exported|missing export|export named/i.test(m),
    confidence: 'high',
    headline: (m) => {
      const ex = m.match(/export(?:ed)?\s+(?:member\s+)?['"]?(\w+)['"]?/i);
      return ex
        ? `The export "${ex[1]}" is missing from this module.`
        : 'A named export appears to be missing.';
    },
    explanation: () =>
      'The importing file expects a symbol that this module does not export.',
  },
  {
    test: (m) =>
      /undefined is not an object|cannot read propert|cannot read properties of undefined|null is not an object/i.test(
        m
      ),
    confidence: 'medium',
    headline: () => 'Something may be undefined when this line runs.',
    explanation: () =>
      'Based on available evidence, a value was used before it was defined or returned from a function.',
  },
  {
    test: (m) => /parse error|syntax error/i.test(m),
    confidence: 'medium',
    headline: () => 'The compiler reported a syntax error.',
    explanation: () =>
      'The exact cause may be nearby. Review the lines above this location for missing punctuation.',
  },
];

function whyShowingFor(record: DiagnosticRecord): string {
  switch (record.source) {
    case 'runtime':
      return 'The preview reported this while running your application.';
    case 'build':
      return 'The compiler reported this during the latest build.';
    case 'esbuild':
    default:
      return 'The compiler reported this during the latest build.';
  }
}

function genericExplanation(record: DiagnosticRecord): Pick<ExplainedDiagnostic, 'headline' | 'explanation' | 'confidence'> {
  return {
    headline: IdentityVoice.explain({
      headline: 'Review this compiler message',
      technicalMessage: record.message,
      confidence: 'low',
    }),
    explanation:
      'Based on available evidence, this may need a closer look at the reported location and nearby code.',
    confidence: 'low',
  };
}

export function explainDiagnostic(record: DiagnosticRecord): ExplainedDiagnostic {
  const msg = record.message;
  const whyShowing = whyShowingFor(record);
  const nextAction = resolveNextAction(record);

  for (const pattern of PATTERNS) {
    if (pattern.test(msg)) {
      const headline =
        pattern.confidence === 'high'
          ? pattern.headline(msg)
          : IdentityVoice.explain({
              headline: pattern.headline(msg),
              technicalMessage: record.message,
              confidence: pattern.confidence,
            });

      return {
        headline,
        explanation: pattern.explanation(msg),
        whyShowing,
        nextAction,
        confidence: pattern.confidence,
        technicalMessage: record.technicalMessage,
        code: record.code,
        file: record.file,
        line: record.line,
        col: record.col,
        stack: record.stack,
        source: record.source,
      };
    }
  }

  const generic = genericExplanation(record);
  return {
    ...generic,
    whyShowing,
    nextAction,
    technicalMessage: record.technicalMessage,
    code: record.code,
    file: record.file,
    line: record.line,
    col: record.col,
    stack: record.stack,
    source: record.source,
  };
}

export function groupByFile(
  records: DiagnosticRecord[],
  activeFile?: string | null
): Map<string, DiagnosticRecord[]> {
  const ordered = orderDiagnostics(records, activeFile);
  const groups = new Map<string, DiagnosticRecord[]>();
  for (const record of ordered) {
    const key = record.file ?? '(no file)';
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return groups;
}

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function orderDiagnostics(
  records: DiagnosticRecord[],
  activeFile?: string | null
): DiagnosticRecord[] {
  return [...records].sort((a, b) => {
    const aActive = activeFile && a.file === activeFile ? 0 : 1;
    const bActive = activeFile && b.file === activeFile ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const sev = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sev !== 0) return sev;

    const lineA = a.line ?? Number.MAX_SAFE_INTEGER;
    const lineB = b.line ?? Number.MAX_SAFE_INTEGER;
    if (lineA !== lineB) return lineA - lineB;

    return b.updatedAt - a.updatedAt;
  });
}
