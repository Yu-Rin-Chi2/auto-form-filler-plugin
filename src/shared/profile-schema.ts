/**
 * プロフィールのスキーマ・デフォルト値・検証（インポート含む）。純粋関数のみ。
 */
import { PROFILE_FIELD_KEYS, PROFILE_EXPORT_VERSION } from './types';
import type { Gender, Profile, ProfileExport, ProfileFields } from './types';

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
    country: '日本',
    company: '',
    department: '',
    birth_date: '',
    gender: '',
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
    createdAt: now,
    updatedAt: now,
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** ProfileFields の型検証（すべて string、gender のみ enum） */
export function validateProfileFields(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['fields はオブジェクトである必要があります'] };
  }
  const rec = obj as Record<string, unknown>;
  for (const key of PROFILE_FIELD_KEYS) {
    if (key === 'gender') {
      if (!isValidGender(rec.gender)) errors.push(`gender の値が不正です: ${String(rec.gender)}`);
      continue;
    }
    if (typeof rec[key] !== 'string') errors.push(`${key} は文字列である必要があります`);
  }
  return { valid: errors.length === 0, errors };
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
  const profiles = rec.profiles as Profile[];
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
