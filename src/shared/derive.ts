/**
 * プロフィール派生項目の生成（要件 2.4）。純粋関数のみ。DOM・storage に依存させない。
 */
import { isCustomFieldKey } from './types';
import type { AccountType, DerivedFieldKey, ProfileFieldKey, ProfileFields, SnsFieldKey } from './types';

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

/** 都道府県 → カナ（接尾辞の都・道・府・県を含む読み）。prefecture_kana の派生に使う */
const PREFECTURE_KANA: Record<string, string> = {
  北海道: 'ホッカイドウ',
  青森県: 'アオモリケン',
  岩手県: 'イワテケン',
  宮城県: 'ミヤギケン',
  秋田県: 'アキタケン',
  山形県: 'ヤマガタケン',
  福島県: 'フクシマケン',
  茨城県: 'イバラキケン',
  栃木県: 'トチギケン',
  群馬県: 'グンマケン',
  埼玉県: 'サイタマケン',
  千葉県: 'チバケン',
  東京都: 'トウキョウト',
  神奈川県: 'カナガワケン',
  新潟県: 'ニイガタケン',
  富山県: 'トヤマケン',
  石川県: 'イシカワケン',
  福井県: 'フクイケン',
  山梨県: 'ヤマナシケン',
  長野県: 'ナガノケン',
  岐阜県: 'ギフケン',
  静岡県: 'シズオカケン',
  愛知県: 'アイチケン',
  三重県: 'ミエケン',
  滋賀県: 'シガケン',
  京都府: 'キョウトフ',
  大阪府: 'オオサカフ',
  兵庫県: 'ヒョウゴケン',
  奈良県: 'ナラケン',
  和歌山県: 'ワカヤマケン',
  鳥取県: 'トットリケン',
  島根県: 'シマネケン',
  岡山県: 'オカヤマケン',
  広島県: 'ヒロシマケン',
  山口県: 'ヤマグチケン',
  徳島県: 'トクシマケン',
  香川県: 'カガワケン',
  愛媛県: 'エヒメケン',
  高知県: 'コウチケン',
  福岡県: 'フクオカケン',
  佐賀県: 'サガケン',
  長崎県: 'ナガサキケン',
  熊本県: 'クマモトケン',
  大分県: 'オオイタケン',
  宮崎県: 'ミヤザキケン',
  鹿児島県: 'カゴシマケン',
  沖縄県: 'オキナワケン',
};

/**
 * 都道府県のカナ。「東京」「東京都」のどちらの表記でも解決する。
 * 表にない値（海外の州名など）は空文字（未設定扱い）。
 */
export function derivePrefectureKana(prefecture: string): string {
  const trimmed = prefecture.trim();
  if (!trimmed) return '';
  const direct = PREFECTURE_KANA[trimmed];
  if (direct) return direct;
  // 接尾辞なし（「東京」「大阪」「北海」）: 表のキーから接尾辞を除いた形で照合する
  for (const [name, kana] of Object.entries(PREFECTURE_KANA)) {
    const stem = name === '北海道' ? '北海道' : name.slice(0, -1);
    if (stem === trimmed) return kana;
  }
  return '';
}

/** 住所カナ一体型。区切りなしで連結（都道府県カナは prefecture から派生） */
export function deriveAddressKanaFull(fields: ProfileFields): string {
  return joinNonEmpty(
    [derivePrefectureKana(fields.prefecture), fields.city_kana, fields.address_line1_kana, fields.address_line2_kana],
    '',
  );
}

/** 預金種別のテキスト表現（テキスト入力欄へはこの日本語を入れる。select/radio は normalize.ts の同義語で照合） */
export const ACCOUNT_TYPE_LABELS: Record<Exclude<AccountType, ''>, string> = {
  ordinary: '普通',
  current: '当座',
  savings: '貯蓄',
};

export function accountTypeToText(value: AccountType): string {
  return value ? ACCOUNT_TYPE_LABELS[value] : '';
}

/** SNS のプロフィール URL の組み立て。`@` はサービスの慣習に合わせる */
const SNS_URL_BUILDERS: Record<SnsFieldKey, (handle: string) => string> = {
  sns_x: (h) => `https://x.com/${h}`,
  sns_youtube: (h) => `https://www.youtube.com/@${h}`,
  sns_instagram: (h) => `https://www.instagram.com/${h}`,
  sns_facebook: (h) => `https://www.facebook.com/${h}`,
  sns_tiktok: (h) => `https://www.tiktok.com/@${h}`,
  sns_github: (h) => `https://github.com/${h}`,
  sns_linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  sns_note: (h) => `https://note.com/${h}`,
};

export function isSnsFieldKey(key: string): key is SnsFieldKey {
  return Object.prototype.hasOwnProperty.call(SNS_URL_BUILDERS, key);
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** 保存値から `@` と前後空白を除いたハンドル。URL が保存されている場合は末尾のパスセグメントを使う */
export function snsHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isUrl(trimmed)) {
    try {
      const segments = new URL(trimmed).pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] ?? '';
      return last.replace(/^@/, '');
    } catch {
      return '';
    }
  }
  return trimmed.replace(/^@/, '');
}

