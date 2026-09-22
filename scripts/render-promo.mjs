// Chrome Web Store の小プロモタイル（440×280）を docs/store/promo-tile.html から PNG に描画する。
// 日本語テキストを含むため pngjs ではなく Playwright（Chromium）で撮影する。
// 実行: npm run render-promo
// 出力: docs/store/promo/small-tile-440x280.png
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'docs', 'store', 'promo-tile.html');
const outDir = join(root, 'docs', 'store', 'promo');
const out = join(outDir, 'small-tile-440x280.png');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(src).href);
await page.waitForTimeout(200);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 440, height: 280 } });
await browser.close();
console.log(`[render-promo] wrote ${out}`);
