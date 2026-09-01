importScripts('https://unpkg.com/esbuild-wasm@0.20.0/lib/browser.min.js');

let initialized = false;

// Custom esbuild plugin to handle Virtual File System and NPM module resolution
const dynamicModulePlugin = (vfsTree) => {
  return {
    name: 'live-editor-resolver',
    setup(build) {
      // 1. Intercept relative/local VFS imports (e.g., ./utils.js)
      build.onResolve({ filter: /^\.\/?/ }, (args) => {
        console.log('Resolving relative module:', args.path, 'from', args.importer);
        // Resolve path relative to the importer
        const pathParts = args.importer.split('/').slice(0, -1);
        pathParts.push(args.path.replace('./', ''));
        const resolvedPath = pathParts.join('/');
        
        return { path: resolvedPath, namespace: 'vfs' };
      });

      // 2. Intercept external NPM packages (e.g., react, canvas-confetti)
      build.onResolve({ filter: /^[^.\/]/ }, (args) => {
        console.log('Resolving bare module:', args.path);
        // Explicitly map the entry point to VFS instead of falling back to default fs
        if (args.path.match(/^index\.(tsx|jsx|js|html)$/) || args.path.match(/^main\.(tsx|jsx|js)$/)) {
          return { path: args.path, namespace: 'vfs' };
        }
        return { path: `https://esm.sh/${args.path}`, external: true };
      });

      // 5. Load files from VFS (simulating disk access via passed memory tree)
      build.onLoad({ filter: /.*/, namespace: 'vfs' }, async (args) => {
        console.log('VFS onLoad called for:', args.path);
        let fileContent = vfsTree[args.path];
        if (!fileContent) throw new Error(`File not found in VFS: ${args.path}`);
        
        // Determine loader based on file extension
        const ext = args.path.split('.').pop();
        const loaderMap = { js: 'jsx', jsx: 'jsx', ts: 'tsx', tsx: 'tsx', css: 'css' };
        const loader = loaderMap[ext] || 'text';
        
        return { contents: fileContent, loader };
      });

      // 5. Load external CDN modules via Fetch API
      build.onLoad({ filter: /.*/, namespace: 'http-url' }, async (args) => {
        const response = await fetch(args.path);
        if (!response.ok) throw new Error(`Failed to load package: ${args.path}`);
        const contents = await response.text();
        return { contents, loader: 'js' };
      });
    },
  };
};

self.addEventListener('message', async (e) => {
  const { type, entryFile, vfsTree } = e.data;

  if (type === 'BUILD') {
    console.log('BUILD started with entry:', entryFile);
    console.log('vfsTree index.html preview:', vfsTree['index.html'] ? vfsTree['index.html'].substring(0, 300) : 'missing');
    try {
      if (!initialized) {
        await esbuild.initialize({
          worker: false, // We are already in a worker
          wasmURL: 'https://unpkg.com/esbuild-wasm@0.20.0/esbuild.wasm',
        });
        initialized = true;
      }

      // Execute the bundle step using a virtual entry point
      const result = await esbuild.build({
        entryPoints: ['<stdin>'],
        bundle: true,
        write: false,
        sourcemap: 'inline',
        outfile: 'bundle.js',
        plugins: [
          {
            name: 'virtual-entry',
            setup(b) {
              b.onResolve({ filter: /^<stdin>$/ }, () => {
                return { path: entryFile, namespace: 'vfs' };
              });
            }
          },
          dynamicModulePlugin(vfsTree)
        ],
        format: 'esm',
        target: 'es2022',
        define: {
          'process.env.NODE_ENV': '"development"', // Required for React/Frameworks
        }
      });

      let code = '';
      let css = '';
      for (const file of result.outputFiles) {
        if (file.path.endsWith('.js')) code = file.text;
        if (file.path.endsWith('.css')) css = file.text;
      }
      console.log('Build output files:', result.outputFiles.map(f => f.path));

      self.postMessage({ type: 'BUILD_SUCCESS', code, css });

    } catch (error) {
      self.postMessage({ type: 'BUILD_ERROR', error: error.message });
    }
  }
});
