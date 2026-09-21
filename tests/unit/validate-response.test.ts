import { describe, expect, it, vi, afterEach } from 'vitest';
import { validateAnswer, validateResponse } from '../../src/background/jev/validate-response';
import { callJevWithValidation } from '../../src/background/jev/client';
import type { ProviderConfig } from '../../src/background/jev/client';
import { JevError } from '../../src/shared/types';

const CRITERIA_KEYS = ['family_name', 'given_name', 'none'];

function validProbabilities(choice: string): Record<string, number> {
  const rest = CRITERIA_KEYS.filter((k) => k !== choice);
  const probs: Record<string, number> = { [choice]: 0.9 };
  rest.forEach((k, i) => {
    probs[k] = i === 0 ? 0.06 : 0.04;
  });
  return probs;
}

describe('validateAnswer（要件 5.2 / UNIT-RES-01〜05）', () => {
  it('UNIT-RES-01: 正常な回答は妥当と判定', () => {
    const answer = { choice: 'family_name', confidence: 0.9, probabilities: validProbabilities('family_name') };
    expect(validateAnswer(answer, CRITERIA_KEYS)).toBeNull();
  });

  it('UNIT-RES-02: choice が選択肢にない場合は不正', () => {
    const answer = { choice: 'unknown_key', confidence: 0.9, probabilities: validProbabilities('family_name') };
    expect(validateAnswer(answer, CRITERIA_KEYS)).not.toBeNull();
  });

  it('UNIT-RES-03: probabilities の合計が許容範囲外なら不正', () => {
    const probs = validProbabilities('family_name');
    probs.family_name = (probs.family_name ?? 0) + 0.1; // 合計を 1.05 程度にずらす
    const answer = { choice: 'family_name', confidence: 0.9, probabilities: probs };
    expect(validateAnswer(answer, CRITERIA_KEYS)).not.toBeNull();
  });

  it('UNIT-RES-04: probabilities の合計が許容範囲内(±0.02)なら妥当', () => {
    const probs = validProbabilities('family_name');
    probs.family_name = (probs.family_name ?? 0) + 0.02; // 合計 1.02
    const answer = { choice: 'family_name', confidence: 0.9, probabilities: probs };
    expect(validateAnswer(answer, CRITERIA_KEYS)).toBeNull();
  });

  it('UNIT-RES-05: choice が最大確率でなければ不正', () => {
    const answer = {
      choice: 'family_name',
      confidence: 0.4,
      probabilities: { family_name: 0.2, given_name: 0.7, none: 0.1 },
    };
    expect(validateAnswer(answer, CRITERIA_KEYS)).not.toBeNull();
  });
});

describe('validateResponse', () => {
  it('対象フィールド全件が妥当なら valid=true', () => {
    const response = {
      answers: {
        f0: { choice: 'family_name', confidence: 0.9, probabilities: validProbabilities('family_name') },
        f1: { choice: 'none', confidence: 0.95, probabilities: validProbabilities('none') },
      },
    };
    const result = validateResponse(response, ['f0', 'f1'], CRITERIA_KEYS);
    expect(result.valid).toBe(true);
    expect(result.invalidFieldIds).toEqual([]);
  });
});

describe('callJevWithValidation: 再送ロジック（UNIT-RES-06/07）', () => {
  const cfg: ProviderConfig = {
    provider: 'openrouter',
    url: 'https://openrouter.ai/api/v1/systemone',
    model: 'typesafe/jev-1.13',
    apiKey: 'test-key',
    headers: {},
  };
  const request = { state: {}, questions: {} };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('UNIT-RES-06: 1回目が不正なら 1 回だけ再送し、成功すれば合計 2 回のリクエスト', async () => {
    let callCount = 0;
    const invalidBody = JSON.stringify({ answers: { f0: { choice: 'unknown_key', confidence: 0.9, probabilities: {} } } });
    const validBody = JSON.stringify({
      answers: { f0: { choice: 'family_name', confidence: 0.9, probabilities: validProbabilities('family_name') } },
    });
    const fetchMock = vi.fn(async () => {
      callCount++;
      const body = callCount === 1 ? invalidBody : validBody;
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callJevWithValidation(request, cfg, ['f0'], CRITERIA_KEYS);
    expect(callCount).toBe(2);
    expect(result.response.answers.f0?.choice).toBe('family_name');
  });

  it('UNIT-RES-07: 再送しても不正なら invalid_response エラーになり、それ以上再送しない', async () => {
    let callCount = 0;
    const invalidBody = JSON.stringify({ answers: { f0: { choice: 'unknown_key', confidence: 0.9, probabilities: {} } } });
    const fetchMock = vi.fn(async () => {
      callCount++;
      return new Response(invalidBody, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(callJevWithValidation(request, cfg, ['f0'], CRITERIA_KEYS)).rejects.toMatchObject({
      kind: 'invalid_response',
    } satisfies Partial<JevError>);
    expect(callCount).toBe(2);
  });
});
