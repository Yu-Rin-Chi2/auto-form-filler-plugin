/**
 * Jev レスポンス検証（要件 5.2）。純粋関数のみ。`poc/jev-client.ts` の `validateChoice` を移植。
 */

export interface ChoiceAnswer {
  type?: string;
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevResponse {
  model?: string;
  answers: Record<string, ChoiceAnswer | undefined>;
  usage?: { input_tokens: number; output_tokens: number };
}

const PROBABILITY_SUM_TOLERANCE = 0.02;
const MAX_PROBABILITY_TOLERANCE = 0.015;
/** 浮動小数点誤差の吸収用（例: 0.92+0.06+0.04 は 1.02 ちょうどにならないことがある） */
const FLOAT_EPSILON = 1e-9;

/** 1 件の回答を検証する。不正なら理由文字列、正常なら null */
export function validateAnswer(answer: ChoiceAnswer | undefined, criteriaKeys: string[]): string | null {
  if (!answer) return '回答がありません';
  if (!criteriaKeys.includes(answer.choice)) return `choice "${answer.choice}" が選択肢にない`;
  const probs = answer.probabilities ?? {};
  const missing = criteriaKeys.filter((k) => typeof probs[k] !== 'number');
  if (missing.length > 0) return `probabilities に欠けがあります: ${missing.slice(0, 3).join(',')}`;
  const sum = criteriaKeys.reduce((s, k) => s + (probs[k] ?? 0), 0);
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE + FLOAT_EPSILON) return `probabilities の合計が ${sum.toFixed(3)}`;
  const max = Math.max(...criteriaKeys.map((k) => probs[k] ?? 0));
  const chosenProb = probs[answer.choice] ?? 0;
  if (chosenProb < max - MAX_PROBABILITY_TOLERANCE - FLOAT_EPSILON) return 'choice が最大確率でない';
  return null;
}

export interface ValidationSummary {
  valid: boolean;
  invalidFieldIds: string[];
}

/** レスポンス全体を検証する。対象フィールド ID 全件について回答が妥当かを確認する */
export function validateResponse(
  response: JevResponse,
  fieldIds: string[],
  criteriaKeys: string[],
): ValidationSummary {
  const invalidFieldIds = fieldIds.filter((id) => validateAnswer(response.answers[id], criteriaKeys) !== null);
  return { valid: invalidFieldIds.length === 0, invalidFieldIds };
}
