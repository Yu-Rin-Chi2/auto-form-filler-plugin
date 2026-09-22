import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * popup / options（React + HTML）と background（ESM service worker）をビルドする。
 * root を src/ にすることで、popup.html / options.html が dist/ 直下に出力されるようにする
 * （manifest.json の "popup.html" / "options.html" 参照と一致させるため）。
 * content script は別 config（vite.content.config.ts）で IIFE としてビルドする。
 */
export default defineConfig({
  root: resolvePath('src'),
  publicDir: resolvePath('public'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolvePath('dist'),
    emptyOutDir: true,
    // <link rel="modulepreload"> を出さない。拡張ページ（chrome-extension://）では Chrome が
    // 「preload されたが数秒以内に使われなかった」警告を拡張のエラー一覧に記録するため
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolvePath('src/popup.html'),
        options: resolvePath('src/options.html'),
        background: resolvePath('src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
