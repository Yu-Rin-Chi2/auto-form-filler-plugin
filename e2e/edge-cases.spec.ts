/**
 * テストシナリオ 1 章の追加フィクスチャ（レビュー指摘 B-2）を用いたエッジケース E2E。
 * empty-form / long-form / prefilled-ec-signup / wareki-birth-year / no-match-options。
 */
import { LONG_FORM } from '../tests/dom/fixtures';
import {
  buildFixedAnswerHandler,
  buildSuccessHandler,
  buildTestProfile,
  buildTestSettings,
} from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';
import type { FillResult } from '../src/shared/types';

async function readLastResult(page: import('@playwright/test').Page): Promise<FillResult | null> {
  return page.evaluate(async () => {
    const stored = await chrome.storage.local.get('lastResult');
    return (stored.lastResult ?? null) as unknown;
  }) as Promise<FillResult | null>;
}

test.describe('エッジケース（レビュー指摘 B-2）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-EDGE-01: フィールド0件のページは「入力できるフォームが見つかりません」、Jevへも送らない', async ({
    context,
    extensionId,
  }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/empty-form.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText('入力できるフォームが見つかりません')).toBeVisible({ timeout: 15000 });

    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/systemone'));
    expect(jevRequests.length).toBe(0);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-EDGE-03: 65フィールドのフォームは先頭60件のみ判定され、超過5件が結果に反映される', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildSuccessHandler(LONG_FORM));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/long-form.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    // 実項目3件（姓・名・メール）は先頭に置いているので確実に含まれ、入力される
    await expect(formPage.locator('input[name="last_name"]')).toHaveValue('鈴木');
    await expect(formPage.locator('input[name="first_name"]')).toHaveValue('一郎');
    await expect(formPage.locator('input[name="email"]')).toHaveValue('ichiro.suzuki.e2e@example.test');

    // Jev に送られたフィールド数は60件ちょうど（65件中、先頭60件のみ）
    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/systemone'));
    expect(jevRequests.length).toBe(1);
    const sentBody = jevRequests[0]?.body as { state?: { fields?: Record<string, unknown> } };
    expect(Object.keys(sentBody.state?.fields ?? {})).toHaveLength(60);

    // 超過5件は skippedOther に合算される（付記1）
    const result = await readLastResult(popupPage);
    expect(result?.filled).toBe(3);
    expect(result?.skippedOther).toBeGreaterThanOrEqual(5);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-EDGE-04: 既存値のあるフィールドは既定では上書きされず、設定でONにすると上書きされる', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildFixedAnswerHandler({ f0: 'family_name', f1: 'given_name', f2: 'email' }));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl, overwriteFilled: false }),
    });

    const { formPage, popupPage } = await openFormAndPopup(
      context,
      extensionId,
      `${server.url}/prefilled-ec-signup.html`,
    );

    // 1回目: overwriteFilled=false（既定）。既存値のある last_name は変化しない
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });
    await expect(formPage.locator('input[name="last_name"]')).toHaveValue('山田');
    await expect(formPage.locator('input[name="first_name"]')).toHaveValue('一郎');
    await expect(formPage.locator('input[name="email"]')).toHaveValue('ichiro.suzuki.e2e@example.test');

    // 設定を overwriteFilled=true に変更して再実行すると、既存値も上書きされる。
    // seedStorage は options.html を新規タブで開いて閉じるため、そのままだと
    // アクティブタブが formPage から移ってしまう（chrome.tabs.query({active:true}) の対象が
    // ずれる）。openFormAndPopup と同様に明示的に formPage を前面に戻してから再実行する。
    await seedStorage(context, extensionId, {
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl, overwriteFilled: true }),
    });
    await formPage.bringToFront();
    await clickRunButton(popupPage, 'このページに入力');
    await expect(formPage.locator('input[name="last_name"]')).toHaveValue('鈴木', { timeout: 15000 });

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-EDGE-06: 和暦のみの生年select は対応なしのまま、他フィールドの処理は継続する', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildFixedAnswerHandler({ f0: 'full_name', f1: 'birth_year' }));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(
      context,
      extensionId,
      `${server.url}/wareki-birth-year.html`,
    );
    const yearBefore = await formPage.locator('select[name="birth_year_wareki"]').inputValue();

    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(formPage.locator('input[name="full_name"]')).toHaveValue('鈴木 一郎');
    const yearAfter = await formPage.locator('select[name="birth_year_wareki"]').inputValue();
    expect(yearAfter).toBe(yearBefore);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-EDGE-07: 選択肢が正規化候補と一致しない select は対応なし（都道府県のローマ字表記のみ）', async ({
    context,
    extensionId,
  }) => {
    server.setJevHandler(buildFixedAnswerHandler({ f0: 'prefecture' }));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(
      context,
      extensionId,
      `${server.url}/no-match-options.html`,
    );
    const before = await formPage.locator('select[name="pref_romaji"]').inputValue();

    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    const after = await formPage.locator('select[name="pref_romaji"]').inputValue();
    expect(after).toBe(before);

    const result = await readLastResult(popupPage);
    expect(result?.filled).toBe(0);
    expect(result?.skippedOther).toBeGreaterThanOrEqual(1);

    await formPage.close();
    await popupPage.close();
  });
});
