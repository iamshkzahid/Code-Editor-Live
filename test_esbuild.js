const { build } = require('esbuild');
const vfsTree = {
  'index.jsx': 'import React from "react";\nimport App from "./App.jsx";',
  'App.jsx': 'export default function App() { return "App" }'
};

const dynamicModulePlugin = (vfsTree) => ({
  name: 'live-editor-resolver',
  setup(build) {
    build.onResolve({ filter: /^\.\/?/ }, (args) => {
      const pathParts = args.importer.split('/').slice(0, -1);
      pathParts.push(args.path.replace('./', ''));
      return { path: pathParts.join('/'), namespace: 'vfs' };
    });
    build.onResolve({ filter: /^[^.\/]/ }, (args) => {
      if (args.path === 'index.js' || args.path === 'index.jsx') {
        return { path: args.path, namespace: 'vfs' };
      }
      return { path: `https://esm.sh/${args.path}?bundle`, namespace: 'http-url' };
    });
    build.onResolve({ filter: /.*/, namespace: 'http-url' }, (args) => {
      return { path: new URL(args.path, args.importer).toString(), namespace: 'http-url' };
    });
    build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
      let fileContent = vfsTree[args.path];
      if (!fileContent) throw new Error(`File not found: ${args.path}`);
      return { contents: fileContent, loader: 'jsx' };
    });
  }
});

async function run() {
  try {
    const result = await build({
      stdin: {
        contents: vfsTree['index.jsx'],
        sourcefile: 'index.jsx'
      },
      bundle: true,
      write: false,
      plugins: [dynamicModulePlugin(vfsTree)]
    });
    console.log('Success:', result.outputFiles[0].text.substring(0, 50));
  } catch(e) {
    console.error(e.message);
  }
}
run();
