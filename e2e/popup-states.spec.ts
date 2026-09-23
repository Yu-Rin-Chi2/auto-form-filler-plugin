import { FORMS } from '../poc/fixtures/forms';
import { buildSuccessHandler, buildTestProfile, buildTestSettings } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';

const EC_SIGNUP = FORMS.find((f) => f.id === 'ec-signup');
if (!EC_SIGNUP) throw new Error('ec-signup fixture not found');

test.describe('ポップアップの状態（要件 UI/UX 4章）', () => {
  test('E2E-POPUP-03: プロフィールがなければ案内が表示される', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, { profiles: [], settings: buildTestSettings() });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByText('プロフィールがありません')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'プロフィールを作成する' })).toBeVisible();
  });

  test('E2E-POPUP-04: 「プロフィールを作成する」からプロフィールタブが開く', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, { profiles: [], settings: buildTestSettings() });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const newPagePromise = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'プロフィールを作成する' }).click();
    const optionsPage = await newPagePromise;
    await optionsPage.waitForLoadState();
    expect(optionsPage.url()).toContain('options.html#profiles');
    await expect(optionsPage.getByRole('tab', { name: 'プロフィール', selected: true })).toBeVisible();
    await optionsPage.close();
  });

  test('E2E-POPUP-05: プロフィールがあれば通常状態になる', async ({ context, extensionId }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings(),
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole('button', { name: 'このページに入力' })).toBeEnabled();
    await expect(popup.locator('#profile-select')).toContainText(profile.name);
  });

  test('E2E-POPUP-06: 直近結果が保存されていれば、開いた時点で表示される', async ({ context, extensionId }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings(),
      lastResult: {
        url: 'https://shop.example.jp/signup',
        profileId: profile.id,
        at: new Date().toISOString(),
        filled: 5,
        skippedLowConfidence: 1,
        noMatch: 2,
        excluded: 0,
        skippedOther: 0,
        latencyMs: 850,
        inputTokens: 1200,
      },
      lastResultDetail: [],
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popup.getByText('5件入力しました')).toBeVisible();
    await expect(popup.getByText(/shop\.example\.jp/)).toBeVisible();
    await expect(popup.getByText(/たった今/)).toBeVisible();
  });
});

test.describe('ポップアップ: 実行中→完了の遷移と詳細表示（E2E-POPUP-07/08）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-POPUP-07: 実行中は「判定中…」表示になり、完了すると件数サマリに切り替わる', async ({
    context,
    extensionId,
  }) => {
    // レスポンスを意図的に遅らせて「判定中…」表示を確実に観測できるようにする
    const innerHandler = buildSuccessHandler(EC_SIGNUP);
    server.setJevHandler(async (body, req) => {
      await new Promise((r) => setTimeout(r, 800));
      return innerHandler(body, req);
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');

    await expect(popupPage.getByText('判定中…')).toBeVisible();
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });
    await expect(popupPage.getByText('判定中…')).toHaveCount(0);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-POPUP-08: 詳細表示にはラベル・項目・状態のみが出て、値そのものは表示されない', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildSuccessHandler(EC_SIGNUP));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await popupPage.getByRole('button', { name: '詳細' }).click();
    const detailList = popupPage.locator('.detail-list');
    await expect(detailList).toBeVisible();
    // フィールドの項目名（choice）と状態（入力済み等）が表示される
    await expect(detailList).toContainText('family_name');
    await expect(detailList).toContainText('入力済み');
    // プロフィールの実値（氏名・メール等）は一切表示されない
    const detailText = await detailList.innerText();
    expect(detailText).not.toContain('鈴木');
    expect(detailText).not.toContain('一郎');
    expect(detailText).not.toContain('ichiro.suzuki.e2e@example.test');
    expect(detailText).not.toContain('090-1234-5678');

    await formPage.close();
    await popupPage.close();
  });
});
