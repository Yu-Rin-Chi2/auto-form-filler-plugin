/**
 * Jev（TypeSafe System One API）の薄い fetch ラッパー。`poc/jev-client.ts` を移植し、
 * プロバイダ設定を環境変数でなく Settings から解決するように変更した。
 * SDK は使わず素の fetch のみを使う。
 */
import { JevError } from '../../shared/types';
import type { JevProvider, Settings } from '../../shared/types';
import { validateResponse } from './validate-response';
import type { JevResponse } from './validate-response';

export interface ProviderConfig {
  provider: JevProvider;
  url: string;
  model: string;
  apiKey: string;
  headers: Record<string, string>;
}

const DEFAULT_URLS: Record<JevProvider, string> = {
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/v1/systemone',
};
const DEFAULT_MODELS: Record<JevProvider, string> = {
  typesafe: 'jev-latest',
  openrouter: 'typesafe/jev-1.13',
};

/** 設定タブの「詳細設定」でモデル名・baseUrl を上書きできる（要件 02-nonfunctional 3.1） */
export function resolveProviderConfig(
  settings: Pick<Settings, 'provider' | 'apiKey' | 'model' | 'baseUrl'>,
): ProviderConfig {
  const provider = settings.provider;
  const url = settings.baseUrl?.trim() || DEFAULT_URLS[provider];
  const model = settings.model?.trim() || DEFAULT_MODELS[provider];
  const headers: Record<string, string> =
    provider === 'openrouter'
      ? {
          'HTTP-Referer': 'https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin',
          'X-Title': 'auto-form-filler-plugin',
        }
      : {};
  return { provider, url, model, apiKey: settings.apiKey, headers };
}

export interface JevRequestLike {
  model?: string;
  state: unknown;
  questions: Record<string, unknown>;
}

export interface CallResult {
  response: JevResponse;
  latencyMs: number;
}

const TIMEOUT_MS = 10_000;
const MAX_HTTP_RETRIES = 2;
const DEFAULT_RETRY_WAIT_MS = 1500;
/** Retry-After の尊重は上限 15 秒まで（レビュー指摘 A-1） */
const MAX_RETRY_WAIT_MS = 15_000;
/** リトライ込みの合計所要時間の上限。超える場合はリトライせずエラーにする（レビュー指摘 A-1） */
const MAX_TOTAL_DURATION_MS = 30_000;
/**
 * 待機中に SW がアイドル終了しないよう、このおおよその間隔で軽い chrome.* API を呼ぶ。
 * 仕様上の目安（15〜20 秒ごと）より短めの 10 秒にして、MAX_RETRY_WAIT_MS（15 秒）で
 * 上限に丸められた待機の途中でも少なくとも 1 回は keepalive 呼び出しが挟まるようにする。
 */
const KEEPALIVE_INTERVAL_MS = 10_000;

/**
 * 429/529 の待機中は fetch も他の chrome.* 呼び出しも行わないため、MV3 の service worker が
 * アイドル終了しうる（レビュー指摘 A-1）。待機を短いチャンクに分割し、チャンクの合間に
 * `chrome.runtime.getPlatformInfo()` という副作用のない軽い API 呼び出しを挟むことで
 * service worker を生かし続ける。`chrome` が存在しない環境（vitest 等）では参照自体が
 * ReferenceError になりうるため `typeof` で先にガードしてから呼び出す。
 */
async function waitWithKeepalive(waitMs: number): Promise<void> {
  let remaining = waitMs;
  while (remaining > 0) {
    const chunk = Math.min(remaining, KEEPALIVE_INTERVAL_MS);
    await new Promise((r) => setTimeout(r, chunk));
    remaining -= chunk;
    if (remaining <= 0) break;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) {
        await chrome.runtime.getPlatformInfo();
      }
    } catch {
      // chrome.* が使えない環境（テスト等）やエラーは無視して待機を継続する
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new JevError('timeout', 'Jev への接続がタイムアウトしました');
    }
    throw new JevError('network', 'Jev に接続できません');
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfterMs(res: Response): number {
  const header = res.headers.get('Retry-After');
  if (!header) return DEFAULT_RETRY_WAIT_MS;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return DEFAULT_RETRY_WAIT_MS;
}

