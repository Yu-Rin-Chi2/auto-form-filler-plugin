/**
 * オプション画面の E2E（要件 3 章 / UI-UX 3.5〜3.8、テストシナリオ 5.3）。
 */
import { FORMS } from '../poc/fixtures/forms';
import { buildSuccessHandler, buildTestProfile, buildTestSettings, TEST_PROFILE_FIELDS } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';
import type { FillResult, Profile } from '../src/shared/types';

const EC_SIGNUP = FORMS.find((f) => f.id === 'ec-signup');
if (!EC_SIGNUP) throw new Error('ec-signup fixture not found');

function buildNamedProfile(name: string, id: string): Profile {
  const now = new Date().toISOString();
  return {
    id,
    name,
    color: '#3B82F6',
    fields: { ...TEST_PROFILE_FIELDS },
    createdAt: now,
    updatedAt: now,
  };
}

async function readLastResult(page: import('@playwright/test').Page): Promise<FillResult | null> {
  return page.evaluate(async () => {
    const stored = await chrome.storage.local.get('lastResult');
    return (stored.lastResult ?? null) as unknown;
  }) as Promise<FillResult | null>;
}

test.describe('オプション: プロフィール管理（E2E-OPTIONS-01〜05）', () => {
  test('E2E-OPTIONS-01: 「+ 追加」で新規プロフィールが一覧に追加される', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, { profiles: [], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.getByRole('button', { name: '+ 追加' }).click();
    await expect(page.getByRole('button', { name: '新しいプロフィール' })).toBeVisible();
    await expect(page.locator('#profile-name')).toHaveValue('新しいプロフィール');

    await page.close();
  });

  test('E2E-OPTIONS-02: 編集内容は「保存」を押すまで反映されない', async ({ context, extensionId }) => {
    const profile = buildNamedProfile('編集対象', 'p-edit');
    await seedStorage(context, extensionId, { profiles: [profile], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.getByRole('button', { name: '編集対象' }).click();
    const nameInput = page.locator('#profile-name');
    await nameInput.fill('編集後の名前');

    // 保存前は一覧側の表示は変わらない
    await expect(page.getByRole('button', { name: '編集対象' })).toBeVisible();
    await expect(page.getByRole('button', { name: '編集後の名前' })).toHaveCount(0);

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('button', { name: '編集後の名前' })).toBeVisible();
    await expect(page.getByRole('button', { name: '編集対象' })).toHaveCount(0);

    await page.close();
  });

  test('E2E-OPTIONS-03: 「複製」で同じ内容の別プロフィールが追加される', async ({ context, extensionId }) => {
    const profile = buildNamedProfile('複製元', 'p-dup');
    await seedStorage(context, extensionId, { profiles: [profile], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.getByRole('button', { name: '複製元', exact: true }).click();
    // exact: true が必要（プロフィール名「複製元」自体が「複製」を部分文字列として含むため、
    // 既定の部分一致だとプロフィール一覧側のボタンにも一致してしまう）
    await page.getByRole('button', { name: '複製', exact: true }).click();

    await expect(page.getByRole('button', { name: '複製元のコピー' })).toBeVisible();
    await expect(page.locator('.profile-list-item')).toHaveCount(2);

    await page.close();
  });

  test('E2E-OPTIONS-04: 「削除」→確認で一覧から削除される', async ({ context, extensionId }) => {
    const profileA = buildNamedProfile('残す方', 'p-keep');
    const profileB = buildNamedProfile('消す方', 'p-remove');
    await seedStorage(context, extensionId, { profiles: [profileA, profileB], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.getByRole('button', { name: '消す方' }).click();
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: '削除する' }).click();

    await expect(page.getByRole('button', { name: '消す方' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '残す方' })).toBeVisible();

    await page.close();
  });

  test('E2E-EDGE-13: 削除確認ダイアログはEscで閉じ、削除は実行されない', async ({ context, extensionId }) => {
    const profile = buildNamedProfile('温存対象', 'p-esc');
    await seedStorage(context, extensionId, { profiles: [profile], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.getByRole('button', { name: '温存対象' }).click();
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '温存対象' })).toBeVisible();

    await page.close();
  });

  test('E2E-OPTIONS-05: 最後の1件を削除するとポップアップは未作成状態になる', async ({ context, extensionId }) => {
    const profile = buildNamedProfile('唯一のプロフィール', 'p-only');
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test' }),
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.getByRole('button', { name: '唯一のプロフィール' }).click();
    await page.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('プロフィールがありません。')).toBeVisible();
    await page.close();

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByText('プロフィールがありません')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'プロフィールを作成する' })).toBeVisible();
    await popup.close();
  });
});

