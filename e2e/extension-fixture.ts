/**
 * 拡張をロードした Playwright の context / extensionId を提供する共通フィクスチャ。
 * `chromium.launchPersistentContext` に `--load-extension=dist` を渡す（要件どおり）。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, test as base } from '@playwright/test';
import type { FieldOutcome, FillResult, Profile, Settings } from '../src/shared/types';

// E2E は `dist-e2e/`（`patch-manifest-for-e2e.ts` が `dist/` をコピーして
// ローカルモックサーバー向けの host_permissions のみを追加したもの）をロードする。
// `dist/`（リリース物）は E2E 実行中も一切変更されない（レビュー指摘 A-2）。
const DIST_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'dist-e2e');

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'auto-form-filler-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${DIST_DIR}`, `--load-extension=${DIST_DIR}`, '--no-first-run'],
    });
    await use(context);
    await context.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* Windows ではハンドル解放待ちで削除に失敗することがあるため無視する */
    }
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const id = worker.url().split('/')[2] as string;
    await use(id);
  },
});

export const expect = test.expect;

/**
 * ポップアップを別タブとして開きつつ、対象フォームのタブを `chrome.tabs.query({active:true})`
 * の対象に保つためのヘルパー。
 *
 * 実際の action popup はページ遷移を伴わないオーバーレイだが、Playwright でツールバー
 * アイコンのクリックを再現することはできないため、popup.html を通常のタブとして開く。
 * そのままだと popup タブがアクティブタブになってしまい、拡張が対象を見失うため、
 * popup を開いた直後にフォームタブを bringToFront() でアクティブに戻す
 * （Playwright はアクティブでないタブも引き続き操作できる）。
 */
export async function openFormAndPopup(
  context: BrowserContext,
  extensionId: string,
  formUrl: string,
): Promise<{ formPage: import('@playwright/test').Page; popupPage: import('@playwright/test').Page }> {
  const formPage = await context.newPage();
  await formPage.goto(formUrl);
  await formPage.bringToFront();

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

  await formPage.bringToFront();

  return { formPage, popupPage };
}

/**
 * 指定したコンテキスト（Page / ServiceWorker いずれも `.evaluate()` を持つ）に
 * `chrome.storage.sync.*` の呼び出し回数を数えるスパイを仕込む（要件 P1 の検証用）。
 */
export async function installStorageSyncSpy(target: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<void> {
  await target.evaluate(() => {
    const g = globalThis as unknown as {
      chrome: { storage: { sync: Record<string, (...args: unknown[]) => unknown> } };
      __storageSyncCallCount?: number;
    };
    g.__storageSyncCallCount = 0;
    const syncApi = g.chrome?.storage?.sync;
    if (!syncApi) return;
    for (const method of ['get', 'set', 'remove', 'clear']) {
      const original = syncApi[method];
      if (typeof original !== 'function') continue;
      syncApi[method] = (...args: unknown[]) => {
        g.__storageSyncCallCount = (g.__storageSyncCallCount ?? 0) + 1;
        return original.apply(syncApi, args);
      };
    }
  });
}

export async function readStorageSyncCallCount(target: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<number> {
  return target.evaluate(
    () => (globalThis as unknown as { __storageSyncCallCount?: number }).__storageSyncCallCount ?? 0,
  );
}

/**
 * ポップアップの実行ボタンを押す。
 *
 * Playwright の `locator.click()` は実際のマウスイベントを送出するため、Chrome 側で
 * そのタブがアクティブ化されてしまい、`chrome.tabs.query({active:true})` の対象が
 * ポップアップ自身にすり替わってしまう（`openFormAndPopup` で戻したはずのアクティブタブが
 * 再度ポップアップに移ってしまう）。`el.click()` をページ内 JS として実行することで
 * タブのフォーカス切り替えを避け、対象フォームのタブがアクティブなまま実行できるようにする。
 */
export async function clickRunButton(popupPage: import('@playwright/test').Page, name: string): Promise<void> {
  await popupPage.getByRole('button', { name }).evaluate((el) => (el as HTMLElement).click());
}

export async function seedStorage(
  context: BrowserContext,
  extensionId: string,
  data: { profiles?: Profile[]; settings?: Settings; lastResult?: FillResult | null; lastResultDetail?: FieldOutcome[] },
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((d) => chrome.storage.local.set(d), data as Record<string, unknown>);
  await page.close();
}
