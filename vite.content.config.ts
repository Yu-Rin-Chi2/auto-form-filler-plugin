import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * content script を単一の IIFE としてビルドする。
 * `chrome.scripting.executeScript({ files: ['content.js'] })` で実行時注入するため、
 * import 文を含まない自己完結ファイルにする必要がある（content_scripts は宣言しない）。
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolvePath('src/content/index.ts'),
      name: 'AutoFormFillerContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
