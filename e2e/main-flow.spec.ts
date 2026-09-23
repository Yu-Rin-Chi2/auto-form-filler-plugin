import { calculateAge } from '../src/shared/derive';
import { FORMS } from '../poc/fixtures/forms';
import { buildSuccessHandler, buildTestProfile, buildTestSettings, TEST_PROFILE_FIELDS } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';

function formById(id: string) {
  const form = FORMS.find((f) => f.id === id);
  if (!form) throw new Error(`fixture not found: ${id}`);
  return form;
}

const EC_SIGNUP = formById('ec-signup');

test.describe('メインフロー（E2E-FLOW-01）と原則検証（P1/P2）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('EC会員登録フォームが一括入力され、submitは一切呼ばれず、リクエストに値が含まれない', async ({
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

    // P2: submit を監視する
    let submitFired = false;
    await formPage.evaluate(() => {
      document.querySelector('form')?.addEventListener('submit', () => {
        (window as unknown as { __submitFired: boolean }).__submitFired = true;
      });
    });

    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    // E2E-FLOW-01: 主要フィールドが入力される
    await expect(formPage.locator('input[name="last_name"]')).toHaveValue('鈴木');
    await expect(formPage.locator('input[name="first_name"]')).toHaveValue('一郎');
    await expect(formPage.locator('input[name="last_name_kana"]')).toHaveValue('スズキ');
    await expect(formPage.locator('input[name="email"]')).toHaveValue('ichiro.suzuki.e2e@example.test');
    await expect(formPage.locator('input[name="email_confirm"]')).toHaveValue('ichiro.suzuki.e2e@example.test');
    await expect(formPage.locator('input[name="tel"]')).toHaveValue('090-1234-5678');
    await expect(formPage.locator('input[name="zip"]')).toHaveValue('100-0001');
    await expect(formPage.locator('select[name="pref"]')).toHaveValue('東京都');
    await expect(formPage.locator('input[name="city"]')).toHaveValue('千代田区');
    // 生年(年)の select は poc フィクスチャの選択肢が省略表記（'…'）で 1990 を含まないため、
    // ここでは選択肢が一致するケース（都道府県）の検証で select 注入の正しさを代表させる。
    // メルマガ同意 checkbox は抽出段階で除外され Jev にも送られないため変化しない（A-4）
    await expect(formPage.locator('input[name="mailmag"]')).not.toBeChecked();

    // P2: submit イベントは一度も発火していない
    submitFired = await formPage.evaluate(
      () => (window as unknown as { __submitFired?: boolean }).__submitFired ?? false,
    );
    expect(submitFired).toBe(false);
    expect(formPage.url()).toContain('ec-signup.html');

    // P1: Jev へのリクエスト本文にプロフィールの実値が含まれない
    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/infer'));
    expect(jevRequests.length).toBeGreaterThan(0);
    const combined = JSON.stringify(jevRequests.map((r) => r.body));
    expect(combined).not.toContain('鈴木');
    expect(combined).not.toContain('一郎');
    expect(combined).not.toContain('ichiro.suzuki.e2e@example.test');
    expect(combined).not.toContain('090-1234-5678');
    expect(combined).not.toContain('千代田9-9-9');
    expect(combined).not.toContain('イーツーイータワー505');

    await formPage.close();
    await popupPage.close();
  });
});

