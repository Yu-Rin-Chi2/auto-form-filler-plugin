/**
 * auto-form-filler-plugin のフォーム入力判定 API。
 *
 * 拡張からはフォーム項目の「見た目」の情報だけを受け取り、Jev への指示文と選択肢は
 * **この Worker が組み立てる**。呼び出し側に判定内容を決めさせないことで、
 * フォーム入力以外の用途に転用できないようにしている。
 *
 * API キーは Workers AI バインディングが担うため、この Worker は資格情報を持たない。
 */
import { buildJevRequest, MAX_FIELDS } from './build-request';
import { InvalidResponseError, runInference, UpstreamError } from './infer';
import type { AiRunner } from './infer';
import { buildProfileDescriptions } from './profile-fields';
import { sanitizeCustomFields, sanitizeFields, sanitizePage } from './sanitize';

interface Env {
  /** Workers AI バインディング。型は typesafe/jev（third-party モデル）を含まないため最小定義にしている */
  AI: AiRunner;
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const MODEL = 'typesafe/jev';
const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_RETRY_AFTER_SECONDS = '60';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...headers },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function handleInfer(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': RATE_LIMIT_RETRY_AFTER_SECONDS });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!isPlainObject(payload)) return json({ error: 'invalid_body' }, 400);

  const fields = sanitizeFields(payload.fields);
  if (!fields) return json({ error: 'invalid_body', detail: 'fields' }, 400);
  if (Object.keys(fields).length > MAX_FIELDS) {
    return json({ error: 'too_many_fields', limit: MAX_FIELDS }, 400);
  }

  const page = sanitizePage(payload.page);
  const customFields = sanitizeCustomFields(payload.customFields);

  // 指示文と選択肢はここで作る。呼び出し側は一切関与できない
  const profileDescriptions = buildProfileDescriptions(customFields);
  const built = buildJevRequest(page, fields, profileDescriptions);
  if (!built.request) return json({ error: 'invalid_body', detail: 'fields' }, 400);
  const criteriaKeys = Object.keys(profileDescriptions);

  try {
    // リクエスト本文はログに出さない。拡張は項目名と説明のみを送る設計だが、
    // 中継点でそれを記録しないことが利用者への約束になっている（PRIVACY.md）
    const response = await runInference(env.AI, MODEL, built.request, built.fieldIds, criteriaKeys);
    return json({ model: response.model, answers: response.answers, usage: response.usage });
  } catch (e) {
    if (e instanceof InvalidResponseError) return json({ error: 'invalid_response' }, 502);
    if (e instanceof UpstreamError) console.error(`AI.run failed: ${e.message}`);
    return json({ error: 'upstream_error' }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === '/health') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      return json({ ok: true });
    }

    if (pathname !== '/v1/infer') return json({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    return handleInfer(request, env);
  },
} satisfies ExportedHandler<Env>;
