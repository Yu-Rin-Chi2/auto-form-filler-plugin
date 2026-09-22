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
import { buildChoiceAnswer, buildTestSettings } from '../e2e/fixtures-data';
import { startMockServer, type JevHandler } from '../e2e/mock-server';
import { createEmptyProfileFields } from '../src/shared/profile-schema';
import type { Profile } from '../src/shared/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = join(root, 'dist-e2e');
const OUT_DIR = join(root, 'docs', 'store', 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const POPUP_WIDTH = 320;
const DEMO_FORM_HTML = readFileSync(join(root, 'docs', 'store', 'demo-form.html'), 'utf8');
/** ポップアップの「直近の実行」に表示する架空のホスト（モックの 127.0.0.1 を見せないため） */
const DEMO_RESULT_URL = 'https://shop.example.com/signup';

/** デモフォームの name 属性 → プロフィール項目。モック Jev はこの表どおりに回答する */
const ANSWER_BY_NAME: Record<string, string> = {
  last_name: 'family_name',
  first_name: 'given_name',
  last_name_kana: 'family_name_kana',
  first_name_kana: 'given_name_kana',
  email: 'email',
  tel: 'phone',
  birth_year: 'birth_year',
  birth_month: 'birth_month',
  birth_day: 'birth_day',
  gender: 'gender',
  zip: 'postal_code',
  pref: 'prefecture',
  city: 'city',
  address1: 'address_line1',
  address2: 'address_line2',
};

const demoHandler: JevHandler = (rawBody) => {
  const body = rawBody as {
    questions?: Record<string, unknown>;
    state?: { fields?: Record<string, { name?: string }> };
  };
  const answers: Record<string, unknown> = {};
  for (const id of Object.keys(body.questions ?? {})) {
    const name = body.state?.fields?.[id]?.name ?? '';
    answers[id] = buildChoiceAnswer(ANSWER_BY_NAME[name] ?? 'none');
  }
  return {
    status: 200,
    body: { model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 4000, output_tokens: 50 } },
  };
};

/** 掲載用のダミープロフィール（実在しない値） */
function buildDemoProfile(): Profile {
  const now = new Date().toISOString();
  return {
    id: 'profile-demo',
    name: '個人',
    color: '#2563EB',
    createdAt: now,
    updatedAt: now,
    fields: {
      ...createEmptyProfileFields(),
      family_name: '山田',
      given_name: '太郎',
      family_name_kana: 'ヤマダ',
      given_name_kana: 'タロウ',
      family_name_romaji: 'YAMADA',
      given_name_romaji: 'TARO',
      email: 'taro.yamada@example.com',
      phone: '090-1234-5678',
      postal_code: '150-0002',
      prefecture: '東京都',
      city: '渋谷区',
      address_line1: '渋谷1-2-3',
      address_line2: 'サンプルビル 5F',
      country: '日本',
      company: '株式会社サンプル',
      department: '開発部',
      birth_date: '1990-04-15',
      gender: 'male',
    },
  };
}

/** ポップアップ画像を背景画像の右上に、影付きで合成する */
function composePopup(background: Buffer, popup: Buffer): Buffer {
  const bg = PNG.sync.read(background);
  const fg = PNG.sync.read(popup);
  const margin = 12;
  const x0 = bg.width - fg.width - margin;
  const y0 = margin;

  // 影（外側 12px を距離に応じて暗くする）
  const shadow = 12;
  for (let y = y0 - shadow; y < y0 + fg.height + shadow; y++) {
    for (let x = x0 - shadow; x < x0 + fg.width + shadow; x++) {
      if (x < 0 || y < 0 || x >= bg.width || y >= bg.height) continue;
      const dx = Math.max(0, x0 - x, x - (x0 + fg.width - 1));
      const dy = Math.max(0, y0 - y, y - (y0 + fg.height - 1));
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0 || d > shadow) continue;
      const alpha = 0.28 * (1 - d / shadow) ** 2;
      const idx = (bg.width * y + x) << 2;
      for (let c = 0; c < 3; c++) bg.data[idx + c] = Math.round(bg.data[idx + c] * (1 - alpha));
    }
  }

  // 本体 + 1px の枠線
  for (let y = 0; y < fg.height; y++) {
    for (let x = 0; x < fg.width; x++) {
      const bx = x0 + x;
      const by = y0 + y;
      if (bx >= bg.width || by >= bg.height) continue;
      const bi = (bg.width * by + bx) << 2;
      const fi = (fg.width * y + x) << 2;
      const edge = x === 0 || y === 0 || x === fg.width - 1 || y === fg.height - 1;
      bg.data[bi] = edge ? 0xd1 : fg.data[fi];
      bg.data[bi + 1] = edge ? 0xd5 : fg.data[fi + 1];
      bg.data[bi + 2] = edge ? 0xdb : fg.data[fi + 2];
      bg.data[bi + 3] = 255;
    }
  }
  return PNG.sync.write(bg);
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