/** SNS 項目の値をプロフィール URL に整形する。保存値がすでに URL ならそのまま返す */
export function snsProfileUrl(key: SnsFieldKey, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isUrl(trimmed)) return trimmed;
  const handle = snsHandle(trimmed);
  return handle ? SNS_URL_BUILDERS[key](handle) : '';
}

/** フィールドが URL を要求しているか（type=url、ラベル / placeholder / name に URL・http） */
export function wantsUrl(field: { type?: string; label?: string; placeholder?: string; name?: string }): boolean {
  if (field.type === 'url') return true;
  const text = `${field.label ?? ''} ${field.placeholder ?? ''} ${field.name ?? ''}`;
  return /url|https?:\/\/|リンク|link/i.test(text);
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

/** 全角数字を半角に、各種ダッシュ・長音記号を「-」に揃える（`０９０ー１２３４` のような保存値のため） */
function normalizeDigitsAndDashes(value: string): string {
  return value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/[‐‑–—―ー−－]/g, '-');
}

/** 電話番号・郵便番号のハイフン分割。空パーツは除去する */
export function splitByHyphen(value: string): string[] {
  return normalizeDigitsAndDashes(value)
    .split('-')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function sliceByLengths(digits: string, lengths: number[]): string[] {
  const parts: string[] = [];
  let pos = 0;
  for (const len of lengths) {
    parts.push(digits.slice(pos, pos + len));
    pos += len;
  }
  return parts;
}

/**
 * ハイフンなしの電話番号を、市外局番・市内局番・加入者番号に分ける。
 * 桁の区切りが番号から一意に決まるもの（携帯・IP 電話・フリーダイヤル・東京/大阪）だけを扱い、
 * 市外局番の桁数が地域で変わる固定電話は推測せず null を返す
 */
function splitPhoneDigits(digits: string): string[] | null {
  if (/^0[5789]0\d{8}$/.test(digits)) return sliceByLengths(digits, [3, 4, 4]);
  if (/^0120\d{6}$/.test(digits)) return sliceByLengths(digits, [4, 3, 3]);
  if (/^0800\d{7}$/.test(digits)) return sliceByLengths(digits, [4, 3, 4]);
  if (/^0[36]\d{8}$/.test(digits)) return sliceByLengths(digits, [2, 4, 4]);
  return null;
}

/**
 * 電話番号・郵便番号を、分割された入力欄の数に合わせて分ける（要件 2.4）。
 *
 * 1. ハイフン区切りのパーツ数が欄の数と一致すればそのまま使う
 * 2. 各欄の maxlength の合計が数字の桁数と一致すれば、その長さで区切る
 * 3. ハイフンなしで保存されていれば、番号の形から区切る（郵便番号 3-4、電話は splitPhoneDigits）
 * 4. 電話番号の 2 分割フォームは「先頭パーツ + 残り全部」（例: "090-1234-5678" → ["090", "12345678"]）
 *
 * どれにも当てはまらなければパーツ数が欄の数と合わない配列を返し、呼び出し側（値解決ロジック）が
 * 「先頭フィールドに値全体を投入し、残りはスキップ」にフォールバックする。
 */
export function splitForFieldCount(
  key: 'phone' | 'postal_code',
  value: string,
  maxLengths: (number | undefined)[],
): string[] {
  const fieldCount = maxLengths.length;
  let parts = splitByHyphen(value);
  if (parts.length === fieldCount) return parts;

  const digits = parts.join('');
  if (!/^\d+$/.test(digits)) return parts;

  if (maxLengths.every((n): n is number => n !== undefined && n > 0)) {
    const total = maxLengths.reduce((sum, n) => sum + n, 0);
    if (total === digits.length) return sliceByLengths(digits, maxLengths);
  }

  if (parts.length === 1) {
    const split =
      key === 'postal_code' ? (/^\d{7}$/.test(digits) ? sliceByLengths(digits, [3, 4]) : null) : splitPhoneDigits(digits);
    if (split) parts = split;
    if (parts.length === fieldCount) return parts;
  }

  if (key === 'phone' && fieldCount === 2 && parts.length >= 2) {
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
  /** ユーザー定義項目の値（id → value）。resolve 側でプロフィールから組み立てて渡す */
  customValues?: Record<string, string>;
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
  if (isCustomFieldKey(key)) return context.customValues?.[key] ?? '';
  switch (key as DerivedFieldKey | keyof ProfileFields | 'none') {
    case 'full_name':
      return deriveFullName(fields, context.placeholder);
    case 'full_name_kana':
      return deriveFullNameKana(fields, context.placeholder);
    case 'full_name_romaji':
      return deriveFullNameRomaji(fields);
    case 'address_full':
      return deriveAddressFull(fields);
    case 'prefecture_kana':
      return derivePrefectureKana(fields.prefecture);
    case 'address_kana_full':
      return deriveAddressKanaFull(fields);
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
    case 'account_holder_kana':
      return deriveFullNameKana(fields, context.placeholder);
    case 'account_holder':
      return deriveFullName(fields, context.placeholder);
    case 'account_type':
      return accountTypeToText(fields.account_type);
    case 'none':
      return '';
    default:
      // keyof ProfileFields（ユーザー直接入力項目）
      return (fields[key as keyof ProfileFields] ?? '').toString();
  }
}
