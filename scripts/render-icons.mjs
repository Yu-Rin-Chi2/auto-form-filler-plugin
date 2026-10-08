// public/icons/ 用の PNG アイコンを、Codex（image_gen）で生成した元画像から縮小して作る。
// 元画像: docs/store/art/icon-source.png（透過背景の角丸正方形）
// 縮小は Playwright（Chromium）の canvas で半分ずつ段階的に行い、小さいサイズでも潰れにくくする。
// 128px は Chrome Web Store のガイドラインに合わせ、絵を 96px に収めて周囲 16px を透過の余白にする。
// 実行: npm run render-icons
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'docs', 'store', 'art', 'icon-source.png');
const outDir = join(root, 'public', 'icons');

/** size: 出力サイズ, art: その中で絵が占めるサイズ */
const TARGETS = [
  { size: 16, art: 16 },
  { size: 32, art: 32 },
  { size: 48, art: 48 },
  { size: 128, art: 96 },
];

const dataUrl = `data:image/png;base64,${readFileSync(src).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const results = await page.evaluate(
  async ({ dataUrl, targets }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    // 透過部分を除いた絵の範囲を求める
    const full = document.createElement('canvas');
    full.width = img.width;
    full.height = img.height;
    const fctx = full.getContext('2d');
    fctx.drawImage(img, 0, 0);
    const { data } = fctx.getImageData(0, 0, img.width, img.height);
    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (data[(y * img.width + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const side = Math.max(maxX - minX + 1, maxY - minY + 1);
    const cx = (minX + maxX + 1) / 2;
    const cy = (minY + maxY + 1) / 2;

    let source = document.createElement('canvas');
    source.width = side;
    source.height = side;
    source.getContext('2d').drawImage(full, cx - side / 2, cy - side / 2, side, side, 0, 0, side, side);

    const out = {};
    for (const t of targets) {
      let cur = source;
      while (cur.width / 2 >= t.art) {
        const next = document.createElement('canvas');
        next.width = Math.round(cur.width / 2);
        next.height = Math.round(cur.height / 2);
        const ctx = next.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cur, 0, 0, next.width, next.height);
        cur = next;
      }
      const canvas = document.createElement('canvas');
      canvas.width = t.size;
      canvas.height = t.size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const offset = (t.size - t.art) / 2;
      ctx.drawImage(cur, offset, offset, t.art, t.art);
      out[t.size] = canvas.toDataURL('image/png').split(',')[1];
    }
    return out;
  },
  { dataUrl, targets: TARGETS },
);
await browser.close();

for (const t of TARGETS) {
  const outPath = join(outDir, `icon${t.size}.png`);
  writeFileSync(outPath, Buffer.from(results[t.size], 'base64'));
  console.log(`[render-icons] wrote ${outPath}`);
}
