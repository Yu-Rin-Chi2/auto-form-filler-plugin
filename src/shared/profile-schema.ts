/**
 * プロフィールのスキーマ・デフォルト値・検証（インポート含む）。純粋関数のみ。
 */
import { PROFILE_FIELD_KEYS, PROFILE_EXPORT_VERSION } from './types';
import { isCustomFieldKey } from './types';
import type { AccountType, CustomField, CustomFieldKey, Gender, Profile, ProfileExport, ProfileFields } from './types';

/** 識別色の 8 色プリセット（彩度・判別しやすさ重視、アクセント色とは分離） */
export const PRESET_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
] as const;

const GENDER_VALUES: Gender[] = ['male', 'female', 'other', 'no_answer', ''];

export function isValidGender(value: unknown): value is Gender {
  return typeof value === 'string' && GENDER_VALUES.includes(value as Gender);
}

const ACCOUNT_TYPE_VALUES: AccountType[] = ['ordinary', 'current', 'savings', ''];

export function isValidAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && ACCOUNT_TYPE_VALUES.includes(value as AccountType);
}

export function createEmptyProfileFields(): ProfileFields {
  return {
    family_name: '',
    given_name: '',
    family_name_kana: '',
    given_name_kana: '',
    family_name_romaji: '',
    given_name_romaji: '',
    email: '',
    phone: '',
    postal_code: '',
    prefecture: '',
    city: '',
    address_line1: '',
    address_line2: '',
    city_kana: '',
    address_line1_kana: '',
    address_line2_kana: '',
    country: '日本',
    company: '',
    department: '',
    website: '',
    birth_date: '',
    gender: '',
    bank_name: '',
    bank_code: '',
    branch_name: '',
    branch_code: '',
    account_type: '',
    account_number: '',
    sns_x: '',
    sns_youtube: '',
    sns_instagram: '',
    sns_facebook: '',
    sns_tiktok: '',
    sns_github: '',
    sns_linkedin: '',
    sns_note: '',
  };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // フォールバック（テスト環境等、crypto.randomUUID がない場合）
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfile(name: string, color: string = PRESET_COLORS[0]): Profile {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    color,
    fields: createEmptyProfileFields(),
    customFields: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateProfile(source: Profile, nameSuffix: string): Profile {
  const now = new Date().toISOString();
  return {
    ...source,
    id: generateId(),
    name: `${source.name}${nameSuffix}`,
    fields: { ...source.fields },
    customFields: (source.customFields ?? []).map((c) => ({ ...c })),
    createdAt: now,
    updatedAt: now,
  };
}

/** ユーザー定義項目の新規作成。id は `custom_` + ランダム 8 文字（プロフィール内で一意） */
export function createCustomField(label = ''): CustomField {
  const rand = generateId().replace(/-/g, '').slice(-8);
  return { id: `custom_${rand}` as CustomFieldKey, label, description: '', value: '' };
}

/** ユーザー定義項目の検証。配列でない・id が custom_ で始まらない・重複 id は不正 */
export function validateCustomFields(obj: unknown): ValidationResult {
  if (obj === undefined) return { valid: true, errors: [] };
  if (!Array.isArray(obj)) return { valid: false, errors: ['customFields は配列である必要があります'] };
  const errors: string[] = [];
  const seen = new Set<string>();
  obj.forEach((c, i) => {
    if (typeof c !== 'object' || c === null) {
      errors.push(`customFields[${i}] はオブジェクトである必要があります`);
      return;
    }
    const rec = c as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !isCustomFieldKey(rec.id)) errors.push(`customFields[${i}].id が不正です`);
    else if (seen.has(rec.id)) errors.push(`customFields[${i}].id が重複しています: ${rec.id}`);
    else seen.add(rec.id);
    for (const k of ['label', 'description', 'value'] as const) {
      if (rec[k] !== undefined && typeof rec[k] !== 'string') errors.push(`customFields[${i}].${k} は文字列である必要があります`);
    }
  });
  return { valid: errors.length === 0, errors };
}

export function normalizeCustomFields(obj: unknown): CustomField[] {
  if (!Array.isArray(obj)) return [];
  const out: CustomField[] = [];
  for (const c of obj) {
    if (typeof c !== 'object' || c === null) continue;
    const rec = c as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !isCustomFieldKey(rec.id)) continue;
    out.push({
      id: rec.id,
      label: typeof rec.label === 'string' ? rec.label : '',
      description: typeof rec.description === 'string' ? rec.description : '',
      value: typeof rec.value === 'string' ? rec.value : '',
    });
  }
  return out;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * ProfileFields の型検証（すべて string、gender のみ enum）。
 * 後から追加された項目（例: 住所カナ）を持たない旧バージョンの保存データ・エクスポート JSON も
 * 受け入れるため、キーが存在しない（undefined）ことは許容する。読み込み側で
 * `normalizeProfileFields` により空文字で補う。
 */
export function validateProfileFields(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['fields はオブジェクトである必要があります'] };
  }
  const rec = obj as Record<string, unknown>;
  for (const key of PROFILE_FIELD_KEYS) {
    if (key === 'gender') {
      if (rec.gender !== undefined && !isValidGender(rec.gender)) {
        errors.push(`gender の値が不正です: ${String(rec.gender)}`);
      }
      continue;
    }
    if (key === 'account_type') {
      if (rec.account_type !== undefined && !isValidAccountType(rec.account_type)) {
        errors.push(`account_type の値が不正です: ${String(rec.account_type)}`);
      }
      continue;
    }
    if (rec[key] !== undefined && typeof rec[key] !== 'string') errors.push(`${key} は文字列である必要があります`);
  }
  return { valid: errors.length === 0, errors };
}

