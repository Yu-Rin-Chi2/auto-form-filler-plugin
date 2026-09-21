import { FORMS } from '../poc/fixtures/forms';
import { buildSuccessHandler, buildTestProfile, buildTestSettings } from './fixtures-data';
import {
  clickRunButton,
  expect,
  installStorageSyncSpy,
  openFormAndPopup,
  readStorageSyncCallCount,
  seedStorage,
  test,
} from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';

const PAYMENT = FORMS.find((f) => f.id === 'payment');
if (!PAYMENT) throw new Error('payment fixture not found');

test.describe('原則検証（要件 00-concept P1〜P3、横断・最重要）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-PRINCIPLE-03: カード情報は一切入力・ハイライトされない（payment フィクスチャ）', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildSuccessHandler(PAYMENT));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/payment.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.locator('.summary-card, .state-card')).toBeVisible({ timeout: 15000 });

    for (const name of ['card_name', 'card_number', 'cvv']) {
      await expect(formPage.locator(`input[name="${name}"]`)).toHaveValue('');
    }
    // exp_month / exp_year は select の性質上ページ読み込み時から先頭 option の値を
    // 持つが、cc-* のため抽出段階で除外され拡張からは一切変更されない
    // （Jev へ送られていないことは後段の combined 文字列チェックで検証する）。
    const cardNumberOutline = await formPage
      .locator('input[name="card_number"]')
      .evaluate((el) => (el as HTMLElement).style.outline);
    expect(cardNumberOutline).toBe('');

    // カード欄は Jev にも送られていない（除外は content script 内で行う）
    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/systemone'));
    const combined = JSON.stringify(jevRequests.map((r) => r.body));
    expect(combined).not.toContain('cc-number');
    expect(combined).not.toContain('cc-csc');

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-PRINCIPLE-04: chrome.storage.sync は一度も呼ばれない', async ({ context, extensionId }) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    await installStorageSyncSpy(worker);

    server.setJevHandler(buildSuccessHandler(PAYMENT));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html#profiles`);
    await installStorageSyncSpy(optionsPage);
    // プロフィール操作（保存）を一度行う
    await optionsPage.getByRole('button', { name: '+ 追加' }).click();
    await optionsPage.getByRole('button', { name: '保存' }).click();
    await optionsPage.close();

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/payment.html`);
    await installStorageSyncSpy(popupPage);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.locator('.summary-card, .state-card')).toBeVisible({ timeout: 15000 });

    expect(await readStorageSyncCallCount(worker)).toBe(0);
    expect(await readStorageSyncCallCount(popupPage)).toBe(0);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-PRINCIPLE-05: ページの可視テキスト全文を送らない', async ({ context, extensionId }) => {
    server.setJevHandler((body) => {
      const b = body as { questions?: Record<string, unknown> };
      const answers: Record<string, unknown> = {};
      for (const id of Object.keys(b.questions ?? {})) {
        answers[id] = { type: 'choice', choice: 'none', confidence: 0.9, probabilities: { none: 0.9 } };
      }
      return { status: 200, body: { answers, usage: { input_tokens: 100 } } };
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/long-text.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.locator('.summary-card, .state-card')).toBeVisible({ timeout: 15000 });

    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/systemone'));
    const combined = JSON.stringify(jevRequests.map((r) => r.body));
    expect(combined).not.toContain('ELEPHANT-MARKER-UNIQUE-TOKEN-0001');
    expect(combined).not.toContain('これを何度も繰り返して長さを稼ぎます');

    await formPage.close();
    await popupPage.close();
  });
});