test.describe('追加フィクスチャのメインフロー（E2E-FLOW-03/04/06/07/08、レビュー指摘 B-1）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-FLOW-03: google-forms（無意味な entry.NNN 名、ラベルのみでの判定・住所一体連結）', async ({
    context,
    extensionId,
  }) => {
    const form = formById('google-forms');
    server.setJevHandler(buildSuccessHandler(form));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/google-forms.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(formPage.locator('input[name="entry.1041234567"]')).toHaveValue('鈴木 一郎');
    await expect(formPage.locator('input[name="entry.1049876543"]')).toHaveValue('スズキ イチロウ');
    const expectedAge = String(calculateAge(TEST_PROFILE_FIELDS.birth_date) ?? '');
    await expect(formPage.locator('input[name="entry.1052223344"]')).toHaveValue(expectedAge);
    await expect(formPage.locator('input[name="entry.1055556677"]')).toHaveValue(
      'ichiro.suzuki.e2e@example.test',
    );
    await expect(formPage.locator('input[name="entry.1058889900"]')).toHaveValue('090-1234-5678');
    // address_full: prefecture + city + address_line1 + address_line2 を区切りなしで連結
    await expect(formPage.locator('input[name="entry.1061112233"]')).toHaveValue(
      '東京都千代田区千代田9-9-9イーツーイータワー505',
    );
    // none 判定のフィールドは未入力のまま
    await expect(formPage.locator('input[name="entry.1064445566"]')).toHaveValue('');
    await expect(formPage.locator('textarea[name="entry.1067778899"]')).toHaveValue('');

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-FLOW-04: job-apply（type=date の生年月日、住所一体型）', async ({ context, extensionId }) => {
    const form = formById('job-apply');
    server.setJevHandler(buildSuccessHandler(form));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/job-apply.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(formPage.locator('input[name="family_name"]')).toHaveValue('鈴木');
    await expect(formPage.locator('input[name="first_name"]')).toHaveValue('一郎');
    // job-apply のラベルは「姓（ふりがな）」「名（ふりがな）」で「ふりがな」を含むため、
    // 保存値（カタカナ）はひらがなに変換されて入力される（要件 2.4 かな変換）
    await expect(formPage.locator('input[name="family_name_kana"]')).toHaveValue('すずき');
    await expect(formPage.locator('input[name="first_name_kana"]')).toHaveValue('いちろう');
    // type=date へは YYYY-MM-DD（要件 5.3 手順6）
    await expect(formPage.locator('input[name="birthday"]')).toHaveValue('1990-01-31');
    await expect(formPage.locator('input[name="postal"]')).toHaveValue('100-0001');
    await expect(formPage.locator('input[name="address"]')).toHaveValue(
      '東京都千代田区千代田9-9-9イーツーイータワー505',
    );
    await expect(formPage.locator('input[name="email"]')).toHaveValue('ichiro.suzuki.e2e@example.test');
    await expect(formPage.locator('input[name="phone"]')).toHaveValue('090-1234-5678');
    // none 判定（学歴・志望職種・自己PR）は未入力のまま
    await expect(formPage.locator('textarea[name="pr"]')).toHaveValue('');

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-FLOW-06/07: municipal-event（「ふりがな」→ひらがな変換、年齢区分 select は対応なし）', async ({
    context,
    extensionId,
  }) => {
    const form = formById('municipal-event');
    server.setJevHandler(buildSuccessHandler(form));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(
      context,
      extensionId,
      `${server.url}/municipal-event.html`,
    );
    // E2E-FLOW-07: 年齢区分 select の実行前の値を控えておく（年によらず「変化しない」ことを検証するため）
    const nenreiBefore = await formPage.locator('select[name="nenrei"]').inputValue();

    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(formPage.locator('input[name="shimei"]')).toHaveValue('鈴木 一郎');
    // E2E-FLOW-06: ラベルに「ふりがな」を含むため、カタカナ保存値（スズキ イチロウ）が
    // ひらがな（すずき いちろう）に変換されて入力される
    await expect(formPage.locator('input[name="furigana"]')).toHaveValue('すずき いちろう');
    await expect(formPage.locator('input[name="yubin"]')).toHaveValue('100-0001');
    await expect(formPage.locator('input[name="jusho"]')).toHaveValue(
      '東京都千代田区千代田9-9-9イーツーイータワー505',
    );
    await expect(formPage.locator('input[name="denwa"]')).toHaveValue('090-1234-5678');
    await expect(formPage.locator('input[name="mail"]')).toHaveValue('ichiro.suzuki.e2e@example.test');

    // E2E-FLOW-07: 年齢は「20代」〜「60代以上」という区分値であり、数値の年齢とは
    // 正規化候補が一致しないため対応なし（select の値は実行前から変化しない）
    const nenreiAfter = await formPage.locator('select[name="nenrei"]').inputValue();
    expect(nenreiAfter).toBe(nenreiBefore);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-FLOW-08: en-checkout（英語ラベルでの判定、country 正規化「日本」→「Japan」）', async ({
    context,
    extensionId,
  }) => {
    const form = formById('en-checkout');
    server.setJevHandler(buildSuccessHandler(form));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/en-checkout.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(formPage.locator('input[name="firstName"]')).toHaveValue('一郎');
    await expect(formPage.locator('input[name="lastName"]')).toHaveValue('鈴木');
    await expect(formPage.locator('input[name="email"]')).toHaveValue('ichiro.suzuki.e2e@example.test');
    await expect(formPage.locator('input[name="phone"]')).toHaveValue('090-1234-5678');
    // country 正規化: プロフィールの「日本」が候補 Japan/JP/JPN のうち選択肢に完全一致する
    // "Japan" に正規化されて選択される
    await expect(formPage.locator('select[name="country"]')).toHaveValue('Japan');
    await expect(formPage.locator('input[name="zip"]')).toHaveValue('100-0001');
    await expect(formPage.locator('input[name="city"]')).toHaveValue('千代田区');
    await expect(formPage.locator('input[name="address1"]')).toHaveValue('千代田9-9-9');
    await expect(formPage.locator('input[name="address2"]')).toHaveValue('イーツーイータワー505');
    await expect(formPage.locator('input[name="company"]')).toHaveValue('イーツーイー株式会社');
    await expect(formPage.locator('input[name="dob"]')).toHaveValue('1990-01-31');
    await expect(formPage.locator('textarea[name="notes"]')).toHaveValue('');

    await formPage.close();
    await popupPage.close();
  });
});
