/**
 * クロスオリジン iframe 内のフォーム（Stripe Connect のホスト型オンボーディング等）の E2E。
 *
 * - E2E-FRAME-01: 拡張がアクセスできる別オリジン iframe（dist-e2e の host_permissions
 *   `http://127.0.0.1/*` はポート違いも含む）内のフォームに入力できる。最上位ページの
 *   opacity:0 の <select> は抽出対象にならない
 * - E2E-FRAME-02: アクセスできない別オリジン iframe（`http://localhost:*` は host_permissions の
 *   パターンに一致しない）しかない場合、frame_permission_needed として「許可して再実行」を案内する。
 *   Chrome の権限ダイアログ自体は Playwright から操作できないため、案内の表示までを検証する
 */
import { FORMS } from '../poc/fixtures/forms';
import { buildSuccessHandler, buildTestProfile, buildTestSettings } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';

const EC_SIGNUP = FORMS.find((f) => f.id === 'ec-signup');
if (!EC_SIGNUP) throw new Error('ec-signup fixture not found');

test.describe('クロスオリジン iframe 内のフォーム（E2E-FRAME-01/02）', () => {
  let hostServer: MockServer;
  let frameServer: MockServer;

  test.beforeAll(async () => {
    hostServer = await startMockServer();
    frameServer = await startMockServer();
  });

  test.afterAll(async () => {
    await hostServer.close();
    await frameServer.close();
  });

  test('E2E-FRAME-01: 別オリジン（別ポート）の iframe 内フォームに入力され、トーストは最上位ページに出る', async ({
    context,
    extensionId,
  }) => {
    hostServer.setJevHandler(buildSuccessHandler(EC_SIGNUP));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: hostServer.jevUrl }),
    });

    const frameUrl = `${frameServer.url}/ec-signup.html`;
    const { formPage, popupPage } = await openFormAndPopup(
      context,
      extensionId,
      `${hostServer.url}/iframe-host.html#src=${encodeURIComponent(frameUrl)}`,
    );
    const frame = formPage.frameLocator('iframe');
    await frame.locator('input[name="last_name"]').waitFor();

    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(frame.locator('input[name="last_name"]')).toHaveValue('鈴木');
    await expect(frame.locator('input[name="email"]')).toHaveValue('ichiro.suzuki.e2e@example.test');
    await expect(frame.locator('select[name="pref"]')).toHaveValue('東京都');
    // 最上位ページの言語切替 <select>（opacity:0）は触らない
    await expect(formPage.locator('select[name="locale"]')).toHaveValue('ja');
    // トーストは最上位ページに表示される
    await expect(formPage.getByText(/件入力しました/)).toBeVisible();
    // 権限の案内は出ない
    await expect(popupPage.getByRole('button', { name: '許可して再実行' })).toHaveCount(0);

    // P1: iframe 内のフィールドも含め、リクエストに値は含まれない
    const jevRequests = hostServer.requests.filter((r) => r.path.includes('/v1/infer'));
    expect(jevRequests.length).toBeGreaterThan(0);
    const combined = JSON.stringify(jevRequests.map((r) => r.body));
    expect(combined).toContain('last_name');
    expect(combined).not.toContain('鈴木');
    expect(combined).not.toContain('ichiro.suzuki.e2e@example.test');

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-FRAME-02: アクセスできない別オリジン iframe しかない場合は「許可して再実行」を案内する', async ({
    context,
    extensionId,
  }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: hostServer.jevUrl }),
    });

    // `http://localhost:<port>` は dist-e2e の host_permissions（http://127.0.0.1/*）に一致しない
    const frameUrl = `${frameServer.url.replace('127.0.0.1', 'localhost')}/ec-signup.html`;
    const { formPage, popupPage } = await openFormAndPopup(
      context,
      extensionId,
      `${hostServer.url}/iframe-host.html#src=${encodeURIComponent(frameUrl)}`,
    );
    await formPage.frameLocator('iframe').locator('input[name="last_name"]').waitFor();

    const requestsBefore = hostServer.requests.length;
    await clickRunButton(popupPage, 'このページに入力');

    await expect(popupPage.getByText('フォームは別サイトの枠（iframe）内にあります')).toBeVisible({ timeout: 15000 });
    await expect(popupPage.getByText(new URL(frameUrl).host)).toBeVisible();
    await expect(popupPage.getByRole('button', { name: '許可して再実行' })).toBeVisible();
    // Jev は呼ばれない（入力欄が 0 件のため）
    expect(hostServer.requests.length).toBe(requestsBefore);
    // iframe 内は未入力のまま
    await expect(formPage.frameLocator('iframe').locator('input[name="last_name"]')).toHaveValue('');

    await formPage.close();
    await popupPage.close();
  });
});
