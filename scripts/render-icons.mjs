// public/icons/ 用の PNG アイコンを生成する簡易スクリプト。
// 外部の画像素材を使わず、pngjs で単色の角丸四角 + 3 本の白いバー（フォーム入力欄のグリフ）を描画する。
// 実行: node scripts/render-icons.mjs
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 32, 48, 128];
const BG = { r: 0x25, g: 0x63, b: 0xeb }; // #2563EB（アクセントカラー、要件 03-uiux 5.1）
const FG = { r: 0xff, g: 0xff, b: 0xff };

function setPixel(png, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

/** 幅 w・高さ h の矩形内で、角丸半径 radius の内側に (x, y) が収まるか */
function inRoundedRect(x, y, w, h, radius) {
  const rx = Math.min(radius, w / 2);
  const ry = Math.min(radius, h / 2);
  if (x >= rx && x <= w - 1 - rx) return true;
  if (y >= ry && y <= h - 1 - ry) return true;
  const cx = x < rx ? rx : w - 1 - rx;
  const cy = y < ry ? ry : h - 1 - ry;
  const dx = x - cx;
  const dy = y - cy;
  return (dx * dx) / (rx * rx || 1) + (dy * dy) / (ry * ry || 1) <= 1;
}

function renderIcon(size) {
  const png = new PNG({ width: size, height: size });
  const radius = Math.max(1, Math.round(size * 0.22));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, size, size, radius)) {
        setPixel(png, x, y, BG.r, BG.g, BG.b, 255);
      } else {
        setPixel(png, x, y, 0, 0, 0, 0);
      }
    }
  }

  // フォームの入力欄を模した3本の白いバー（ロゴ的な図形）
  const barHeight = Math.max(1, Math.round(size * 0.09));
  const barRadius = Math.max(1, Math.round(barHeight / 2));
  const barGap = Math.max(1, Math.round(size * 0.16));
  const marginX = Math.round(size * 0.24);
  const widthRatios = [0.52, 0.52, 0.34];
  const totalHeight = barHeight * widthRatios.length + barGap * (widthRatios.length - 1);
  let startY = Math.round((size - totalHeight) / 2);

  for (const ratio of widthRatios) {
    const barWidth = Math.max(1, Math.round((size - marginX * 2) * ratio));
    for (let y = 0; y < barHeight; y++) {
      for (let x = 0; x < barWidth; x++) {
        if (inRoundedRect(x, y, barWidth, barHeight, barRadius)) {
          setPixel(png, marginX + x, startY + y, FG.r, FG.g, FG.b, 255);
        }
      }
    }
    startY += barHeight + barGap;
  }

  return png;
}

for (const size of SIZES) {
  const png = renderIcon(size);
  const buffer = PNG.sync.write(png);
  const outPath = join(outDir, `icon${size}.png`);
  writeFileSync(outPath, buffer);
  console.log(`[render-icons] wrote ${outPath}`);
}
