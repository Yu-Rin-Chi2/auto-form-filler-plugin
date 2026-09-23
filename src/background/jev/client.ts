/**
 * Jev プロキシ Worker（`workers/`）への薄い fetch ラッパー。
 * API キーは Worker 側が持つため、拡張は資格情報を一切送らない。
 * SDK は使わず素の fetch のみを使う。
 *
 * Jev への指示文・選択肢の組み立てと回答の検証は Worker 側の責務（`workers/src/`）。
 * 拡張が送るのはフォーム項目の「見た目」の情報だけで、
 * **プロフィールの値を入れる場所が型の上に存在しない**（要件 P1）。
 */
import { resolveInferUrl } from '../../shared/config';
import { JevError } from '../../shared/types';
import type { CustomField, ExtractedFields, JevAnswers, PageInfo } from '../../shared/types';

/** ユーザー定義項目のうち Jev に提示してよい部分。`value` は持たない */
export interface CustomFieldPayload {
  id: string;
  label: string;
  description?: string;
}

export interface InferRequest {
  page: PageInfo;
  fields: ExtractedFields;
  customFields: CustomFieldPayload[];
}

/**
 * `CustomField` から Jev 提示用の情報だけを取り出す。
 * 明示的に id / label / description のみを写すため、`value` は構造的に混入しない（要件 P1）。
 * label が空の項目は Jev に提示できないので落とす。
 */
export function toCustomFieldPayload(customFields: CustomField[]): CustomFieldPayload[] {
  return customFields
    .filter((f) => f.label.trim().length > 0)
    .map((f) => ({ id: f.id, label: f.label, description: f.description || undefined }));
}

export interface CallResult {
  response: JevAnswers;
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
 * ネットワーク不通・タイムアウト・混雑はそれぞれ分類した JevError を投げる（要件 5.5）。
 */
export async function callJev(
  request: InferRequest,
  workerEndpoint?: string,
  options: CallOptions = {},
): Promise<CallResult> {
  const url = resolveInferUrl(workerEndpoint);
  const body = JSON.stringify(request);
  if (options.debugLogging) {
    // eslint-disable-next-line no-console
    console.log('[auto-form-filler] Jev request', body);
  }

  let attempt = 0;
  const overallStart = performance.now();
  for (;;) {
    const started = performance.now();
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      TIMEOUT_MS,
    );
    const latencyMs = performance.now() - started;

    if (res.ok) {
      const json = (await res.json()) as JevAnswers;
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

    if (res.status === 429 || res.status === 529) {
      throw new JevError('rate_limited', '混雑しています。少し待って再試行してください');
    }
    // Worker は再送しても回答が不正だった場合に invalid_response を返す（要件 5.2）
    if (await isInvalidResponseError(res)) {
      throw new JevError('invalid_response', '判定結果が不正です');
    }
    throw new JevError('unknown', `Jev API エラー (HTTP ${res.status})`);
  }
}

async function isInvalidResponseError(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error === 'invalid_response';
  } catch {
    return false;
  }
}

