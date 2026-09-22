/**
 * Jev リクエスト組み立て（要件 5.2）。`poc/build-request.ts` の `keyed` バリアントに準拠。純粋関数。
 *
 * 重要な設計上の保証: この関数は `ProfileFields`（プロフィールの実値）を一切受け取らない。
 * 送るのは項目の「説明文」（`PROFILE_FIELD_DESCRIPTIONS`）とフィールドのメタデータのみで、
 * 値を送りたくても構造的に送れない（要件 P1）。
 */
import { MAX_FIELDS } from '../../shared/constants';
import { PROFILE_FIELD_DESCRIPTIONS } from '../../shared/profile-fields';
import type { ExtractedFields, PageInfo } from '../../shared/types';
import { normalizePageUrl } from '../../shared/url';

export { normalizePageUrl, MAX_FIELDS };

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, null>;
}

export interface JevRequestState {
  page: PageInfo;
  fields: ExtractedFields;
  profile: Record<string, string>;
}

export interface JevRequest {
  model?: string;
  state: JevRequestState;
  questions: Record<string, ChoiceQuestion>;
}

export interface BuildRequestResult {
  /** 対象フィールドが 0 件の場合は null（呼び出し元は Jev を呼ばない） */
  request: JevRequest | null;
  fieldIds: string[];
  overLimitCount: number;
}

const NONE_RULE =
  "Pick `none` if no entry fits, if the field asks for free-form text, a preference, a date of an event, " +
  "a consent checkbox, or anything that is not the user's own personal information.";

function buildNullCriteria(descriptions: Record<string, string>): Record<string, null> {
  return Object.fromEntries(Object.keys(descriptions).map((k) => [k, null]));
}

/**
 * @param profileDescriptions Jev に提示する項目説明（固定項目 + ユーザー定義項目）。省略時は固定項目のみ
 */
export function buildJevRequest(
  page: PageInfo,
  fields: ExtractedFields,
  model?: string,
  profileDescriptions: Record<string, string> = PROFILE_FIELD_DESCRIPTIONS,
): BuildRequestResult {
  const allIds = Object.keys(fields);
  const fieldIds = allIds.slice(0, MAX_FIELDS);
  const overLimitCount = Math.max(0, allIds.length - MAX_FIELDS);

  if (fieldIds.length === 0) {
    return { request: null, fieldIds: [], overLimitCount };
  }

  const includedFields: ExtractedFields = {};
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
      model,
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
