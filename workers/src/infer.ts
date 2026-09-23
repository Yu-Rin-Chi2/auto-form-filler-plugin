/**
 * Jev の呼び出しと回答検証（要件 5.2: 不正なら 1 回だけ再送、再度不正ならエラー）。
 * Workers のランタイムに依存しないので、ルートの vitest からそのままテストできる。
 */
import { validateResponse } from './validate-response';
import type { JevResponse } from './validate-response';
import type { JevRequest } from './build-request';

export interface AiRunner {
  run(model: string, inputs: JevRequest): Promise<unknown>;
}

export class UpstreamError extends Error {}
export class InvalidResponseError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Workers AI は third-party モデルの応答を { state, result, gatewayMetadata } に包んで返す */
export function unwrapAiResult(raw: unknown): JevResponse {
  const inner = isPlainObject(raw) && isPlainObject(raw.result) ? raw.result : raw;
  return inner as JevResponse;
}

export async function runInference(
  ai: AiRunner,
  model: string,
  request: JevRequest,
  fieldIds: string[],
  criteriaKeys: string[],
): Promise<JevResponse> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: JevResponse;
    try {
      response = unwrapAiResult(await ai.run(model, request));
    } catch (e) {
      throw new UpstreamError(String(e));
    }
    if (validateResponse(response, fieldIds, criteriaKeys).valid) return response;
  }
  throw new InvalidResponseError('判定結果が不正です');
}
