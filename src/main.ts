/**
 * Code Editor Live V3.0 — Main Entry Point
 * Bootstraps the IDE: styles → store → VFS → editor → UI → compiler → sandbox
 */

// ── Styles ──
import './styles/tokens.css';
import './styles/layout.css';
import './styles/editor.css';
import './styles/components.css';
import './styles/scrollbar.css';

// ── Modules ──
import { store } from './store/index';
import { VFSController } from './vfs/VFSController';
import { EditorController } from './editor/EditorController';
import { SplitController } from './ui/SplitController';
import { ActivityBar } from './ui/ActivityBar';
import { TabController } from './ui/TabController';
import { StatusBar } from './ui/StatusBar';
import { ConsoleController } from './console/ConsoleController';
import { FileExplorer } from './explorer/FileExplorer';
import { CommandPalette } from './ui/CommandPalette';
import { SandboxController } from './sandbox/SandboxController';
import { BuildController } from './build/BuildController';
import { LifecycleManager, attachBootGatedBuildListener } from './core/LifecycleManager';
import { PlatformErrorBoundary } from './core/PlatformErrorBoundary';
import { ProblemsPanel } from './console/ProblemsPanel';
import { IdentityVoice } from './product/IdentityVoice';
import { FlowEngine } from './product/FlowEngine';
import { ConfidenceEngine } from './product/ConfidenceEngine';
import { DebugReplay } from './product/DebugReplay';
import { ConfidencePanel } from './console/ConfidencePanel';
import { ReplayPanel } from './console/ReplayPanel';

// ── Boot ──

async function boot(): Promise<void> {
  const t0 = performance.now();
  const lifecycle = new LifecycleManager();
  const boundary = new PlatformErrorBoundary();
  const flow = new FlowEngine();
  const confidence = new ConfidenceEngine();
  const replay = new DebugReplay();
  lifecycle.registerCleanup('flow', () => flow.dispose());
  lifecycle.registerCleanup('replay', () => replay.dispose());

  // 1. Restore workspace state
  store.getState().restoreWorkspace();

  // 2. Initialize VFS
  const vfs = new VFSController();
  await vfs.init();
  lifecycle.registerCleanup('vfs', () => { /* VFS persists for session */ });

  // 3. Initialize Editor
  const cmHost = document.getElementById('cm-host')!;
  const editor = new EditorController(cmHost, store);

  // 4. Initialize UI Controllers
  const tabController = new TabController(store, editor);
  const fileExplorer = new FileExplorer(vfs, store, tabController);
  const activityBar = new ActivityBar(store);
  const splitController = new SplitController(store);
  const statusBar = new StatusBar(store, editor, flow);
  lifecycle.registerCleanup('status-bar', () => statusBar.dispose());
  const consoleController = new ConsoleController(store);
  const commandPalette = new CommandPalette(store, vfs, tabController);

  // 5. Initialize Build pipeline (Phase 5A)
  const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
  const sandbox = new SandboxController(previewFrame, store, consoleController);
  const buildController = new BuildController(store, vfs, sandbox, boundary, { flow, confidence, replay });
  sandbox.attachReplay(replay);
  sandbox.attachConfidenceEngine(confidence);
  sandbox.attachFlow(flow);
  lifecycle.register('build', buildController);
  lifecycle.registerCleanup('sandbox', () => sandbox.dispose());

  const problemsRoot = document.getElementById('problems-panel-root')!;
  const problemsPanel = new ProblemsPanel(
    problemsRoot,
    buildController.getDiagnosticEngine(),
    store,
    editor,
    tabController,
    vfs,
    buildController.getSourceMapResolver()
  );
  lifecycle.registerCleanup('problems', () => problemsPanel.dispose());

  const confidencePanel = new ConfidencePanel(document.getElementById('confidence-panel-root')!, store);
  lifecycle.registerCleanup('confidence', () => confidencePanel.dispose());

  const replayPanel = new ReplayPanel(
    document.getElementById('replay-panel-root')!,
    replay,
    store,
    editor,
    tabController,
    vfs
  );
  lifecycle.registerCleanup('replay-panel', () => replayPanel.dispose());

  editor.onChange(() => {
    flow.recordTyping();
    replay.recordEdit(editor.getCurrentFile() ?? undefined);
  });
  cmHost.addEventListener('focusin', () => flow.recordReading());
  cmHost.addEventListener('mousedown', () => flow.recordReading());
  document.getElementById('search-input')?.addEventListener('input', () => flow.recordSearching());

  boundary.onError(({ subsystem, error }) => {
    console.error(`[Platform] ${subsystem} failed`, error);
  });

  const enableAutomaticBuilds = attachBootGatedBuildListener(
    (listener) => vfs.onChange(listener),
    () => buildController.scheduleBuild()
  );

  // 7. Load default project or restore files
  const files = await vfs.listFiles('/');
  if (files.length === 0) {
    await scaffoldDefaultProject(vfs);
  }

  // 8. Render file tree and open first file
  await fileExplorer.refresh();
  const allFiles = await vfs.listFiles('/');
  const entryFile = allFiles.find((f) => f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.js') || f.endsWith('.ts'))
    || allFiles.find((f) => f.endsWith('.html'))
    || allFiles[0];

  if (entryFile) {
    await tabController.openFile(entryFile, vfs);
  }

  // 9. Initial build
  await buildController.runBuild();
  enableAutomaticBuilds();

  // 10. Apply layout from store
  splitController.applyLayout();

  // 11. Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key === 'p') { e.preventDefault(); commandPalette.toggle(); }
    if (mod && e.key === 'p' && !e.shiftKey) { e.preventDefault(); commandPalette.toggleQuickOpen(); }
    if (mod && e.key === 's') {
      e.preventDefault();
      tabController.saveActive(vfs);
    }
    if (mod && e.key === 'b') { e.preventDefault(); store.getState().toggleSidebar(); }
    if (mod && e.key === 'j') { e.preventDefault(); store.getState().togglePanel(); }
  });

  // 12. Show app, hide loader
  const loader = document.getElementById('app-loader')!;
  const app = document.getElementById('app')!;
  app.style.visibility = 'visible';
  loader.classList.add('hidden');
  void registerServiceWorker();
  setTimeout(() => loader.remove(), 300);

  const bootTime = (performance.now() - t0).toFixed(0);
  console.log(`%c[Code Editor Live] Boot: ${bootTime}ms`, 'color: #58a6ff; font-weight: bold');
}

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // Offline support is an enhancement; boot and preview remain independent.
  }
}

// ── Default Project ──

async function scaffoldDefaultProject(vfs: VFSController): Promise<void> {
  await vfs.writeFile('/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>`);

  await vfs.writeFile('/main.jsx', `import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>🚀 Code Editor Live</h1>
      <p>Edit this file and see instant preview updates.</p>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
`);

  await vfs.writeFile('/style.css', `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app {
  text-align: center;
  padding: 3rem;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p { color: #94a3b8; margin-bottom: 1.5rem; }

button {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

button:hover { background: #2563eb; }
button:active { transform: scale(0.97); }
`);
}

// ── Launch ──
boot().catch((err) => {
  console.error('[Boot Fatal]', err);
  const loader = document.getElementById('app-loader');
  const text = loader?.querySelector('.loader-text');
  if (text) text.textContent = IdentityVoice.bootFailed();
});
