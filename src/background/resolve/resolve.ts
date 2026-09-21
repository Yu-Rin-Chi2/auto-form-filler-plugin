/**
 * 値の解決（要件 5.3）。Jev の回答（choice/confidence）とプロフィールから、
 * 各フィールドに入れる値（または入れない理由）を決定する。純粋関数のみ。DOM・storage に依存させない。
 */
import { katakanaToHiragana, shouldConvertToHiragana } from '../../shared/kana';
import { parseBirthDate, resolveProfileFieldValue, splitByHyphen, splitPhoneForFieldCount } from '../../shared/derive';
import type {
  ExtractedField,
  ExtractedFields,
  FieldOutcome,
  FieldOutcomeReason,
  FillAssignment,
  ProfileFieldKey,
  ProfileFields,
} from '../../shared/types';
import {
  matchCountry,
  matchGender,
  matchMonthOrDay,
  matchOption,
  matchPrefecture,
  matchYear,
} from './normalize';

export interface AnswerLike {
  choice: string;
  confidence: number;
}

export interface ResolveSettings {
  confidenceThreshold: number;
  overwriteFilled: boolean;
}

export interface ResolveInput {
  fields: ExtractedFields;
  answers: Record<string, AnswerLike | undefined>;
  profileFields: ProfileFields;
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
const KANA_CHOICE_KEYS = new Set<string>(['family_name_kana', 'given_name_kana', 'full_name_kana']);

interface Decision {
  id: string;
  field: ExtractedField;
  choice?: ProfileFieldKey;
  confidence?: number;
  /** この時点でスキップが確定している理由（未確定なら undefined） */
  gatedReason?: FieldOutcomeReason;
}

function outcome(d: Decision, reason: FieldOutcomeReason): FieldOutcome {
  return { fieldId: d.id, label: d.field.label, choice: d.choice, confidence: d.confidence, reason };
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
  fieldType: string | undefined,
  profileFields: ProfileFields,
): string {
  if (choiceKey === 'birth_date' && fieldType === 'month') {
    const parts = parseBirthDate(profileFields.birth_date);
    if (!parts) return '';
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
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
  if (answer.confidence < threshold) {
    return { id, field, choice, confidence: answer.confidence, gatedReason: 'skipped_low_confidence' };
  }
  return { id, field, choice, confidence: answer.confidence };
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

  const decisions: Decision[] = ids.map((id) => {
    const field = fields[id] as ExtractedField;
    return buildDecision(id, field, answers[id], settings.confidenceThreshold);
  });

  const splitGroups = buildSplitGroups(decisions);

  const assignments: Record<string, FillAssignment> = {};
  const outcomes: FieldOutcome[] = [];

  for (const d of decisions) {
    if (d.gatedReason) {
      outcomes.push(outcome(d, d.gatedReason));
      continue;
    }
    const choiceKey = d.choice as ProfileFieldKey;
    const group = splitGroups.get(d.id);

    let rawValue: string;
    if (group) {
      const wholeValue = resolveProfileFieldValue(choiceKey, profileFields, { now });
      const parts =
        choiceKey === 'phone' ? splitPhoneForFieldCount(wholeValue, group.length) : splitByHyphen(wholeValue);
      const idx = group.indexOf(d);
      if (parts.length !== group.length) {
        if (idx === 0) {
          rawValue = wholeValue;
        } else {
          outcomes.push(outcome(d, 'skipped_split_mismatch'));
          continue;
        }
      } else {
        rawValue = parts[idx] ?? '';
      }
    } else {
      rawValue = resolveProfileFieldValue(choiceKey, profileFields, { placeholder: d.field.placeholder, now });
    }

    if (!rawValue) {
      outcomes.push(outcome(d, 'skipped_unset'));
      continue;
    }

    if (d.field.currentValue === 'filled' && !settings.overwriteFilled) {
      outcomes.push(outcome(d, 'skipped_existing_value'));
      continue;
    }

    const selectKind = isSelectOrRadio(d.field);
    let assignment: FillAssignment;

    if (selectKind) {
      const options = d.field.options ?? [];
      const matched = matchForChoice(choiceKey, rawValue, options, profileFields);
      if (matched === null) {
        outcomes.push(outcome(d, 'skipped_no_option_match'));
        continue;
      }
      assignment = { kind: selectKind, value: matched };
    } else {
      let value = formatForFieldType(rawValue, choiceKey, d.field.type, profileFields);
      if (!value) {
        outcomes.push(outcome(d, 'skipped_unset'));
        continue;
      }
      if (KANA_CHOICE_KEYS.has(choiceKey) && shouldConvertToHiragana(d.field.label)) {
        value = katakanaToHiragana(value);
      }
      if (d.field.maxlength !== undefined && value.length > d.field.maxlength) {
        outcomes.push(outcome(d, 'skipped_max_length'));
        continue;
      }
      assignment = { kind: 'text', value };
    }

    assignments[d.id] = assignment;
    outcomes.push(outcome(d, 'filled'));
  }

  return { assignments, outcomes };
}
