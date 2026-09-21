import { FORMS } from '../poc/fixtures/forms';
import { buildChoiceAnswer, buildTestProfile, buildTestSettings } from './fixtures-data';
import { clickRunButton, expect, openFormAndPopup, seedStorage, test } from './extension-fixture';
import { startMockServer } from './mock-server';
import type { MockServer } from './mock-server';

const EC_SIGNUP = FORMS.find((f) => f.id === 'ec-signup');
if (!EC_SIGNUP) throw new Error('ec-signup fixture not found');

/** questions に含まれる全フィールドへ、criteria に存在しない choice を返す（検証失敗を起こす） */
function buildInvalidAnswerHandler() {
  return (rawBody: unknown) => {
    const body = rawBody as { questions?: Record<string, unknown> };
    const answers: Record<string, unknown> = {};
    for (const id of Object.keys(body.questions ?? {})) {
      answers[id] = { type: 'choice', choice: 'not_a_real_profile_key', confidence: 0.9, probabilities: {} };
    }
    return { status: 200, body: { answers, usage: { input_tokens: 100 } } };
  };
}

/** questions に含まれる全フィールドへ choice=none の妥当な回答を返す */
function buildAllNoneHandler() {
  return (rawBody: unknown) => {
    const body = rawBody as { questions?: Record<string, unknown> };
    const answers: Record<string, unknown> = {};
    for (const id of Object.keys(body.questions ?? {})) {
      answers[id] = buildChoiceAnswer('none');
    }
    return { status: 200, body: { answers, usage: { input_tokens: 100 } } };
  };
}

test.describe('エラーハンドリング（要件 5.5）', () => {
  let server: MockServer;

  test.beforeAll(async () => {
    server = await startMockServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('E2E-ERROR-01: 401 は「キーが無効です」と表示される', async ({ context, extensionId }) => {
    server.setJevHandler(() => ({ status: 401, body: { error: 'invalid api key' } }));
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-invalid', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText('キーが無効です')).toBeVisible({ timeout: 15000 });

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-ERROR-02: 429 は Retry-After を尊重して最大2回リトライし、失敗すれば混雑メッセージになる', async ({
    context,
    extensionId,
  }) => {
    let requestCount = 0;
    server.setJevHandler(() => {
      requestCount++;
      return { status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': '0' } };
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText('混雑しています')).toBeVisible({ timeout: 20000 });
    expect(requestCount).toBe(3); // 初回 + 最大2回リトライ

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-ERROR-03: 529（過負荷）はリトライ後に429と同様の混雑メッセージになる', async ({
    context,
    extensionId,
  }) => {
    let requestCount = 0;
    server.setJevHandler(() => {
      requestCount++;
      return { status: 529, body: { error: 'overloaded' }, headers: { 'Retry-After': '0' } };
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText('混雑しています')).toBeVisible({ timeout: 20000 });
    expect(requestCount).toBe(3); // 初回 + 最大2回リトライ

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-ERROR-05: 11秒応答がない場合はタイムアウトとして「接続できません」系のメッセージになる', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(30_000);
    // クライアント側は 10 秒でタイムアウトする。モック側は 11 秒後に応答することで、
    // ソケットを正常に閉じつつ「クライアントが先にあきらめる」状況を再現する。
    server.setJevHandler(async () => {
      await new Promise((r) => setTimeout(r, 11_000));
      return { status: 200, body: { answers: {} } };
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/タイムアウト|接続できません/)).toBeVisible({ timeout: 20_000 });

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-ERROR-07: 不正な回答が2回続くと「判定結果が不正です」になる（再送は1回のみ）', async ({
    context,
    extensionId,
  }) => {
    let requestCount = 0;
    server.setJevHandler((body) => {
      requestCount++;
      return buildInvalidAnswerHandler()(body);
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText('判定結果が不正です')).toBeVisible({ timeout: 15000 });
    expect(requestCount).toBe(2); // 初回 + 再送1回のみ（再々送はしない）

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-ERROR-08: 不正な回答の後、再送で妥当な回答が返れば正常に完了する', async ({
    context,
    extensionId,
  }) => {
    let requestCount = 0;
    server.setJevHandler((body) => {
      requestCount++;
      if (requestCount === 1) return buildInvalidAnswerHandler()(body);
      return buildAllNoneHandler()(body);
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText(/件入力しました/)).toBeVisible({ timeout: 15000 });
    expect(requestCount).toBe(2);

    await formPage.close();
    await popupPage.close();
  });

  test('E2E-ERROR-A1: 長いRetry-After(20秒)は上限15秒に丸められ、合計30秒以内に終わる（レビュー指摘A-1）', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(45_000);
    let requestCount = 0;
    server.setJevHandler(() => {
      requestCount++;
      // 仕様上のヘッダ値は20秒だが、実装は15秒に丸めて待つはず
      return { status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': '20' } };
    });
    const profile = buildTestProfile();
    await seedStorage(context, extensionId, {
      profiles: [profile],
      settings: buildTestSettings({ apiKey: 'sk-test', baseUrl: server.jevUrl }),
    });

    const { formPage, popupPage } = await openFormAndPopup(context, extensionId, `${server.url}/ec-signup.html`);
    const startedAt = Date.now();
    await clickRunButton(popupPage, 'このページに入力');
    await expect(popupPage.getByText('混雑しています')).toBeVisible({ timeout: 29_000 });
    const elapsedMs = Date.now() - startedAt;

    // 合計所要時間が 30 秒を超えていないこと（丸め込みなしなら 429→20s待ち→429→20s待ち=40s超になるはず）
    expect(elapsedMs).toBeLessThan(30_000);
    // 1回目のリクエスト + 15秒(上限)の待機の後、2回目のリクエストの時点で合計時間が
    // 30秒の上限に達するため、3回目はリトライされない
    expect(requestCount).toBe(2);

    await formPage.close();
    await popupPage.close();
  });
});
