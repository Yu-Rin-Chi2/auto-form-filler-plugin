/**
 * 値の解決（要件 5.3）。Jev の回答（choice/confidence）とプロフィールから、
 * 各フィールドに入れる値（または入れない理由）を決定する。純粋関数のみ。DOM・storage に依存させない。
 */
import { katakanaToHiragana, shouldConvertToHiragana } from '../../shared/kana';
import {
  isSnsFieldKey,
  parseBirthDate,
  resolveProfileFieldValue,
  snsProfileUrl,
  splitForFieldCount,
  wantsUrl,
} from '../../shared/derive';
import { isCustomFieldKey } from '../../shared/types';
import type {
  CustomField,
  ExtractedField,
  ExtractedFields,
  FieldOutcome,
  FieldOutcomeReason,
  FillAssignment,
  ProfileFieldKey,
  ProfileFields,
} from '../../shared/types';
import {
  matchAccountType,
  matchCountry,
  matchGender,
  matchMonthOrDay,
  matchOption,
  matchPrefecture,
  matchYear,
  shouldStripHyphens,
} from './normalize';
import { buildAddressValue, planAddressRanges } from './address';

export interface AnswerLike {
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface ResolveSettings {
  confidenceThreshold: number;
  overwriteFilled: boolean;
}

export interface ResolveInput {
  fields: ExtractedFields;
  answers: Record<string, AnswerLike | undefined>;
  profileFields: ProfileFields;
  /** ユーザー定義項目（値の解決と、詳細表示用の表示名に使う） */
  customFields?: CustomField[];
  settings: ResolveSettings;
  /** age 計算などの基準時刻（テスト用に注入可能） */
  now?: Date;
}

export interface ResolveOutput {
  assignments: Record<string, FillAssignment>;
  outcomes: FieldOutcome[];
}

/** DOM 順で連続する場合に分割対象となる項目（要件 5.3 手順4） */
const SPLIT_GROUP_KEYS = new Set<string>(['phone', 'postal_code']);
const KANA_CHOICE_KEYS = new Set<string>([
  'family_name_kana',
  'given_name_kana',
  'full_name_kana',
  'account_holder_kana',
  'prefecture_kana',
  'city_kana',
  'address_line1_kana',
  'address_line2_kana',
  'address_kana_full',
]);

/** 保存値がハイフン区切りになっている項目。フォームが嫌がる場合は取り除く */
const HYPHENATED_CHOICE_KEYS = new Set<string>(['phone', 'postal_code']);

interface Decision {
  id: string;
  field: ExtractedField;
  choice?: ProfileFieldKey;
  confidence?: number;
  probabilities?: Record<string, number>;
  /** この時点でスキップが確定している理由（未確定なら undefined） */
  gatedReason?: FieldOutcomeReason;
}

function outcome(d: Decision, reason: FieldOutcomeReason, customLabels?: Record<string, string>): FieldOutcome {
  const choiceLabel = d.choice && isCustomFieldKey(d.choice) ? customLabels?.[d.choice] : undefined;
  return {
    fieldId: d.id,
    label: d.field.label,
    choice: d.choice,
    ...(choiceLabel ? { choiceLabel } : {}),
    confidence: d.confidence,
    reason,
  };
}

function isCheckbox(field: ExtractedField): boolean {
  return field.tag === 'input' && field.type === 'checkbox';
}

function isSelectOrRadio(field: ExtractedField): 'select' | 'radio' | null {
  if (field.tag === 'select') return 'select';
  if (field.tag === 'input' && field.type === 'radio') return 'radio';
  return null;
}

function matchForChoice(
  choiceKey: ProfileFieldKey,
  rawValue: string,
  options: string[],
  profileFields: ProfileFields,
): string | null {
  switch (choiceKey) {
    case 'prefecture':
      return matchPrefecture(rawValue, options);
    case 'birth_year':
      return matchYear(rawValue, options);
    case 'birth_month':
    case 'birth_day':
      return matchMonthOrDay(rawValue, options);
    case 'gender':
      return matchGender(profileFields.gender, options);
    case 'account_type':
      return matchAccountType(profileFields.account_type, options);
    case 'country':
      return matchCountry(rawValue, options);
    default:
      return matchOption(rawValue, options);
  }
}

/** input[type=month] へは YYYY-MM、input[type=date] へは YYYY-MM-DD（要件 5.3 手順6） */
function formatForFieldType(
  rawValue: string,
  choiceKey: ProfileFieldKey,
  field: ExtractedField,
  profileFields: ProfileFields,
): string {
  if (choiceKey === 'birth_date' && field.type === 'month') {
    const parts = parseBirthDate(profileFields.birth_date);
    if (!parts) return '';
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  }
  // SNS: URL を求める欄にはプロフィール URL、それ以外は保存値（ID）をそのまま
  if (isSnsFieldKey(choiceKey) && wantsUrl(field)) {
    return snsProfileUrl(choiceKey, rawValue);
  }
  return rawValue;
}

function buildDecision(
  id: string,
  field: ExtractedField,
  answer: AnswerLike | undefined,
  threshold: number,
): Decision {
  if (!answer) {
    return { id, field, gatedReason: 'skipped_invalid_response' };
  }
  const choice = answer.choice as ProfileFieldKey;
  if (isCheckbox(field)) {
    // checkbox は MVP では入力対象外（要件 5.4）。Jev の回答に関わらず常に対応なし扱い
    return { id, field, choice, confidence: answer.confidence, gatedReason: 'no_match' };
  }
  if (choice === 'none') {
    return { id, field, choice, confidence: answer.confidence, gatedReason: 'no_match' };
  }
  const base = { id, field, choice, confidence: answer.confidence, probabilities: answer.probabilities };
  if (answer.confidence < threshold) {
    return { ...base, gatedReason: 'skipped_low_confidence' };
  }
  return base;
}

/** ゲートを通過したフィールドのうち、DOM 順で連続し choice が同じ分割対象キーであるものをグループ化 */
function buildSplitGroups(decisions: Decision[]): Map<string, Decision[]> {
  const groups: Decision[][] = [];
  let current: Decision[] = [];
  for (const d of decisions) {
    const active = !d.gatedReason && d.choice !== undefined && SPLIT_GROUP_KEYS.has(d.choice);
    if (active) {
      const currentFirst = current[0];
      if (currentFirst && currentFirst.choice === d.choice) {
        current.push(d);
      } else {
        if (current.length > 0) groups.push(current);
        current = [d];
      }
    } else if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  const byId = new Map<string, Decision[]>();
  for (const g of groups) {
    if (g.length >= 2) {
      for (const d of g) byId.set(d.id, g);
    }
  }
  return byId;
}

export function resolveFill(input: ResolveInput): ResolveOutput {
  const { fields, answers, profileFields, settings, now } = input;
  const ids = Object.keys(fields);
  const customValues: Record<string, string> = {};
  const customLabels: Record<string, string> = {};
  for (const c of input.customFields ?? []) {
    customValues[c.id] = c.value;
    customLabels[c.id] = c.label;
  }

  const decisions: Decision[] = ids.map((id) => {
    const field = fields[id] as ExtractedField;
    return buildDecision(id, field, answers[id], settings.confidenceThreshold);
  });

  // 住所の分割の度合いに合わせて各欄の受け持ち範囲を決める（手順 4a）。
  // 範囲が決まった欄は「住所のどこか」である確率の合計で確信度を判定する
  // （full / line1 / line2 で Jev が迷っても、範囲は前後の欄から決まるため）
  const addressPlans = planAddressRanges(
    decisions.map((d) => ({
      id: d.id,
      field: d.field,
      choice: d.gatedReason && d.gatedReason !== 'skipped_low_confidence' ? undefined : d.choice,
      probabilities: d.probabilities,
    })),
  );
  for (const d of decisions) {
    const plan = addressPlans.get(d.id);
    if (d.gatedReason === 'skipped_low_confidence' && (plan?.addressConfidence ?? 0) >= settings.confidenceThreshold) {
      d.gatedReason = undefined;
    }
  }

  const splitGroups = buildSplitGroups(decisions);

  const assignments: Record<string, FillAssignment> = {};
  const outcomes: FieldOutcome[] = [];

  for (const d of decisions) {
    if (d.gatedReason) {
      outcomes.push(outcome(d, d.gatedReason, customLabels));
      continue;
    }
    const choiceKey = d.choice as ProfileFieldKey;
    const group = splitGroups.get(d.id);
    const addressPlan = addressPlans.get(d.id);

    let rawValue: string;
    if (group) {
      const wholeValue = resolveProfileFieldValue(choiceKey, profileFields, { now, customValues });
      const parts = splitForFieldCount(
        choiceKey as 'phone' | 'postal_code',
        wholeValue,
        group.map((g) => g.field.maxlength),
      );
      const idx = group.indexOf(d);
      if (parts.length !== group.length) {
        if (idx === 0) {
          rawValue = wholeValue;
        } else {
          outcomes.push(outcome(d, 'skipped_split_mismatch', customLabels));
          continue;
        }
      } else {
        rawValue = parts[idx] ?? '';
      }
    } else if (addressPlan && !isSelectOrRadio(d.field)) {
      rawValue = buildAddressValue(profileFields, addressPlan.script, addressPlan.from, addressPlan.to);
      // 広げた値が収まらなければ、その欄自身の部分だけにする
      if (d.field.maxlength !== undefined && rawValue.length > d.field.maxlength) {
        rawValue = buildAddressValue(profileFields, addressPlan.script, addressPlan.own, addressPlan.own);
      }
    } else {
      rawValue = resolveProfileFieldValue(choiceKey, profileFields, { placeholder: d.field.placeholder, now, customValues });
    }

    if (!rawValue) {
      outcomes.push(outcome(d, 'skipped_unset', customLabels));
      continue;
    }

    if (d.field.currentValue === 'filled' && !settings.overwriteFilled) {
      outcomes.push(outcome(d, 'skipped_existing_value', customLabels));
      continue;
    }

    const selectKind = isSelectOrRadio(d.field);
    let assignment: FillAssignment;

    if (selectKind) {
      const options = d.field.options ?? [];
      const matched = matchForChoice(choiceKey, rawValue, options, profileFields);
      if (matched === null) {
        outcomes.push(outcome(d, 'skipped_no_option_match', customLabels));
        continue;
      }
      assignment = { kind: selectKind, value: matched };
    } else {
      let value = formatForFieldType(rawValue, choiceKey, d.field, profileFields);
      if (!value) {
        outcomes.push(outcome(d, 'skipped_unset', customLabels));
        continue;
      }
      if (KANA_CHOICE_KEYS.has(choiceKey) && shouldConvertToHiragana(d.field.label)) {
        value = katakanaToHiragana(value);
      }
      // 保存値はハイフン区切りなので、「-」抜きを求める欄では取り除く（maxlength 判定より前に行う）
      if (HYPHENATED_CHOICE_KEYS.has(choiceKey) && shouldStripHyphens(d.field, value)) {
        value = value.replace(/-/g, '');
      }
      if (d.field.maxlength !== undefined && value.length > d.field.maxlength) {
        outcomes.push(outcome(d, 'skipped_max_length', customLabels));
        continue;
      }
      assignment = { kind: 'text', value };
    }

    assignments[d.id] = assignment;
    outcomes.push(outcome(d, 'filled', customLabels));
  }

  return { assignments, outcomes };
}
