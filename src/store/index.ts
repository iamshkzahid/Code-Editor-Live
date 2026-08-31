/**
 * Code Editor Live V3.0 — Global State Store (Zustand)
 * Central state management with workspace persistence.
 */
import { createStore } from 'zustand/vanilla';

// ── Types ──────────────────────────────────────────────

export interface TabState {
  id: string;
  filename: string;
  filepath: string;
  dirty: boolean;
  language: string;
}

export interface Diagnostic {
  id?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  col?: number;
  source?: 'esbuild' | 'runtime' | 'build';
  code?: string;
  stack?: string;
  buildGeneration?: number;
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
}

export type SidebarView = 'explorer' | 'search' | 'git' | 'learn' | 'ai';
export type PanelTab = 'console' | 'problems' | 'tests';
export type BuildState = 'idle' | 'compiling' | 'ready' | 'error';
export type PreviewMode = 'current' | 'last_working' | 'none';
export type Viewport = 'desktop' | 'tablet' | 'mobile';

export interface IDEStore {
  // ── Sidebar ──
  activeView: SidebarView;
  sidebarVisible: boolean;

  // ── Panel ──
  panelVisible: boolean;
  panelTab: PanelTab;

  // ── Layout ──
  sidebarWidth: number;
  panelHeight: number;
  editorPreviewRatio: number;

  // ── Editor ──
  openTabs: TabState[];
  activeTabId: string | null;

  // ── Build ──
  buildState: BuildState;
  buildStatusText: string;
  diagnostics: Diagnostic[];

  // ── Preview state (Phase 5A) ──
  previewMode: PreviewMode;

  // ── Git ──
  branch: string;
  changedFiles: GitFileStatus[];

  // ── Preview ──
  previewViewport: Viewport;

  // ── Console ──
  consoleLogs: ConsoleEntry[];

  // ── Actions ──
  setActiveView: (view: SidebarView) => void;
  toggleSidebar: () => void;
  togglePanel: () => void;
  setPanelTab: (tab: PanelTab) => void;
  setSidebarWidth: (w: number) => void;
  setPanelHeight: (h: number) => void;
  setEditorPreviewRatio: (r: number) => void;
  openTab: (tab: TabState) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  markTabDirty: (id: string, dirty: boolean) => void;
  setBuildState: (s: BuildState) => void;
  setBuildStatusText: (text: string) => void;
  setDiagnostics: (d: Diagnostic[]) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setBranch: (b: string) => void;
  setChangedFiles: (f: GitFileStatus[]) => void;
  setPreviewViewport: (v: Viewport) => void;
  addConsoleLog: (entry: ConsoleEntry) => void;
  clearConsole: () => void;
  saveWorkspace: () => void;
  restoreWorkspace: () => void;
}

export interface ConsoleEntry {
  id: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
}

// ── Persistence Keys ──

const WORKSPACE_KEY = 'cel-workspace-v3';

interface PersistedWorkspace {
  sidebarWidth: number;
  panelHeight: number;
  editorPreviewRatio: number;
  sidebarVisible: boolean;
  panelVisible: boolean;
  activeView: SidebarView;
  panelTab: PanelTab;
  openTabs: TabState[];
  activeTabId: string | null;
  previewViewport: Viewport;
}

// ── Store ──────────────────────────────────────────────

