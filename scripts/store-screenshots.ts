/**
 * Chrome Web Store 掲載用スクリーンショット（1280×800）を生成する。
 *
 * E2E と同じ仕組み（dist-e2e/ をロード、Jev はローカルモック）で拡張を動かし、
 * ポップアップは別タブとして開いて撮影した画像をフォーム画面の右上に合成する
 * （Playwright は実際の action popup を撮影できないため）。実 Jev API には接続しない。
 *
 * 実行: npm run store-screenshots
 * 出力: docs/store/screenshots/*.png
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { buildTestSettings } from '../e2e/fixtures-data';
import { startMockServer } from '../e2e/mock-server';
import { buildDemoProfile, composePopup as composePopupPng, demoHandler } from './demo-shared';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = join(root, 'dist-e2e');
const OUT_DIR = join(root, 'docs', 'store', 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const POPUP_WIDTH = 320;
const DEMO_FORM_HTML = readFileSync(join(root, 'docs', 'store', 'demo-form.html'), 'utf8');
/** ポップアップの「直近の実行」に表示する架空のホスト（モックの 127.0.0.1 を見せないため） */
const DEMO_RESULT_URL = 'https://shop.example.com/signup';

function composePopup(background: Buffer, popup: Buffer): Buffer {
  return PNG.sync.write(composePopupPng(background, popup));
}

async function seedStorage(context: BrowserContext, extensionId: string, data: Record<string, unknown>) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((d) => chrome.storage.local.set(d), data);
  await page.close();
}

async function shotPopup(page: Page): Promise<Buffer> {
  await page.setViewportSize({ width: POPUP_WIDTH, height: 200 });
  await page.waitForTimeout(300);
  return page.screenshot({ fullPage: true });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startMockServer();
  const userDataDir = mkdtempSync(join(tmpdir(), 'auto-form-filler-shots-'));
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
        apiKey: 'sk-or-v1-demo0000000000000000000000000000000000000000000000000000ab12',
        baseUrl: server.jevUrl,
        lastProfileId: profile.id,
      }),
    });

    server.setJevHandler(demoHandler);

    // --- 04: 実行前（フォーム + ポップアップ） ---
    // モックサーバーのページに、掲載用に整えたデモフォームを差し込む（同一オリジンのまま）
    const formPage = await context.newPage();
    await formPage.goto(`${server.url}/ec-signup.html`);
    await formPage.evaluate((html) => {
      document.open();
      document.write(html);
      document.close();
    }, DEMO_FORM_HTML);
    await formPage.locator('input[name="last_name"]').waitFor();
    await formPage.bringToFront();
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.getByRole('button', { name: 'このページに入力' }).waitFor();
    await formPage.bringToFront();

    const before = composePopup(await formPage.screenshot(), await shotPopup(popupPage));
    writeFileSync(join(OUT_DIR, '04-popup-before.png'), before);

    // --- 01: 実行後（入力結果のハイライト + 件数サマリ） ---
    await popupPage.getByRole('button', { name: 'このページに入力' }).evaluate((el) => (el as HTMLElement).click());
    await popupPage.getByText(/件入力しました/).waitFor({ timeout: 15000 });
    await formPage.evaluate(() => window.scrollTo(0, 0));
    await formPage.waitForTimeout(300);
    const formFilled = await formPage.screenshot();

    // 「直近の実行」の URL を架空ホストに差し替えてポップアップを再表示する（表示のみ。入力結果は変えない）
    await popupPage.evaluate(async (url) => {
      const stored = await chrome.storage.local.get('lastResult');
      const last = stored.lastResult as { url?: string } | undefined;
      if (last) await chrome.storage.local.set({ lastResult: { ...last, url } });
    }, DEMO_RESULT_URL);
    await popupPage.reload();
    await popupPage.getByText(/件入力しました/).waitFor({ timeout: 15000 });
    const filled = composePopup(formFilled, await shotPopup(popupPage));
    writeFileSync(join(OUT_DIR, '01-popup-filled.png'), filled);
    await popupPage.close();
    await formPage.close();

    // --- 02: オプション（プロフィール編集） ---
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html#profiles`);
    await options.getByRole('button', { name: profile.name }).click();
    await options.locator('#profile-name').waitFor();
    await options.waitForTimeout(300);
    await options.screenshot({ path: join(OUT_DIR, '02-options-profile.png') });

    // --- 03: オプション（プライバシー: 送信内容の明示） ---
    await options.getByRole('tab', { name: 'プライバシー' }).click();
    await options.waitForTimeout(300);
    await options.screenshot({ path: join(OUT_DIR, '03-options-privacy.png') });
    await options.close();

    console.log(`[store-screenshots] wrote 4 files -> ${OUT_DIR}`);
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
