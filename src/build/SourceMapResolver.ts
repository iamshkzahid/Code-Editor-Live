/**
 * Resolves generated bundle locations to original source files when a source map is available.
 */
export interface ResolvedLocation {
  file: string;
  line: number;
  col?: number;
  resolved: boolean;
  limitation?: string;
  originalGeneratedLine?: number;
}

interface SourceMapData {
  sources: string[];
  mappings: string;
}

export class SourceMapResolver {
  private mapData: SourceMapData | null = null;
  private lineMappings: Map<number, Array<{
    generatedColumn: number;
    sourceIndex: number;
    sourceLine: number;
    sourceCol: number;
  }>> | null = null;

  setFromBundle(bundleJs: string, externalMapJson?: string): void {
    this.mapData = null;
    this.lineMappings = null;

    let raw = externalMapJson;
    if (!raw) {
      const inline = bundleJs.match(/\/\/# sourceMappingURL=data:application\/json;base64,(.+)$/m);
      if (inline?.[1]) {
        try {
          raw = atob(inline[1]);
        } catch {
          raw = undefined;
        }
      }
    }

    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as SourceMapData;
      if (!parsed.sources?.length || !parsed.mappings) return;
      this.mapData = parsed;
      this.lineMappings = this.decodeMappings(parsed);
    } catch {
      this.mapData = null;
      this.lineMappings = null;
    }
  }

  clear(): void {
    this.mapData = null;
    this.lineMappings = null;
  }

  hasSourceMap(): boolean {
    return this.mapData != null;
  }

  resolve(generatedLine: number, generatedCol = 0): ResolvedLocation | null {
    if (!this.mapData || !this.lineMappings) {
      return null;
    }

    const mappings = this.lineMappings.get(generatedLine);
    const mapping = mappings?.reduce<typeof mappings[number] | undefined>((best, candidate) => {
      if (candidate.generatedColumn > generatedCol) return best;
      return !best || candidate.generatedColumn >= best.generatedColumn ? candidate : best;
    }, undefined);
    if (!mapping) {
      return {
        file: this.normalizeSource(this.mapData.sources[0] ?? ''),
        line: generatedLine,
        col: generatedCol,
        resolved: false,
        limitation: 'Source map is available but this line could not be mapped exactly.',
        originalGeneratedLine: generatedLine,
      };
    }

    const file = this.normalizeSource(this.mapData.sources[mapping.sourceIndex] ?? '');
    return {
      file,
      line: mapping.sourceLine + 1,
      col: mapping.sourceCol + 1,
      resolved: true,
      originalGeneratedLine: generatedLine,
    };
  }

  resolveRuntime(
    source: string | undefined,
    line: number,
    col?: number
  ): ResolvedLocation & { resolved: boolean; limitation?: string } {
    if (this.hasSourceMap() && line > 0) {
      const mapped = this.resolve(line, col ?? 0);
      if (mapped?.resolved) return mapped;
      if (mapped) return mapped;
    }

    if (source && source.startsWith('/') && !source.startsWith('blob:')) {
      return { file: source, line: line || 1, col, resolved: true };
    }

    return {
      file: source ?? '',
      line: line || 1,
      col,
      resolved: false,
      limitation:
        'Source map is unavailable or could not map this runtime location. Showing the reported location.',
    };
  }

  private normalizeSource(source: string): string {
    const value = source.trim();
    if (!value || /^[a-z][a-z\d+.-]*:/i.test(value)) return value;

    // Source maps emitted by the worker are relative to esbuild's virtual output
    // directory, so they can contain several parent traversals before reaching
    // the VFS root. URL normalization gives us POSIX semantics without leaving
    // an invalid `/../...` editor path behind.
    try {
      return new URL(value, 'https://code-editor-live.invalid/').pathname;
    } catch {
      return value;
    }
  }

  /** Minimal VLQ decoder for 1:1 line mappings from esbuild inline maps. */
  private decodeMappings(
    map: SourceMapData
  ): Map<number, Array<{
    generatedColumn: number;
    sourceIndex: number;
    sourceLine: number;
    sourceCol: number;
  }>> {
    const result = new Map<number, Array<{
      generatedColumn: number;
      sourceIndex: number;
      sourceLine: number;
      sourceCol: number;
    }>>();
    const lines = map.mappings.split(';');
    let genLine = 0;
    let generatedColumn = 0;
    let sourceIndex = 0;
    let sourceLine = 0;
    let sourceCol = 0;

    for (const line of lines) {
      genLine += 1;
      generatedColumn = 0;
      if (!line) continue;
      const segments = line.split(',');
      for (const segment of segments) {
        if (!segment) continue;
        const values = this.decodeVLQ(segment);
        if (values.length >= 1) generatedColumn += values[0];
        if (values.length >= 4) {
          sourceIndex += values[1];
          sourceLine += values[2];
          sourceCol += values[3];
          const mappings = result.get(genLine) ?? [];
          mappings.push({ generatedColumn, sourceIndex, sourceLine, sourceCol });
          result.set(genLine, mappings);
        }
      }
    }

    return result;
  }

  private decodeVLQ(segment: string): number[] {
    const result: number[] = [];
    let shift = 0;
    let value = 0;
    for (let i = 0; i < segment.length; i++) {
      const c = segment.charCodeAt(i);
      const digit = this.fromVLQChar(c);
      value += (digit & 31) << shift;
      if (digit & 32) {
        shift += 5;
      } else {
        const negative = value & 1;
        value >>= 1;
        result.push(negative ? -value : value);
        value = 0;
        shift = 0;
      }
    }
    return result;
  }

  private fromVLQChar(code: number): number {
    if (code >= 65 && code <= 90) return code - 65;
    if (code >= 97 && code <= 122) return code - 97 + 26;
    if (code >= 48 && code <= 57) return code - 48 + 52;
    if (code === 43) return 62;
    if (code === 47) return 63;
    return 0;
  }
}