/** 欠けている項目を既定値で補い、未知のキーを落とす（旧データの読み込み・インポート時に使う） */
export function normalizeProfileFields(obj: Partial<ProfileFields> | undefined): ProfileFields {
  const base = createEmptyProfileFields();
  const out: Record<string, string> = { ...base } as unknown as Record<string, string>;
  if (obj) {
    for (const key of PROFILE_FIELD_KEYS) {
      const v = (obj as Record<string, unknown>)[key];
      if (typeof v === 'string') out[key] = v;
    }
  }
  return out as unknown as ProfileFields;
}

export function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    fields: normalizeProfileFields(profile.fields),
    customFields: normalizeCustomFields(profile.customFields),
  };
}

/** Profile 全体のスキーマ検証（要件 3.3: 壊れた JSON を保存しない） */
export function validateProfile(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['プロフィールはオブジェクトである必要があります'] };
  }
  const rec = obj as Record<string, unknown>;
  if (!isNonEmptyString(rec.id)) errors.push('id が不正です');
  if (!isNonEmptyString(rec.name)) errors.push('name が不正です');
  if (!isNonEmptyString(rec.color)) errors.push('color が不正です');
  if (!isNonEmptyString(rec.createdAt)) errors.push('createdAt が不正です');
  if (!isNonEmptyString(rec.updatedAt)) errors.push('updatedAt が不正です');
  const fieldsResult = validateProfileFields(rec.fields);
  if (!fieldsResult.valid) errors.push(...fieldsResult.errors);
  const customResult = validateCustomFields(rec.customFields);
  if (!customResult.valid) errors.push(...customResult.errors);
  return { valid: errors.length === 0, errors };
}

export type ImportValidationResult =
  | { valid: true; data: ProfileExport; duplicateIds: string[] }
  | { valid: false; error: string };

/**
 * インポート JSON の検証。`{ version, exportedAt, profiles }` の形式であること、
 * 各 profile が有効であることを確認する。既存プロフィールとの id 重複も検出する（4.4）。
 */
export function validateImportPayload(raw: unknown, existing: Profile[] = []): ImportValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'JSON の形式が不正です' };
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.version !== 'number') {
    return { valid: false, error: 'version が不正です' };
  }
  if (!Array.isArray(rec.profiles)) {
    return { valid: false, error: 'profiles が配列ではありません' };
  }
  const errors: string[] = [];
  rec.profiles.forEach((p, i) => {
    const result = validateProfile(p);
    if (!result.valid) errors.push(`profiles[${i}]: ${result.errors.join(', ')}`);
  });
  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }
  const profiles = (rec.profiles as Profile[]).map(normalizeProfile);
  const existingIds = new Set(existing.map((p) => p.id));
  const duplicateIds = profiles.filter((p) => existingIds.has(p.id)).map((p) => p.id);
  return {
    valid: true,
    data: {
      version: rec.version as number,
      exportedAt: typeof rec.exportedAt === 'string' ? rec.exportedAt : new Date().toISOString(),
      profiles,
    },
    duplicateIds,
  };
}

/** エクスポート用 JSON を組み立てる。API キー・settings は含めない（要件 4.4） */
export function buildExportPayload(profiles: Profile[]): ProfileExport {
  return {
    version: PROFILE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
  };
}

/** 壊れた JSON 文字列をパースする。例外を投げず null を返す */
export function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
