/**
 * レビュー指摘 A-1 の検証:
 *  - 429/529 の Retry-After は上限 15 秒に丸められる
 *  - 待機中に `chrome.runtime.getPlatformInfo()`（keepalive）が呼ばれる
 *  - リトライ込みの合計所要時間が 30 秒を超える場合はリトライせずエラーになる
 *
 * fetch / chrome.* をスタブし、vitest の fake timers（Date・performance も含む）で
 * 実時間を進めずに検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callJev } from '../../src/background/jev/client';
import type { ProviderConfig } from '../../src/background/jev/client';
import { JevError } from '../../src/shared/types';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** fake timers 経由で delayMs だけ「時間がかかってから」応答する fetch モック */
function delayedResponse(delayMs: number, response: Response): Promise<Response> {
  return new Promise((resolve) => setTimeout(() => resolve(response), delayMs));
}

const CFG: ProviderConfig = {
  provider: 'typesafe',
  url: 'https://api.typesafe.ai/v1/systemone',
  model: 'jev-latest',
  apiKey: 'sk-test',
  headers: {},
};

const REQUEST = { state: {}, questions: {} };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('callJev: リトライ待機中の keepalive・上限（レビュー指摘 A-1）', () => {
  it('Retry-After が上限(15秒)を超えていても、次のリクエストは20秒待たず15秒後に送られる', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) return jsonResponse(429, { error: 'rate limited' }, { 'Retry-After': '20' });
      return jsonResponse(200, { answers: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    const getPlatformInfo = vi.fn().mockResolvedValue({});
    vi.stubGlobal('chrome', { runtime: { getPlatformInfo } });

    const promise = callJev(REQUEST, CFG);

    // 15 秒（上限）進めれば 2 回目のリクエストが送られているはず
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result.response).toEqual({ answers: {} });
  });

  it('待機の途中で chrome.runtime.getPlatformInfo が呼ばれる（SW keepalive）', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) return jsonResponse(429, { error: 'rate limited' }, { 'Retry-After': '20' });
      return jsonResponse(200, { answers: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    const getPlatformInfo = vi.fn().mockResolvedValue({});
    vi.stubGlobal('chrome', { runtime: { getPlatformInfo } });

    const promise = callJev(REQUEST, CFG);

    // 待機(15秒に丸められる)の完了前でも、chunk（10秒間隔）を過ぎた時点で keepalive が入る
    await vi.advanceTimersByTimeAsync(11_000);
    expect(getPlatformInfo).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4_000);
    await promise;
  });

  it('リトライ込みの合計所要時間が30秒を超える場合はリトライせずエラーになる', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      // 1回目・2回目とも、応答自体に 2 秒かかった上で 429 + Retry-After 20秒（15秒に丸められる）を返す
      return delayedResponse(2_000, jsonResponse(429, { error: 'rate limited' }, { 'Retry-After': '20' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', { runtime: { getPlatformInfo: vi.fn().mockResolvedValue({}) } });

    const promise = callJev(REQUEST, CFG);
    // 万一 reject した際に unhandledRejection にならないよう先に catch しておく
    const assertion = expect(promise).rejects.toBeInstanceOf(JevError);

    // 1回目の fetch(2s) + 1回目の待機(15sに丸め) + 2回目の fetch(2s) = 19s
    // ここまでは合計 19s + 次の待機候補 15s = 34s > 30s の上限に達するため、
    // 2回目のリトライは行われず、3回目の fetch は発生しないはず
    await vi.advanceTimersByTimeAsync(2_000); // 1回目 fetch 完了
    await vi.advanceTimersByTimeAsync(15_000); // 1回目の待機（上限15秒）
    await vi.advanceTimersByTimeAsync(2_000); // 2回目 fetch 完了 → ここで合計時間の上限判定

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