export const store = createStore<IDEStore>((set, get) => ({
  // Defaults
  activeView: 'explorer',
  sidebarVisible: true,
  panelVisible: true,
  panelTab: 'console',
  sidebarWidth: 260,
  panelHeight: 240,
  editorPreviewRatio: 0.6,
  openTabs: [],
  activeTabId: null,
  buildState: 'idle',
  buildStatusText: 'Ready',
  diagnostics: [],
  previewMode: 'none',
  branch: 'main',
  changedFiles: [],
  previewViewport: 'desktop',
  consoleLogs: [],

  // Actions
  setActiveView: (view) => set({ activeView: view, sidebarVisible: true }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  setPanelTab: (tab) => set({ panelTab: tab, panelVisible: true }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(180, Math.min(500, w)) }),
  setPanelHeight: (h) => set({ panelHeight: Math.max(100, Math.min(600, h)) }),
  setEditorPreviewRatio: (r) => set({ editorPreviewRatio: Math.max(0.2, Math.min(0.8, r)) }),

  openTab: (tab) => set((s) => {
    const exists = s.openTabs.find((t) => t.id === tab.id);
    if (exists) return { activeTabId: tab.id };
    return { openTabs: [...s.openTabs, tab], activeTabId: tab.id };
  }),

  closeTab: (id) => set((s) => {
    const idx = s.openTabs.findIndex((t) => t.id === id);
    const newTabs = s.openTabs.filter((t) => t.id !== id);
    let newActive = s.activeTabId;
    if (s.activeTabId === id) {
      newActive = newTabs.length > 0
        ? newTabs[Math.min(idx, newTabs.length - 1)].id
        : null;
    }
    return { openTabs: newTabs, activeTabId: newActive };
  }),

  setActiveTab: (id) => set({ activeTabId: id }),

  markTabDirty: (id, dirty) => set((s) => ({
    openTabs: s.openTabs.map((t) => t.id === id ? { ...t, dirty } : t),
  })),

  setBuildState: (s) => set({ buildState: s }),
  setBuildStatusText: (text) => set({ buildStatusText: text }),
  setDiagnostics: (d) => set({ diagnostics: d }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
  setBranch: (b) => set({ branch: b }),
  setChangedFiles: (f) => set({ changedFiles: f }),
  setPreviewViewport: (v) => set({ previewViewport: v }),

  addConsoleLog: (entry) => set((s) => ({
    consoleLogs: [...s.consoleLogs.slice(-500), entry],
  })),

  clearConsole: () => set({ consoleLogs: [] }),

  saveWorkspace: () => {
    const s = get();
    const data: PersistedWorkspace = {
      sidebarWidth: s.sidebarWidth,
      panelHeight: s.panelHeight,
      editorPreviewRatio: s.editorPreviewRatio,
      sidebarVisible: s.sidebarVisible,
      panelVisible: s.panelVisible,
      activeView: s.activeView,
      panelTab: s.panelTab,
      openTabs: s.openTabs,
      activeTabId: s.activeTabId,
      previewViewport: s.previewViewport,
    };
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded — silent */ }
  },

  restoreWorkspace: () => {
    try {
      const raw = localStorage.getItem(WORKSPACE_KEY);
      if (!raw) return;
      const data: PersistedWorkspace = JSON.parse(raw);
      set({
        sidebarWidth: data.sidebarWidth ?? 260,
        panelHeight: data.panelHeight ?? 240,
        editorPreviewRatio: data.editorPreviewRatio ?? 0.6,
        sidebarVisible: data.sidebarVisible ?? true,
        panelVisible: data.panelVisible ?? true,
        activeView: data.activeView ?? 'explorer',
        panelTab: data.panelTab ?? 'console',
        openTabs: data.openTabs ?? [],
        activeTabId: data.activeTabId ?? null,
        previewViewport: data.previewViewport ?? 'desktop',
      });
    } catch { /* corrupt data — silent */ }
  },
}));

const PERSIST_DEBOUNCE_MS = 100;
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;

function workspaceChanged(next: IDEStore, previous: IDEStore): boolean {
  return next.sidebarWidth !== previous.sidebarWidth ||
    next.panelHeight !== previous.panelHeight ||
    next.editorPreviewRatio !== previous.editorPreviewRatio ||
    next.sidebarVisible !== previous.sidebarVisible ||
    next.panelVisible !== previous.panelVisible ||
    next.activeView !== previous.activeView ||
    next.panelTab !== previous.panelTab ||
    next.openTabs !== previous.openTabs ||
    next.activeTabId !== previous.activeTabId ||
    next.previewViewport !== previous.previewViewport;
}

function scheduleWorkspacePersistence(): void {
  if (persistenceTimer) clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => {
    persistenceTimer = null;
    store.getState().saveWorkspace();
  }, PERSIST_DEBOUNCE_MS);
}

store.subscribe((next, previous) => {
  if (workspaceChanged(next, previous)) scheduleWorkspacePersistence();
});
