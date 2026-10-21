import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const outfile = fileURLToPath(new URL('../dist/server.mjs', import.meta.url));

await rm(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });

await build({
  entryPoints: [fileURLToPath(new URL('../src/server.ts', import.meta.url))],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // pg-native 是 pg 的可选原生扩展；不安装也不影响纯 JS 连接。
  external: ['pg-native'],
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
});

console.log(`API bundle written to ${outfile}`);
console.log(`Source root: ${apiRoot}`);
