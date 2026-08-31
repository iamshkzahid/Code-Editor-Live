import type { DiagnosticRecord } from '../core/DiagnosticEngine';

export interface NextAction {
  label: string;
  estimatedFixTime?: string;
  command?: string;
}

function basename(file: string): string {
  const parts = file.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? file;
}

function formatLocation(file?: string, line?: number): string | null {
  if (!file) return null;
  const name = basename(file);
  if (line != null && line > 0) return `${name} line ${line}`;
  return name;
}

function missingModuleTarget(message: string): string | null {
  const quoted = message.match(/['"]([^'"]+)['"]/);
  if (quoted) return quoted[1];
  const fromMatch = message.match(/from\s+['"]([^'"]+)['"]/i);
  return fromMatch?.[1] ?? null;
}

function missingExportTarget(message: string): string | null {
  const named = message.match(/export\s+['"]?(\w+)['"]?/i);
  if (named) return named[1];
  const hasNo = message.match(/has no exported member\s+['"]?(\w+)['"]?/i);
  return hasNo?.[1] ?? null;
}

/**
 * Deterministic primary next action for a diagnostic. Never invents fix estimates.
 */
export function resolveNextAction(record: DiagnosticRecord): NextAction {
  const loc = formatLocation(record.file, record.line);
  const msg = record.message.toLowerCase();

  if (record.source === 'runtime') {
    if (loc) {
      return { label: `Open ${loc}`, command: 'editor.openLocation' };
    }
    return { label: 'Inspect the affected file', command: 'editor.openLocation' };
  }

  if (msg.includes('could not resolve') || msg.includes('cannot find module') || msg.includes('file not found')) {
    const moduleName = missingModuleTarget(record.message);
    if (record.file && moduleName) {
      return {
        label: `Open import in ${basename(record.file)}`,
        command: 'editor.openLocation',
      };
    }
    if (record.file) {
      return { label: `Open ${basename(record.file)}`, command: 'editor.openLocation' };
    }
    return { label: 'Inspect the affected file', command: 'editor.openLocation' };
  }

  if (msg.includes('has no exported') || msg.includes('missing export') || msg.includes('export named')) {
    const exportName = missingExportTarget(record.message);
    if (record.file && exportName) {
      return { label: `Open the export in ${basename(record.file)}`, command: 'editor.openLocation' };
    }
    if (loc) {
      return { label: `Open ${loc}`, command: 'editor.openLocation' };
    }
    return { label: 'Inspect the affected file', command: 'editor.openLocation' };
  }

  if (loc) {
    return { label: `Open ${loc}`, command: 'editor.openLocation' };
  }

  if (record.file) {
    return { label: `Open ${basename(record.file)}`, command: 'editor.openLocation' };
  }

  return { label: 'Inspect the affected file', command: 'editor.openLocation' };
}
