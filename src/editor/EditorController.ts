/**
 * Code Editor Live V3.0 — Editor Controller
 * CodeMirror 6 integration with per-file state caching.
 */
import { EditorState, Compartment, Extension, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, highlightActiveLine, Decoration, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { IDEStore } from '../store/index';

const flashLineEffect = StateEffect.define<number>();
const clearFlashEffect = StateEffect.define<null>();

const flashLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(clearFlashEffect)) {
        return Decoration.none;
      }
      if (effect.is(flashLineEffect)) {
        const line = tr.state.doc.line(effect.value);
        decos = Decoration.set([
          Decoration.line({ class: 'cm-flash-line' }).range(line.from),
        ]);
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface FileState {
  state: EditorState;
  scrollTop: number;
  scrollLeft: number;
}

export class EditorController {
  private view: EditorView;
  private fileStates: Map<string, FileState> = new Map();
  private languageCompartment = new Compartment();
  private currentFile: string | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void };
  private onChangeCallbacks: Array<(content: string) => void> = [];

  constructor(
    host: HTMLElement,
    store: { getState: () => IDEStore; subscribe: (fn: () => void) => () => void }
  ) {
    this.store = store;

    const extensions = this.buildExtensions();

    this.view = new EditorView({
      state: EditorState.create({
        doc: '// Welcome to Code Editor Live\n// Open a file from the explorer to start editing.\n',
        extensions,
      }),
      parent: host,
    });
    this.view.contentDOM.setAttribute('aria-label', 'Source editor');
    this.view.scrollDOM.tabIndex = 0;
  }

  private buildExtensions(): Extension[] {
    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      oneDark,
      this.languageCompartment.of(javascript({ jsx: true, typescript: true })),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // Mark tab dirty
          if (this.currentFile) {
            this.store.getState().markTabDirty(this.currentFile, true);
          }
          // Notify change listeners
          const content = update.state.doc.toString();
          for (const cb of this.onChangeCallbacks) {
            try { cb(content); } catch { /* silent */ }
          }
        }
        // Update cursor position in status bar
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          const col = pos - line.from + 1;
          const cursorEl = document.getElementById('cursor-text');
          if (cursorEl) cursorEl.textContent = `Ln ${line.number}, Col ${col}`;
        }
      }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
      }),
      flashLineField,
    ];
  }

  /**
   * Navigate to line/column in the currently open file. Returns false for invalid locations.
   */
  jumpToLine(line: number, col?: number): boolean {
    if (!Number.isFinite(line) || line < 1) return false;

    const doc = this.view.state.doc;
    const lineNum = Math.floor(line);
    if (lineNum > doc.lines) return false;
    const lineObj = doc.line(lineNum);
    let pos = lineObj.from;
    if (col != null && Number.isFinite(col) && col > 0) {
      pos = Math.min(lineObj.from + Math.floor(col) - 1, lineObj.to);
    }

    this.view.dispatch({
      selection: { anchor: pos },
      effects: flashLineEffect.of(lineNum),
      scrollIntoView: true,
    });
    this.view.focus();

    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.view.dispatch({ effects: clearFlashEffect.of(null) });
    }, 1200);

    return true;
  }

  openFile(filepath: string, content: string): void {
    // Save current file state
    this.saveCurrentState();

    this.currentFile = filepath;

    // Restore cached state or create new
    const cached = this.fileStates.get(filepath);
    if (cached) {
      this.view.setState(cached.state);
      requestAnimationFrame(() => {
        this.view.scrollDOM.scrollTop = cached.scrollTop;
        this.view.scrollDOM.scrollLeft = cached.scrollLeft;
        this.view.focus();
      });
    } else {
      const lang = this.detectLanguage(filepath);
      const state = EditorState.create({
        doc: content,
        extensions: this.buildExtensions(),
      });
      this.view.setState(state);
      // Apply language
      this.view.dispatch({
        effects: this.languageCompartment.reconfigure(lang),
      });
      requestAnimationFrame(() => this.view.focus());
    }

    // Update language in status bar
    const langName = this.getLanguageName(filepath);
    const langEl = document.getElementById('lang-text');
    if (langEl) langEl.textContent = langName;
  }

  getContent(): string {
    return this.view.state.doc.toString();
  }

  getCurrentFile(): string | null {
    return this.currentFile;
  }

  onChange(callback: (content: string) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  focus(): void {
    this.view.focus();
  }

  requestMeasure(): void {
    this.view.requestMeasure();
  }

  private saveCurrentState(): void {
    if (!this.currentFile) return;
    this.fileStates.set(this.currentFile, {
      state: this.view.state,
      scrollTop: this.view.scrollDOM.scrollTop,
      scrollLeft: this.view.scrollDOM.scrollLeft,
    });
  }

  private detectLanguage(filepath: string): Extension {
    const ext = filepath.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
      case 'js': return javascript();
      case 'jsx': return javascript({ jsx: true });
      case 'ts': return javascript({ typescript: true });
      case 'tsx': return javascript({ jsx: true, typescript: true });
      case 'html': return html();
      case 'css': return css();
      case 'json': return json();
      case 'py': return python();
      case 'md': case 'markdown': return markdown();
      default: return javascript();
    }
  }

  private getLanguageName(filepath: string): string {
    const ext = filepath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
      html: 'HTML', css: 'CSS', json: 'JSON', py: 'Python',
      md: 'Markdown', markdown: 'Markdown',
    };
    return map[ext] ?? 'Plain Text';
  }
}