export interface CallOptions {
  /** true の場合のみ送信内容をコンソールに出力する（要件 02-nonfunctional 1.1） */
  debugLogging?: boolean;
}

/**
 * 1 リクエスト送信。429/529 は Retry-After を尊重して最大 2 回リトライする（要件 5.2 / 02 3.1）。
 * キー未設定・401・ネットワーク不通・タイムアウトはそれぞれ分類した JevError を投げる（要件 5.5）。
 */
export async function callJev(
  request: JevRequestLike,
  cfg: ProviderConfig,
  options: CallOptions = {},
): Promise<CallResult> {
  if (!cfg.apiKey) {
    throw new JevError('no_api_key', 'API キーが設定されていません');
  }
  const body = JSON.stringify({ model: cfg.model, ...request });
  if (options.debugLogging) {
    // eslint-disable-next-line no-console
    console.log('[auto-form-filler] Jev request', body);
  }

  let attempt = 0;
  const overallStart = performance.now();
  for (;;) {
    const started = performance.now();
    const res = await fetchWithTimeout(
      cfg.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
          ...cfg.headers,
        },
        body,
      },
      TIMEOUT_MS,
    );
    const latencyMs = performance.now() - started;

    if (res.ok) {
      const json = (await res.json()) as JevResponse;
      return { response: json, latencyMs };
    }

    if ((res.status === 429 || res.status === 529) && attempt < MAX_HTTP_RETRIES) {
      const wait = Math.min(parseRetryAfterMs(res), MAX_RETRY_WAIT_MS);
      const elapsedSoFar = performance.now() - overallStart;
      // リトライ込みの合計所要時間が 30 秒を超えるなら、これ以上待たずに諦める（A-1）
      if (elapsedSoFar + wait > MAX_TOTAL_DURATION_MS) {
        throw new JevError('rate_limited', '混雑しています。少し待って再試行してください');
      }
      await waitWithKeepalive(wait);
      attempt++;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new JevError('invalid_key', 'API キーが無効です');
    }
    if (res.status === 429 || res.status === 529) {
      throw new JevError('rate_limited', '混雑しています。少し待って再試行してください');
    }
    throw new JevError('unknown', `Jev API エラー (HTTP ${res.status})`);
  }
}

/**
 * フィールド判定用の呼び出し。回答が不正なら 1 回だけ再送し、再度不正なら invalid_response エラー
 * （要件 5.2: 「不正なら 1 回だけ再送、再度不正ならエラー」）。
 */
export async function callJevWithValidation(
  request: JevRequestLike,
  cfg: ProviderConfig,
  fieldIds: string[],
  criteriaKeys: string[],
  options: CallOptions = {},
): Promise<CallResult> {
  let result = await callJev(request, cfg, options);
  let check = validateResponse(result.response, fieldIds, criteriaKeys);
  if (!check.valid) {
    result = await callJev(request, cfg, options);
    check = validateResponse(result.response, fieldIds, criteriaKeys);
    if (!check.valid) {
      throw new JevError('invalid_response', '判定結果が不正です');
    }
  }
  return result;
}

function buildPingRequest(): JevRequestLike {
  return {
    state: { ping: true },
    questions: {
      ping: {
        type: 'noul',
        instructions: 'Reply with a noul answer of 1 to confirm connectivity. This is a connection test, not real data.',
      },
    },
  };
}

/** API 設定タブの「接続テスト」用。最小のリクエストを 1 回送るだけ */
export async function testConnection(cfg: ProviderConfig, options: CallOptions = {}): Promise<{ latencyMs: number }> {
  const { latencyMs } = await callJev(buildPingRequest(), cfg, options);
  return { latencyMs };
}
