const { build } = require('esbuild');
const dynamicModulePlugin = () => ({
  name: 'live-editor-resolver',
  setup(build) {
    build.onResolve({ filter: /^<stdin>$/ }, () => {
      return { path: 'index.jsx', namespace: 'vfs' };
    });
    build.onResolve({ filter: /.*/ }, (args) => {
      console.log('Resolved fallback:', args.path, args.kind, args.namespace);
      return { path: args.path, namespace: 'vfs' };
    });
    build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
      console.log('onLoad called for:', args.path, args.namespace);
      return { contents: 'console.log("hello")', loader: 'js' };
    });
  }
});
build({
  entryPoints: ['<stdin>'],
  bundle: true,
  write: false,
  plugins: [dynamicModulePlugin()]
}).catch((e) => console.error(e.message));
