/**
 * README 用のデモ GIF（ポップアップの「このページに入力」→ フォームが一括入力される）を生成する。
 *
 * store-screenshots.ts と同じ仕組み（dist-e2e/ をロード、Jev はローカルモック）で拡張を動かし、
 * フォーム画面のスクリーンショットに別タブで開いたポップアップの画像とマウスカーソルを
 * 合成したフレーム列を作り、ffmpeg で GIF に変換する。実 Jev API には接続しない。
 *
 * 前提: ffmpeg が PATH にあること
 * 実行: npm run demo-gif
 * 出力: docs/images/demo.gif
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { buildTestSettings } from '../e2e/fixtures-data';
import { startMockServer } from '../e2e/mock-server';
import { buildDemoProfile, composePopup, demoHandler, POPUP_MARGIN } from './demo-shared';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = join(root, 'dist-e2e');
const OUT_FILE = join(root, 'docs', 'images', 'demo.gif');
const VIEWPORT = { width: 1280, height: 800 };
const POPUP_WIDTH = 320;
/** GIF の横幅（1280 のフレームを縮小する） */
const GIF_WIDTH = 960;
const DEMO_FORM_HTML = readFileSync(join(root, 'docs', 'store', 'demo-form.html'), 'utf8');
const RUN_BUTTON = 'このページに入力';
/** ポップアップの「直近の実行」に表示する架空のホスト（モックの 127.0.0.1 を見せないため） */
const DEMO_RESULT_URL = 'https://shop.example.com/signup';

/** 1 フレーム = 画像 + 表示時間（秒） */
interface Frame {
  png: PNG;
  duration: number;
}

// ---- マウスカーソルの描画 ----

/** 標準的な矢印カーソルの輪郭（先端を原点とするローカル座標） */
const CURSOR_SHAPE: Array<[number, number]> = [
  [0, 0],
  [0, 17],
  [4.5, 13],
  [7.5, 20],
  [10.5, 18.5],
  [7.5, 12],
  [12.5, 12],
];
const CURSOR_SCALE = 1.5;

function pointInPolygon(px: number, py: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as [number, number];
    const [xj, yj] = poly[j] as [number, number];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 白い矢印カーソル（黒縁）を (cx, cy) を先端として描く */
function drawCursor(png: PNG, cx: number, cy: number): void {
  const poly = CURSOR_SHAPE.map(([x, y]) => [cx + x * CURSOR_SCALE, cy + y * CURSOR_SCALE] as [number, number]);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.floor(Math.min(...xs)) - 1;
  const maxX = Math.ceil(Math.max(...xs)) + 1;
  const minY = Math.floor(Math.min(...ys)) - 1;
  const maxY = Math.ceil(Math.max(...ys)) + 1;
  const inside = (x: number, y: number) => pointInPolygon(x + 0.5, y + 0.5, poly);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      if (!inside(x, y)) continue;
      // 8 近傍のいずれかが外側なら縁（黒）、そうでなければ内側（白）
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx !== 0 || dy !== 0) && !inside(x + dx, y + dy)) {
            edge = true;
            break;
          }
        }
      }
      const idx = (png.width * y + x) << 2;
      const v = edge ? 0x11 : 0xff;
      png.data[idx] = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
    }
  }
}

// ---- ブラウザ操作 ----

async function seedStorage(context: BrowserContext, extensionId: string, data: Record<string, unknown>) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((d) => chrome.storage.local.set(d), data);
  await page.close();
}

async function shotPopup(page: Page): Promise<Buffer> {
  return page.screenshot({ fullPage: true });
}

