/**
 * プロフィール派生項目の生成（要件 2.4）。純粋関数のみ。DOM・storage に依存させない。
 */
import type { DerivedFieldKey, ProfileFieldKey, ProfileFields } from './types';

const FULL_WIDTH_SPACE = '　';
const HALF_WIDTH_SPACE = ' ';

function pickSpace(placeholder?: string): string {
  return placeholder?.includes(FULL_WIDTH_SPACE) ? FULL_WIDTH_SPACE : HALF_WIDTH_SPACE;
}

function joinNonEmpty(parts: string[], sep: string): string {
  const filtered = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  return filtered.join(sep);
}

/** 氏名一体型。半角スペース区切り（対象 placeholder に全角スペースがあれば全角） */
export function deriveFullName(fields: ProfileFields, placeholder?: string): string {
  return joinNonEmpty([fields.family_name, fields.given_name], pickSpace(placeholder));
}

/** フリガナ一体型。区切りは full_name と同じ規則 */
export function deriveFullNameKana(fields: ProfileFields, placeholder?: string): string {
  return joinNonEmpty([fields.family_name_kana, fields.given_name_kana], pickSpace(placeholder));
}

/** ローマ字氏名一体型。英語語順（名→姓）、半角スペース区切り */
export function deriveFullNameRomaji(fields: ProfileFields): string {
  return joinNonEmpty([fields.given_name_romaji, fields.family_name_romaji], HALF_WIDTH_SPACE);
}

/** 住所一体型。区切りなしで連結 */
export function deriveAddressFull(fields: ProfileFields): string {
  return joinNonEmpty(
    [fields.prefecture, fields.city, fields.address_line1, fields.address_line2],
    '',
  );
}

const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface BirthParts {
  year: number;
  month: number;
  day: number;
}

/** birth_date（YYYY-MM-DD）を数値パーツに分解する。不正な形式は null */
export function parseBirthDate(birthDate: string): BirthParts | null {
  const m = BIRTH_DATE_PATTERN.exec(birthDate.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** 生年月日の年（西暦4桁の文字列） */
export function deriveBirthYear(birthDate: string): string {
  const p = parseBirthDate(birthDate);
  return p ? String(p.year) : '';
}

/** 生年月日の月（ゼロ埋め2桁） */
export function deriveBirthMonth(birthDate: string): string {
  const p = parseBirthDate(birthDate);
  return p ? String(p.month).padStart(2, '0') : '';
}

/** 生年月日の日（ゼロ埋め2桁） */
export function deriveBirthDay(birthDate: string): string {
  const p = parseBirthDate(birthDate);
  return p ? String(p.day).padStart(2, '0') : '';
}

/**
 * 満年齢を計算する。
 * うるう年 2/29 生まれの場合、うるう年でない年は JavaScript の Date が自然に
 * 3/1 へ繰り上げるため、3/1 の到来をもって加齢したものとして扱う（実装上の決定）。
 */
export function calculateAge(birthDate: string, at: Date = new Date()): number | null {
  const p = parseBirthDate(birthDate);
  if (!p) return null;
  let age = at.getFullYear() - p.year;
  const birthdayThisYear = new Date(at.getFullYear(), p.month - 1, p.day);
  birthdayThisYear.setHours(0, 0, 0, 0);
  const atMidnight = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  if (atMidnight < birthdayThisYear) age -= 1;
  return age;
}

/** 電話番号・郵便番号のハイフン分割。空パーツは除去する */
export function splitByHyphen(value: string): string[] {
  return value
    .split('-')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * 電話番号を対象フィールド数に合わせて分割する（要件 2.4）。
 * 3 分割フォームならハイフンで 3 パーツに分割する。2 分割フォームなら、
 * パーツ数に関わらず「先頭パーツ + 残り全部（ハイフンなしで連結）」の 2 パーツにする
 * （例: "090-1234-5678" を 2 フィールドへ → ["090", "12345678"]）。
 * それ以外（フィールド数と分割結果が一致しない等）は、呼び出し側（値解決ロジック）が
 * 「先頭フィールドに値全体を投入し、残りはスキップ」にフォールバックする。
 */
export function splitPhoneForFieldCount(phone: string, fieldCount: number): string[] {
  const parts = splitByHyphen(phone);
  if (parts.length === fieldCount) return parts;
  if (fieldCount === 2 && parts.length >= 2) {
    const [first, ...rest] = parts;
    return [first as string, rest.join('')];
  }
  return parts;
}

export interface DeriveContext {
  /** full_name / full_name_kana の区切り文字判定に使う、対象フィールドの placeholder */
  placeholder?: string;
  /** age 計算の基準日時（テスト用に注入可能） */
  now?: Date;
}

/**
 * 指定した項目キー（2.3 の直接項目 + 2.4 の派生項目）に対応する文字列値を得る。
 * 値が存在しない・計算できない場合は空文字を返す（呼び出し側で「未設定」判定に使う）。
 */
export function resolveProfileFieldValue(
  key: ProfileFieldKey,
  fields: ProfileFields,
  context: DeriveContext = {},
): string {
  switch (key as DerivedFieldKey | keyof ProfileFields | 'none') {
    case 'full_name':
      return deriveFullName(fields, context.placeholder);
    case 'full_name_kana':
      return deriveFullNameKana(fields, context.placeholder);
    case 'full_name_romaji':
      return deriveFullNameRomaji(fields);
    case 'address_full':
      return deriveAddressFull(fields);
    case 'birth_year':
      return deriveBirthYear(fields.birth_date);
    case 'birth_month':
      return deriveBirthMonth(fields.birth_date);
    case 'birth_day':
      return deriveBirthDay(fields.birth_date);
    case 'age': {
      const age = calculateAge(fields.birth_date, context.now);
      return age === null ? '' : String(age);
    }
    case 'none':
      return '';
    default:
      // keyof ProfileFields（ユーザー直接入力項目）
      return (fields[key as keyof ProfileFields] ?? '').toString();
  }
}
