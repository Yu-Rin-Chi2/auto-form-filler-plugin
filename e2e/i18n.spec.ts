/**
 * i18n（F-12）。Settings.locale の切替でポップアップ・オプションの文言が
 * 日本語⇄英語で切り替わることを検証する（テストシナリオ 5.8）。
 *
 * 注: E2E-I18N-01（ロケール未設定時は既定で日本語）は、実際には
 * `chrome.i18n.getUILanguage()`（ブラウザの UI 言語、CI 環境依存）にフォールバックする仕様
 * のため、CI での再現性を優先して `locale: 'ja'` を明示的に指定して検証する
 * （ブラウザの言語設定そのものを検証する項目ではないため）。
 */
import { FORMS } from '../poc/fixtures/forms';
import { buildSuccessHandler, buildTestProfile, buildTestSettings } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';

const EC_SIGNUP = FORMS.find((f) => f.id === 'ec-signup');
if (!EC_SIGNUP) throw new Error('ec-signup fixture not found');

test.describe('i18n（F-12、レビュー指摘 B-6）', () => {
  test('E2E-I18N-01: locale=ja では日本語表示になる', async ({ context, extensionId }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', locale: 'ja' }),
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole('button', { name: 'このページに入力' })).toBeVisible();
    await popup.close();
  });

  test('E2E-I18N-02: locale=en に切り替えるとポップアップ・オプションが英語表示になる', async ({
    context,
    extensionId,
  }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', locale: 'en' }),
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole('button', { name: 'Fill this page' })).toBeVisible();
    await expect(popup.getByText('Profile')).toBeVisible();
    await popup.close();

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html#profiles`);
    await expect(options.getByRole('tab', { name: 'Profiles' })).toBeVisible();
    await expect(options.getByRole('tab', { name: 'API Settings' })).toBeVisible();
    await expect(options.getByRole('tab', { name: 'Behavior' })).toBeVisible();
    await expect(options.getByRole('tab', { name: 'Privacy' })).toBeVisible();
    await options.close();
  });

  test('E2E-I18N-03: 英語UIでも日本のフォーム前提の補足付きラベルになる', async ({ context, extensionId }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', locale: 'en' }),
    });
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await options.getByRole('button', { name: profile.name }).click();
    await expect(options.getByText('Family name (kanji)')).toBeVisible();
    await expect(options.getByText('Family name (kana)')).toBeVisible();

    await options.close();
  });

});

test.describe('i18n: Jev への送信内容（E2E-I18N-04）', () => {
  // レビュー指摘 B-6 補足: server.close() はテスト本体からではなく beforeAll/afterAll
  // （他の spec と同じパターン）から呼ぶ必要がある。テスト本体内で server.close() を呼ぶと、
  // 拡張の service worker がまだ生きていて Jev へのリクエストで張った keep-alive の
  // TCP ソケットが残ったままになり、http.Server.close() がソケットの自然な解放を待ち続けて
  // 永遠にハングする（context.close() でソケットごと強制終了されるのは、
  // このテスト関数が return したあとのフィクスチャ teardown 時点であり、
  // server.close() を待っている間は return できないためデッドロックする）。
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-I18N-04: 英語ロケールで実行しても Jev への instructions/profile は常に英語', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildSuccessHandler(EC_SIGNUP));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl, locale: 'en' }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'Fill this page');
    await expect(popupPage.getByText(/fields filled/)).toBeVisible({ timeout: 15000 });

    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/systemone'));
    expect(jevRequests.length).toBeGreaterThan(0);
    const combined = JSON.stringify(jevRequests.map((r) => r.body));
    // UI ロケールに関わらず、Jev への profile 説明・instructions は英語のまま
    expect(combined).toContain('Family name / surname in kanji');
    expect(combined).toContain('Which profile entry should be typed or selected');

    await formPage.close();
    await popupPage.close();
  });
});
