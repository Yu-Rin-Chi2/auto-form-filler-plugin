// Chrome Web Store のプロモ画像を docs/store/promo-tile.html から PNG に描画する。
// 日本語テキストを含むため pngjs ではなく Playwright（Chromium）で撮影する。
// 実行: npm run render-promo
// 出力: docs/store/promo/small-tile-440x280.png（必須）, docs/store/promo/marquee-1400x560.png（任意）
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = pathToFileURL(join(root, 'docs', 'store', 'promo-tile.html')).href;
const outDir = join(root, 'docs', 'store', 'promo');
mkdirSync(outDir, { recursive: true });

const TARGETS = [
  { size: 'small', width: 440, height: 280, file: 'small-tile-440x280.png' },
  { size: 'marquee', width: 1400, height: 560, file: 'marquee-1400x560.png' },
];

const browser = await chromium.launch();
for (const t of TARGETS) {
  const page = await browser.newPage({ viewport: { width: t.width, height: t.height }, deviceScaleFactor: 1 });
  await page.goto(`${src}?size=${t.size}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = join(outDir, t.file);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: t.width, height: t.height } });
  await page.close();
  console.log(`[render-promo] wrote ${out}`);
}
await browser.close();
