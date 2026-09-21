/**
 * Jev（TypeSafe System One API）の薄い fetch ラッパー。
 * 拡張の service worker でも同じ形で呼ぶ想定なので、SDK ではなく素の fetch を使う。
 *
 * プロバイダは環境変数で切り替える:
 *   TYPESAFE_API_KEY                             → https://api.typesafe.ai/v1/systemone
 *   OPENROUTER_API_KEY                           → https://openrouter.ai/api/v1/systemone
 *   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN → https://api.cloudflare.com/client/v4/accounts/{id}/ai/run
 *   JEV_PROVIDER=typesafe|openrouter|cloudflare で明示も可（省略時は設定されているキーから推定）
 */

export type Provider = 'typesafe' | 'openrouter' | 'cloudflare';

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string | Record<string, unknown>;
  criteria: Record<string, string | Record<string, unknown> | unknown[] | null>;
}
export interface NoulQuestion {
  type: 'noul';
  instructions: string | Record<string, unknown>;
  criteria?: { true?: string; false?: string };
}
export type Question = ChoiceQuestion | NoulQuestion;

export interface JevRequest {
  state: unknown;
  model?: string;
  questions: Record<string, Question>;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface NoulAnswer {
  type: 'noul';
  noul: number;
}
export type Answer = ChoiceAnswer | NoulAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number; cost?: number };
  // OpenRouter 経由のときだけ付く
  id?: string;
  provider?: string;
}

export interface ProviderConfig {
  provider: Provider;
  url: string;
  model: string;
  apiKey: string;
  headers: Record<string, string>;
}

const OPENROUTER_PATHS = ['/api/v1/systemone', '/api/alpha/decisions'];

export function resolveProvider(): ProviderConfig {
  const typesafeKey = process.env.TYPESAFE_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const explicit = process.env.JEV_PROVIDER?.trim() as Provider | undefined;

  const provider: Provider =
    explicit ??
    (typesafeKey ? 'typesafe' : openrouterKey ? 'openrouter' : cfAccount && cfToken ? 'cloudflare' : 'typesafe');

  if (provider === 'typesafe') {
    if (!typesafeKey) throw new Error('TYPESAFE_API_KEY が設定されていません');
    return {
      provider,
      url: 'https://api.typesafe.ai/v1/systemone',
      model: process.env.JEV_MODEL ?? 'jev-latest',
      apiKey: typesafeKey,
      headers: {},
    };
  }
  if (provider === 'cloudflare') {
    if (!cfAccount || !cfToken) throw new Error('CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN が必要です');
    return {
      provider,
      url: `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run`,
      model: process.env.JEV_MODEL ?? 'typesafe/jev',
      apiKey: cfToken,
      headers: {},
    };
  }
  if (!openrouterKey) throw new Error('OPENROUTER_API_KEY が設定されていません');
  const path = process.env.JEV_OPENROUTER_PATH ?? OPENROUTER_PATHS[0];
  return {
    provider,
    url: `https://openrouter.ai${path}`,
    model: process.env.JEV_MODEL ?? 'typesafe/jev-1.13',
    apiKey: openrouterKey,
    headers: {
      'HTTP-Referer': 'https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin',
      'X-Title': 'auto-form-filler-plugin PoC',
    },
  };
}

export interface CallResult {
  response: JevResponse;
  latencyMs: number;
  status: number;
  url: string;
}

export class JevHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    public url: string,
  ) {
    super(`Jev HTTP ${status} (${url}): ${body.slice(0, 500)}`);
  }
}

/** Cloudflare だけ本文が { model, input: {...} } で、レスポンスが { result, success, errors } にラップされる */
function buildBody(cfg: ProviderConfig, req: JevRequest): string {
  if (cfg.provider === 'cloudflare') {
    return JSON.stringify({ model: cfg.model, input: { state: req.state, questions: req.questions } });
  }
  return JSON.stringify({ model: cfg.model, ...req });
}

function parseBody(cfg: ProviderConfig, text: string, url: string, status: number): JevResponse {
  const json = JSON.parse(text);
  if (cfg.provider !== 'cloudflare') return json as JevResponse;
  if (json.success === false) throw new JevHttpError(status, JSON.stringify(json.errors ?? json), url);
  const result = json.result ?? {};
  return { model: result.model ?? cfg.model, answers: result.answers ?? {}, usage: result.usage ?? { input_tokens: 0, output_tokens: 0 } };
}

async function postOnce(cfg: ProviderConfig, url: string, req: JevRequest): Promise<CallResult> {
  const started = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      ...cfg.headers,
    },
    body: buildBody(cfg, req),
  });
  const latencyMs = performance.now() - started;
  const text = await res.text();
  if (!res.ok) throw new JevHttpError(res.status, text, url);
  return { response: parseBody(cfg, text, url, res.status), latencyMs, status: res.status, url };
}

/**
 * 1 リクエスト送信。429/529 は Retry-After を尊重して最大 2 回リトライ。
 * OpenRouter で 404 が返った場合は代替パスを 1 回だけ試す（公式 docs と非公式実装でパスが食い違うため）。
 */
export async function callJev(req: JevRequest, cfg: ProviderConfig = resolveProvider()): Promise<CallResult> {
  let url = cfg.url;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await postOnce(cfg, url, req);
    } catch (e) {
      if (!(e instanceof JevHttpError)) throw e;
      if (e.status === 404 && cfg.provider === 'openrouter') {
        const alt = OPENROUTER_PATHS.find((p) => !url.endsWith(p));
        if (alt && attempt === 0) {
          console.warn(`  ! ${url} が 404。代替パス ${alt} を試します`);
          url = `https://openrouter.ai${alt}`;
          continue;
        }
      }
      if ((e.status === 429 || e.status === 529) && attempt < 2) {
        const wait = 1500 * (attempt + 1);
        console.warn(`  ! HTTP ${e.status}。${wait}ms 待って再試行`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}

/** jev-for-chrome / jev-ultrafast に倣った回答の妥当性チェック。壊れていれば理由を返す */
export function validateChoice(answer: Answer, criteria: Record<string, unknown>): string | null {
  if (answer.type !== 'choice') return `type が choice ではない: ${answer.type}`;
  const keys = Object.keys(criteria);
  if (!keys.includes(answer.choice)) return `choice "${answer.choice}" が選択肢にない`;
  const probs = answer.probabilities ?? {};
  const missing = keys.filter((k) => typeof probs[k] !== 'number');
  if (missing.length) return `probabilities に欠け: ${missing.slice(0, 3).join(',')}`;
  const sum = keys.reduce((s, k) => s + probs[k], 0);
  if (Math.abs(sum - 1) > 0.02) return `probabilities の合計が ${sum.toFixed(3)}`;
  const max = Math.max(...keys.map((k) => probs[k]));
  if (probs[answer.choice] < max - 0.015) return `choice が最大確率でない (${probs[answer.choice]} < ${max})`;
  return null;
}

/** 入力トークン $0.042/M、出力無料（2026-09 時点の公称） */
export function estimateCostUsd(inputTokens: number): number {
  return (inputTokens / 1_000_000) * 0.042;
}
