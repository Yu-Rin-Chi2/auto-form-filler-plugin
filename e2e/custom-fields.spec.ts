/**
 * ユーザー定義項目（customFields）と銀行口座の E2E。
 * - E2E-CUSTOM-01: オプションで項目を追加・保存すると再読み込み後も残る
 * - E2E-CUSTOM-02: Jev がユーザー定義項目を選ぶと入力され、リクエストには項目名・説明のみが含まれ値は含まれない
 */
import { PROFILE_FIELD_KEYS_FOR_JEV } from '../workers/src/profile-fields';
import { buildChoiceAnswer, buildTestProfile, buildTestSettings } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { JevHandler, MockServer } from './mock-server';
import type { CustomField, Profile } from '../src/shared/types';

const TWITTER: CustomField = {
  id: 'custom_e2e00001',
  label: 'X（Twitter）の ID',
  description: 'Twitter handle starting with @',
  value: '@e2e_handle_value',
};

function profileWithCustom(): Profile {
  return { ...buildTestProfile(), customFields: [TWITTER] };
}

test.describe('ユーザー定義項目（E2E-CUSTOM-01/02）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-CUSTOM-01: 「+ 項目を追加」で追加・保存した項目は再読み込み後も残る', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, { profiles: [buildTestProfile()], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);
    await page.getByRole('button', { name: '個人' }).click();

    await page.getByRole('button', { name: '+ 項目を追加' }).click();
    const row = page.getByTestId('custom-field-row').first();
    await row.getByLabel('項目名').fill('社員番号');
    await row.getByLabel('説明（任意）').fill('Employee ID number');
    await row.getByLabel('値').fill('E-12345');
    await page.getByRole('button', { name: '保存' }).click();

    await page.reload();
    await page.getByRole('button', { name: '個人' }).click();
    const saved = page.getByTestId('custom-field-row').first();
    await expect(saved.getByLabel('項目名')).toHaveValue('社員番号');
    await expect(saved.getByLabel('値')).toHaveValue('E-12345');

    // 削除して保存すると消える
    await saved.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '保存' }).click();
    await page.reload();
    await page.getByRole('button', { name: '個人' }).click();
    await expect(page.getByTestId('custom-field-row')).toHaveCount(0);

    await page.close();
  });

  test('E2E-CUSTOM-02: Jev がユーザー定義項目を選ぶと入力され、リクエストに値は含まれない', async ({
    context,
    extensionId,
  }) => {
    // モック Jev: name="last_name" の欄にユーザー定義項目を、それ以外は none を返す
    const handler: JevHandler = (rawBody) => {
      const body = rawBody as {
        fields?: Record<string, { name?: string }>;
        customFields?: Array<{ id: string }>;
      };
      // 実 Jev と同様、提示された全項目（固定 + ユーザー定義）に確率を返す
      const keys = [...PROFILE_FIELD_KEYS_FOR_JEV, ...(body.customFields ?? []).map((c) => c.id)];
      const answers: Record<string, unknown> = {};
      for (const [id, field] of Object.entries(body.fields ?? {})) {
        answers[id] = buildChoiceAnswer(field.name === 'last_name' ? TWITTER.id : 'none', 0.95, keys);
      }
      return { status: 200, body: { model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 1, output_tokens: 1 } } };
    };
    server.setJevHandler(handler);

    await seedStorage(context, extensionId, {
      profiles: [profileWithCustom()],
      settings: buildTestSettings({ workerEndpoint: server.jevUrl }),
    });
    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    await expect(formPage.locator('input[name="last_name"]')).toHaveValue('@e2e_handle_value');

    // 詳細には custom_xxxx ではなく表示名が出る
    await popupPage.getByRole('button', { name: '詳細' }).click();
    await expect(popupPage.getByText('X（Twitter）の ID')).toBeVisible();

    // P1: リクエストには項目名・説明は含まれるが、値は含まれない
    const jevRequests = server.requests.filter((r) => r.path.includes('/v1/infer'));
    const combined = JSON.stringify(jevRequests.map((r) => r.body));
    expect(combined).toContain(TWITTER.id);
    expect(combined).toContain('Twitter handle starting with @');
    expect(combined).not.toContain('@e2e_handle_value');

    await formPage.close();
    await popupPage.close();
  });
});