/** フォーム画面 + ポップアップを 1 枚に合成したフレームを撮る（入力時のスクロールで画面が飛ばないよう常に先頭で撮る） */
async function captureFrame(formPage: Page, popupPage: Page): Promise<PNG> {
  await formPage.evaluate(() => window.scrollTo(0, 0));
  const [form, popup] = await Promise.all([formPage.screenshot(), shotPopup(popupPage)]);
  return composePopup(form, popup);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// ---- GIF 変換 ----

function writeGif(frames: Frame[], outFile: string): void {
  const workDir = mkdtempSync(join(tmpdir(), 'auto-form-filler-gif-'));
  try {
    const lines = ['ffconcat version 1.0'];
    frames.forEach((frame, i) => {
      const name = `f${String(i).padStart(4, '0')}.png`;
      writeFileSync(join(workDir, name), PNG.sync.write(frame.png));
      lines.push(`file '${name}'`, `duration ${frame.duration.toFixed(3)}`);
    });
    // concat demuxer は最後のフレームの duration を無視するため、末尾を 1 度繰り返す
    lines.push(`file 'f${String(frames.length - 1).padStart(4, '0')}.png'`);
    const listPath = join(workDir, 'frames.txt');
    writeFileSync(listPath, `${lines.join('\n')}\n`);

    const filter = [
      `scale=${GIF_WIDTH}:-1:flags=lanczos`,
      'split[a][b]',
      '[a]palettegen=max_colors=192:stats_mode=diff[p]',
      '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    ].join(',');
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listPath, '-vf', filter, '-loop', '0', outFile],
      { stdio: 'inherit' },
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ---- メイン ----

async function main() {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const server = await startMockServer();
  const userDataDir = mkdtempSync(join(tmpdir(), 'auto-form-filler-demo-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${DIST_DIR}`, `--load-extension=${DIST_DIR}`, '--no-first-run'],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = worker.url().split('/')[2] as string;

    // 初回インストール時に自動で開くオプションページを閉じる
    for (const p of context.pages()) if (p.url().includes('options.html')) await p.close();

    const profile = buildDemoProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({
        workerEndpoint: server.jevUrl,
        lastProfileId: profile.id,
      }),
    });
    server.setJevHandler(demoHandler);

    // モックサーバーのページに、掲載用に整えたデモフォームを差し込む（同一オリジンのまま）
    const formPage = await context.newPage();
    await formPage.goto(`${server.url}/ec-signup.html`);
    await formPage.evaluate((html) => {
      document.open();
      document.write(html);
      document.close();
    }, DEMO_FORM_HTML);
    await formPage.locator('input[name="last_name"]').waitFor();
    // GIF ではスクロールバーを見せない
    await formPage.addStyleTag({ content: 'html{scrollbar-width:none} ::-webkit-scrollbar{display:none}' });
    await formPage.bringToFront();

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.setViewportSize({ width: POPUP_WIDTH, height: 200 });
    const runButton = popupPage.getByRole('button', { name: RUN_BUTTON });
    await runButton.waitFor();
    await formPage.bringToFront();
    await popupPage.waitForTimeout(300);

    // 合成後のフレーム上でのボタン中心座標（ポップアップは右上に POPUP_MARGIN で配置される）
    const box = await runButton.boundingBox();
    if (!box) throw new Error('実行ボタンの位置を取得できません');
    const popupShot = PNG.sync.read(await shotPopup(popupPage));
    const popupX0 = VIEWPORT.width - popupShot.width - POPUP_MARGIN;
    const target = { x: popupX0 + box.x + box.width * 0.45, y: POPUP_MARGIN + box.y + box.height * 0.55 };
    const start = { x: 620, y: 470 };

    const frames: Frame[] = [];

    // 1) 実行前: 静止 → カーソルがボタンへ移動
    const before = await captureFrame(formPage, popupPage);
    const clone = () => {
      const p = new PNG({ width: before.width, height: before.height });
      before.data.copy(p.data);
      return p;
    };
    {
      const f = clone();
      drawCursor(f, start.x, start.y);
      frames.push({ png: f, duration: 1.0 });
    }
    const MOVE_FRAMES = 8;
    for (let i = 1; i <= MOVE_FRAMES; i++) {
      const t = easeInOut(i / MOVE_FRAMES);
      const f = clone();
      drawCursor(f, start.x + (target.x - start.x) * t, start.y + (target.y - start.y) * t);
      frames.push({ png: f, duration: 0.06 });
    }
    // ボタン上で一呼吸
    {
      const f = clone();
      drawCursor(f, target.x, target.y);
      frames.push({ png: f, duration: 0.35 });
    }

    // 2) クリック → 入力完了まで実時間で撮り続ける
    //    （locator.click() はタブをアクティブ化してしまうため、ページ内 JS で click する）
    await runButton.evaluate((el) => (el as HTMLElement).click());
    const isDone = () => popupPage.evaluate(() => document.body.innerText.includes('件入力しました'));
    let last = Date.now();
    const deadline = Date.now() + 15000;
    for (;;) {
      if (Date.now() > deadline) throw new Error('入力が完了しません');
      if (await isDone()) break;
      const png = await captureFrame(formPage, popupPage);
      // 完了直後のフレームはポップアップにモックのホスト（127.0.0.1）が出るため採用せず、
      // 架空ホストに差し替えた最終フレームで置き換える（撮影中に完了した場合も捨てる）
      if (await isDone()) break;
      drawCursor(png, target.x, target.y);
      const now = Date.now();
      frames.push({ png, duration: Math.max(0.05, (now - last) / 1000) });
      last = now;
    }

    // 3) 入力後: 「直近の実行」の URL を架空ホストに差し替えてから結果を見せる（表示のみ。入力結果は変えない）
    await popupPage.evaluate(async (url) => {
      const stored = await chrome.storage.local.get('lastResult');
      const lastResult = stored.lastResult as { url?: string } | undefined;
      if (lastResult) await chrome.storage.local.set({ lastResult: { ...lastResult, url } });
    }, DEMO_RESULT_URL);
    await popupPage.reload();
    await popupPage.getByText(/件入力しました/).waitFor({ timeout: 15000 });
    await popupPage.waitForTimeout(300);
    const after = await captureFrame(formPage, popupPage);
    drawCursor(after, target.x, target.y);
    frames.push({ png: after, duration: 3.0 });

    await popupPage.close();
    await formPage.close();

    writeGif(frames, OUT_FILE);
    console.log(`[demo-gif] ${frames.length} frames -> ${OUT_FILE}`);
  } finally {
    await context.close();
    await server.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* Windows ではハンドル解放待ちで削除に失敗することがあるため無視する */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
