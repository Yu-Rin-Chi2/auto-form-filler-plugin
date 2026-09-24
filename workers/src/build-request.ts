/**
 * Jev リクエスト組み立て（要件 5.2）。`poc/build-request.ts` の `keyed` バリアントに準拠。純粋関数。
 *
 * 重要な設計上の保証: この関数は `ProfileFields`（プロフィールの実値）を一切受け取らない。
 * 送るのは項目の「説明文」（`PROFILE_FIELD_DESCRIPTIONS`）とフィールドのメタデータのみで、
 * 値を送りたくても構造的に送れない（要件 P1）。
 */
import { PROFILE_FIELD_DESCRIPTIONS } from './profile-fields';
import type { JevFields, JevPageInfo } from './types';

/** 拡張側の `src/shared/constants.ts` と同じ値。Worker 側でも上限として強制する */
export const MAX_FIELDS = 60;

/** クエリ・フラグメントを除いた origin + pathname（拡張側 `src/shared/url.ts` と同じ規則） */
export function normalizePageUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return rawUrl.split('?')[0]?.split('#')[0] ?? rawUrl;
  }
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, null>;
}

export interface JevRequestState {
  page: JevPageInfo;
  fields: JevFields;
  profile: Record<string, string>;
}

export interface JevRequest {
  state: JevRequestState;
  questions: Record<string, ChoiceQuestion>;
}

export interface BuildRequestResult {
  /** 対象フィールドが 0 件の場合は null（呼び出し元は Jev を呼ばない） */
  request: JevRequest | null;
  fieldIds: string[];
  overLimitCount: number;
}

/**
 * 「本人の情報ではない」だけを条件にすると、会社名（法人名・貴社名）を個人情報ではないとみなして
 * `none` に確率が流れる。利用者は会社の担当者としてフォームを埋めることも多いため、
 * 所属・代表する会社と、担当者としての本人の氏名は本人の情報に含むと明示する
 */
const NONE_RULE =
  "Pick `none` if no entry fits, if the field asks for free-form text, a preference, a date of an event, " +
  'a consent checkbox, or information about someone other than the user (a referrer, a family member, ' +
  "an emergency contact, a business partner). The user's own information includes the company or organization " +
  'they belong to or represent (法人名・貴社名・御社名), and their own name when they fill in the form as the ' +
  'contact person (ご担当者名).';

function buildNullCriteria(descriptions: Record<string, string>): Record<string, null> {
  return Object.fromEntries(Object.keys(descriptions).map((k) => [k, null]));
}

/**
 * @param profileDescriptions Jev に提示する項目説明（固定項目 + ユーザー定義項目）。省略時は固定項目のみ
 */
export function buildJevRequest(
  page: JevPageInfo,
  fields: JevFields,
  profileDescriptions: Record<string, string> = PROFILE_FIELD_DESCRIPTIONS,
): BuildRequestResult {
  const allIds = Object.keys(fields);
  const fieldIds = allIds.slice(0, MAX_FIELDS);
  const overLimitCount = Math.max(0, allIds.length - MAX_FIELDS);

  if (fieldIds.length === 0) {
    return { request: null, fieldIds: [], overLimitCount };
  }

  const includedFields: JevFields = {};
  for (const id of fieldIds) {
    const f = fields[id];
    if (f) includedFields[id] = f;
  }

  const questions: Record<string, ChoiceQuestion> = {};
  for (const id of fieldIds) {
    questions[id] = {
      type: 'choice',
      instructions: `Which profile entry should be typed or selected into \`fields.${id}\`? ${NONE_RULE} Entry meanings are in \`profile\`.`,
      criteria: buildNullCriteria(profileDescriptions),
    };
  }

  return {
    request: {
      state: {
        page: { ...page, url: normalizePageUrl(page.url) },
        fields: includedFields,
        profile: profileDescriptions,
      },
      questions,
    },
    fieldIds,
    overLimitCount,
  };
}
