import { PROFILE_FIELD_KEYS_FOR_JEV } from '../src/shared/profile-fields';
import { createEmptyProfileFields } from '../src/shared/profile-schema';
import type { Profile, ProfileFields, Settings } from '../src/shared/types';
import type { FormFixture } from '../poc/fixtures/forms';
import type { JevHandler } from './mock-server';

/**
 * テスト用プロフィール。
 * 値はあえて poc/fixtures/forms.ts のどの label/placeholder/section 文言とも一致しない、
 * 一意な文字列にしている（E2E-PRINCIPLE-01 でリクエスト本文にプロフィール値が
 * 含まれないことを検証する際、たまたまフィールドの placeholder 例示文言
 * （例:「山田」「太郎」）と一致して誤検知することを避けるため）。
 */
export const TEST_PROFILE_FIELDS: ProfileFields = {
  ...createEmptyProfileFields(),
  family_name: '鈴木',
  given_name: '一郎',
  family_name_kana: 'スズキ',
  given_name_kana: 'イチロウ',
  family_name_romaji: 'SUZUKI',
  given_name_romaji: 'ICHIRO',
  email: 'ichiro.suzuki.e2e@example.test',
  phone: '090-1234-5678',
  postal_code: '100-0001',
  prefecture: '東京都',
  city: '千代田区',
  address_line1: '千代田9-9-9',
  address_line2: 'イーツーイータワー505',
  country: '日本',
  company: 'イーツーイー株式会社',
  department: '検証部',
  birth_date: '1990-01-31',
  gender: 'male',
};

export function buildTestProfile(id = 'profile-e2e-1'): Profile {
  const now = new Date().toISOString();
  return {
    id,
    name: '個人',
    color: '#2563EB',
    fields: TEST_PROFILE_FIELDS,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildTestSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    provider: 'openrouter',
    apiKey: 'test-dummy-key',
    model: undefined,
    baseUrl: undefined,
    lastProfileId: null,
    confidenceThreshold: 0.7,
    highlightFilled: true,
    overwriteFilled: false,
    previewBeforeFill: false,
    debugLogging: false,
    locale: 'ja',
    ...overrides,
  };
}

/**
 * choice に対して妥当な probabilities（全項目キーを含み、合計が 1 に近い）を組み立てる。
 * Jev のレスポンス検証（5.2）を通過させるための最小限のダミーデータ。
 */
export function buildChoiceAnswer(choice: string, confidence = 0.95) {
  const keys = PROFILE_FIELD_KEYS_FOR_JEV;
  const remaining = keys.filter((k) => k !== choice);
  const leftover = 1 - confidence;
  const each = remaining.length > 0 ? leftover / remaining.length : 0;
  const probabilities: Record<string, number> = { [choice]: confidence };
  for (const k of remaining) probabilities[k] = each;
  return { type: 'choice' as const, choice, confidence, probabilities };
}

/**
 * poc の FormFixture の期待値どおりに全問正解するモックレスポンスを返すハンドラを作る。
 *
 * 注: 以前はガードレール Noul（`is_payment`/`is_login`）向けの分岐もここにあったが、
 * 実装（`buildJevRequest`、要件 5.2）はカード欄を観測段階で除外する方針のため、
 * これらの Noul 質問を一切送らない。`questions` に現れることのない到達不能な分岐だった
 * ため削除した（レビュー指摘 A-4）。
 */
export function buildSuccessHandler(form: FormFixture, confidence = 0.95): JevHandler {
  return (rawBody) => {
    const body = rawBody as { questions?: Record<string, unknown> };
    const questionIds = Object.keys(body.questions ?? {});
    const answers: Record<string, unknown> = {};
    for (const id of questionIds) {
      const m = /^f(\d+)$/.exec(id);
      if (m) {
        const index = Number(m[1]);
        const expected = form.fields[index]?.expected ?? 'none';
        answers[id] = buildChoiceAnswer(expected, confidence);
      }
    }
    return {
      status: 200,
      body: {
        model: 'typesafe/jev-1.13',
        answers,
        usage: { input_tokens: 4000, output_tokens: 50 },
      },
    };
  };
}

/**
 * `poc/fixtures/forms.ts`（`FORMS`）に定義のない、テストシナリオ 1 章の追加フィクスチャ
 * （wareki-birth-year / no-match-options / prefilled-ec-signup 等）向けの汎用モックハンドラ。
 * フィールド id（`f0`, `f1`, ...）→ choice のマッピングを直接渡す。マップにない id は `none` を返す。
 */
export function buildFixedAnswerHandler(choiceById: Record<string, string>): JevHandler {
  return (rawBody) => {
    const body = rawBody as { questions?: Record<string, unknown> };
    const questionIds = Object.keys(body.questions ?? {});
    const answers: Record<string, unknown> = {};
    for (const id of questionIds) {
      answers[id] = buildChoiceAnswer(choiceById[id] ?? 'none');
    }
    return {
      status: 200,
      body: {
        model: 'typesafe/jev-1.13',
        answers,
        usage: { input_tokens: 4000, output_tokens: 50 },
      },
    };
  };
}
