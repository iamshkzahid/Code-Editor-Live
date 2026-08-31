/**
 * Code Editor Live V3.0 — Compiler Worker
 * esbuild-wasm bundler running in a Web Worker.
 */
import * as esbuild from 'esbuild-wasm';

let initPromise: Promise<void> | null = null;

export function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({
      wasmURL: '/esbuild.wasm',
    }).catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export function resolveExternalModule(specifier: string): { path: string; external: true } {
  return {
    path: /^https?:\/\//.test(specifier) ? specifier : `https://esm.sh/${specifier}`,
    external: true,
  };
}

// VFS Plugin: resolve imports against in-memory file tree
function vfsPlugin(files: Record<string, string>): esbuild.Plugin {
  return {
    name: 'vfs',
    setup(build) {
      // Absolute VFS paths (entry points and imports like /main.jsx)
      build.onResolve({ filter: /^\// }, (args) => {
        if (files[args.path]) return { path: args.path, namespace: 'vfs' };
        const exts = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
        for (const ext of exts) {
          if (files[args.path + ext]) return { path: args.path + ext, namespace: 'vfs' };
        }
        return { path: args.path, namespace: 'vfs' };
      });

      // Resolve bare module specifiers to CDN
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (/^https?:\/\//.test(args.path)) return resolveExternalModule(args.path);
        // React special handling
        if (args.path === 'react') return resolveExternalModule('react@18');
        if (args.path === 'react-dom/client') return resolveExternalModule('react-dom@18/client');
        if (args.path === 'react-dom') return resolveExternalModule('react-dom@18');
        if (args.path === 'react/jsx-runtime') return resolveExternalModule('react@18/jsx-runtime');
        // Generic CDN
        return resolveExternalModule(args.path);
      });

      // Resolve relative paths against VFS
      build.onResolve({ filter: /^\./ }, (args) => {
        const dir = args.importer ? args.importer.replace(/\/[^/]+$/, '') : '';
        let resolved = `${dir}/${args.path}`.replace(/\/+/g, '/');

        // Try exact match
        if (files[resolved]) return { path: resolved, namespace: 'vfs' };

        // Try extensions
        const exts = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];
        for (const ext of exts) {
          if (files[resolved + ext]) return { path: resolved + ext, namespace: 'vfs' };
        }

        // Try index files
        for (const ext of exts) {
          if (files[resolved + '/index' + ext]) return { path: resolved + '/index' + ext, namespace: 'vfs' };
        }

        return { path: resolved, namespace: 'vfs' };
      });

      // Load from VFS
      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const content = files[args.path];
        if (content === undefined) {
          return { errors: [{ text: `File not found: ${args.path}` }] };
        }
        const ext = args.path.split('.').pop() ?? '';
        const loaderMap: Record<string, esbuild.Loader> = {
          tsx: 'tsx', ts: 'ts', jsx: 'jsx', js: 'jsx',
          css: 'css', json: 'json',
        };
        return { contents: content, loader: loaderMap[ext] ?? 'js' };
      });
    },
  };
}

// Message handler
if (typeof self !== 'undefined') self.onmessage = async (e: MessageEvent) => {
  const { type, id, files } = e.data;

  if (type === 'PING') {
    self.postMessage({ type: 'PONG' });
    return;
  }

  if (type === 'SHUTDOWN') {
  return;
  }

  if (type === 'BUILD') {
    try {
      await ensureInit();

      // Find entry point
      const entryOrder = ['/main.tsx', '/main.jsx', '/main.ts', '/main.js', '/index.tsx', '/index.jsx', '/index.ts', '/index.js', '/App.tsx', '/App.jsx'];
      let entry = entryOrder.find((e) => files[e]);
      if (!entry) {
        // Find any JS/TS file
        entry = Object.keys(files).find((f) => /\.(tsx?|jsx?)$/.test(f));
      }

      if (!entry) {
        self.postMessage({ type: 'BUILD_RESULT', id, errors: [{ text: 'No entry file found' }], outputJS: '', outputCSS: '' });
        return;
      }

      const loader = entry.endsWith('.ts') ? 'ts' : entry.endsWith('.tsx') ? 'tsx' : 'jsx';

      const result = await esbuild.build({
        stdin: {
          contents: files[entry],
          loader,
          resolveDir: '/',
          sourcefile: entry,
        },
        bundle: true,
        format: 'esm',
        target: 'es2022',
        jsx: 'automatic',
        jsxImportSource: 'https://esm.sh/react@18',
        outfile: '/out/bundle.js',
        sourcemap: 'inline',
        write: false,
        plugins: [vfsPlugin(files)],
      });

      let outputJS = '';
      let outputCSS = '';
      let sourceMapJson = '';
      for (const file of result.outputFiles ?? []) {
        if (file.path.endsWith('.js')) outputJS = file.text;
        if (file.path.endsWith('.css')) outputCSS = file.text;
        if (file.path.endsWith('.js.map')) sourceMapJson = file.text;
        if (!outputJS && !file.path.endsWith('.css') && !file.path.endsWith('.map')) {
          outputJS = file.text;
        }
      }

      const errors = (result.errors ?? []).map((e) => ({
        text: e.text,
        location: e.location ? { file: e.location.file, line: e.location.line, column: e.location.column } : undefined,
      }));

      const warnings = (result.warnings ?? []).map((w) => ({
        text: w.text,
        location: w.location ? { file: w.location.file, line: w.location.line, column: w.location.column } : undefined,
      }));

      self.postMessage({ type: 'BUILD_RESULT', id, errors, warnings, outputJS, outputCSS, sourceMapJson });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'BUILD_RESULT', id, errors: [{ text: msg }], outputJS: '', outputCSS: '' });
    }
  }
};