test.describe('オプション: インポート / エクスポート（E2E-OPTIONS-06〜09）', () => {
  test('E2E-OPTIONS-06: エクスポートしたJSONにプロフィールは含まれ、APIキーは含まれない', async ({
    context,
    extensionId,
  }) => {
    const profile = buildNamedProfile('エクスポート対象', 'p-export');
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-super-secret-key' }),
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    const downloadPromise = page.waitForEvent('download');
    // exact: true が必要（プロフィール名「エクスポート対象」が「エクスポート」を部分文字列と
    // して含むため、既定の部分一致だとプロフィール一覧側のボタンにも一致してしまう）
    await page.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');

    expect(text).toContain('エクスポート対象');
    expect(text).toContain('profiles');
    expect(text).not.toContain('sk-super-secret-key');
    expect(text).not.toContain('apiKey');

    await page.close();
  });

  test('E2E-OPTIONS-07/08: インポート（追加・置換）', async ({ context, extensionId }) => {
    const existing = buildNamedProfile('既存プロフィール', 'p-existing');
    await seedStorage(context, extensionId, { profiles: [existing], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    const importPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: [buildNamedProfile('インポートされる人', 'p-imported')],
    };

    // E2E-OPTIONS-07: 追加 → 既存プロフィールは残ったまま新規が加わる
    await page.locator('input[type="file"]').setInputFiles({
      name: 'export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importPayload)),
    });
    // exact: true が必要（サイドバーの「+ 追加」ボタンが「追加」を部分文字列として含むため）
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(page.getByRole('button', { name: '既存プロフィール' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'インポートされる人' })).toBeVisible();

    // E2E-OPTIONS-08: 置換 → 既存プロフィールがすべて入れ替わる
    const replacePayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: [buildNamedProfile('置換後の人', 'p-replaced')],
    };
    await page.locator('input[type="file"]').setInputFiles({
      name: 'export2.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(replacePayload)),
    });
    await page.getByRole('button', { name: '置換', exact: true }).click();
    await expect(page.getByRole('button', { name: '置換後の人' })).toBeVisible();
    await expect(page.getByRole('button', { name: '既存プロフィール' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'インポートされる人' })).toHaveCount(0);

    await page.close();
  });

  test('E2E-OPTIONS-09: 不正なJSONはエラー表示になり、既存プロフィールは変更されない', async ({
    context,
    extensionId,
  }) => {
    const existing = buildNamedProfile('無事な人', 'p-safe');
    await seedStorage(context, extensionId, { profiles: [existing], settings: buildTestSettings() });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#profiles`);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ this is not valid json'),
    });

    await expect(page.locator('.status-text--error')).toBeVisible();
    await expect(page.getByRole('button', { name: '無事な人' })).toBeVisible();

    await page.close();
  });
});

test.describe('オプション: API 設定（E2E-OPTIONS-10〜13）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-OPTIONS-10: プロバイダ切替は再読み込み後も維持される', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, {
      profiles: [],
      settings: buildTestSettings({ provider: 'openrouter' }),
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#api`);

    await page.getByRole('radio', { name: 'TypeSafe' }).check();
    await page.getByRole('button', { name: '保存' }).click();
    await page.reload();

    await expect(page.getByRole('radio', { name: 'TypeSafe' })).toBeChecked();
    await page.close();
  });

  test('E2E-OPTIONS-11: APIキーは末尾4文字のみ表示されマスクされる', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, {
      profiles: [],
      settings: buildTestSettings({ apiKey: 'sk-test' }),
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#api`);
    await page.reload();

    // maskKey('sk-test') = '•'.repeat(3) + 'test'
    await expect(page.locator('#api-key')).toHaveValue('•••test');
    await page.close();
  });

  test('E2E-OPTIONS-12: 接続テスト成功', async ({ context, extensionId }) => {
    server.setJevHandler(() => ({ status: 200, body: { answers: {} } }));
    await seedStorage(context, extensionId, {
      profiles: [],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#api`);

    await page.getByRole('button', { name: '接続テスト' }).click();
    await expect(page.getByText(/接続できました/)).toBeVisible({ timeout: 15000 });
    await page.close();
  });

  test('E2E-OPTIONS-13: 接続テスト失敗（401）', async ({ context, extensionId }) => {
    server.setJevHandler(() => ({ status: 401, body: { error: 'invalid key' } }));
    await seedStorage(context, extensionId, {
      profiles: [],
      settings: buildTestSettings({ apiKey: 'sk-invalid', baseUrl: server.jevUrl }),
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#api`);

    await page.getByRole('button', { name: '接続テスト' }).click();
    await expect(page.getByText(/キーが無効です/)).toBeVisible({ timeout: 15000 });
    await page.close();
  });
});

test.describe('オプション: 動作設定（E2E-OPTIONS-14）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-OPTIONS-14: 確信度閾値を上げると、閾値未満の回答はスキップされる', async ({
    context,
    extensionId,
  }) => {
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl, confidenceThreshold: 0.7 }),
    });

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html#behavior`);
    const slider = optionsPage.locator('#threshold');
    await slider.fill('0.9');
    await optionsPage.getByRole('button', { name: '保存' }).click();
    await expect(optionsPage.getByText('保存しました')).toBeVisible();
    await optionsPage.close();

    // Jev は全フィールドに confidence=0.75 で応答する（新しい閾値 0.9 未満）
    server.setJevHandler(buildSuccessHandler(EC_SIGNUP, 0.75));

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });

    const result = await readLastResult(popupPage);
    expect(result?.filled).toBe(0);
    expect(result?.skippedLowConfidence).toBeGreaterThan(0);

    await formPage.close();
    await popupPage.close();
  });
});
