/**
 * select / radio の選択肢マッチング（要件 5.3.1）。純粋関数のみ。DOM・storage に依存させない。
 *
 * 一致の優先順位: 完全一致 → 正規化一致 → 前方一致（一意な場合のみ）。
 * Jev へのフォールバックは行わない（一致しなければ null＝スキップ、要件 P1）。
 */
import type { AccountType, ExtractedField, Gender } from '../../shared/types';

// ---------------------------------------------------------------------------
// 共通正規化: trim・全角英数→半角・半角カナ→全角カナ・空白除去・大文字小文字無視
// ---------------------------------------------------------------------------

const HALFWIDTH_KATAKANA_MAP: Record<string, string> = {
  ｦ: 'ヲ', ｧ: 'ァ', ｨ: 'ィ', ｩ: 'ゥ', ｪ: 'ェ', ｫ: 'ォ', ｬ: 'ャ', ｭ: 'ュ', ｮ: 'ョ', ｯ: 'ッ',
  ｰ: 'ー', ｱ: 'ア', ｲ: 'イ', ｳ: 'ウ', ｴ: 'エ', ｵ: 'オ',
  ｶ: 'カ', ｷ: 'キ', ｸ: 'ク', ｹ: 'ケ', ｺ: 'コ',
  ｻ: 'サ', ｼ: 'シ', ｽ: 'ス', ｾ: 'セ', ｿ: 'ソ',
  ﾀ: 'タ', ﾁ: 'チ', ﾂ: 'ツ', ﾃ: 'テ', ﾄ: 'ト',
  ﾅ: 'ナ', ﾆ: 'ニ', ﾇ: 'ヌ', ﾈ: 'ネ', ﾉ: 'ノ',
  ﾊ: 'ハ', ﾋ: 'ヒ', ﾌ: 'フ', ﾍ: 'ヘ', ﾎ: 'ホ',
  ﾏ: 'マ', ﾐ: 'ミ', ﾑ: 'ム', ﾒ: 'メ', ﾓ: 'モ',
  ﾔ: 'ヤ', ﾕ: 'ユ', ﾖ: 'ヨ',
  ﾗ: 'ラ', ﾘ: 'リ', ﾙ: 'ル', ﾚ: 'レ', ﾛ: 'ロ',
  ﾜ: 'ワ', ﾝ: 'ン',
};
const VOICED_MAP: Record<string, string> = {
  カ: 'ガ', キ: 'ギ', ク: 'グ', ケ: 'ゲ', コ: 'ゴ',
  サ: 'ザ', シ: 'ジ', ス: 'ズ', セ: 'ゼ', ソ: 'ゾ',
  タ: 'ダ', チ: 'ヂ', ツ: 'ヅ', テ: 'デ', ト: 'ド',
  ハ: 'バ', ヒ: 'ビ', フ: 'ブ', ヘ: 'ベ', ホ: 'ボ',
  ウ: 'ヴ',
};
const SEMI_VOICED_MAP: Record<string, string> = { ハ: 'パ', ヒ: 'ピ', フ: 'プ', ヘ: 'ペ', ホ: 'ポ' };

function hankakuKanaToZenkaku(input: string): string {
  const chars = Array.from(input);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    const base = HALFWIDTH_KATAKANA_MAP[ch];
    if (!base) {
      out += ch;
      continue;
    }
    const next = chars[i + 1];
    if (next === 'ﾞ' && VOICED_MAP[base]) {
      out += VOICED_MAP[base];
      i++;
    } else if (next === 'ﾟ' && SEMI_VOICED_MAP[base]) {
      out += SEMI_VOICED_MAP[base];
      i++;
    } else {
      out += base;
    }
  }
  return out;
}

function zenkakuAlnumToHankaku(input: string): string {
  return input
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

/** 共通正規化（trim・全角→半角(英数)・半角→全角(カナ)・空白除去・大文字小文字無視） */
export function normalizeCommon(input: string): string {
  let s = input.trim();
  s = zenkakuAlnumToHankaku(s);
  s = hankakuKanaToZenkaku(s);
  s = s.replace(/\s+/g, '');
  s = s.toLowerCase();
  return s;
}

/**
 * 「ハイフン抜きで」と指示しているラベル・プレースホルダー。
 * 「-」抜き / ハイフンなし / ハイフン不要 / 半角数字のみ / without hyphens などを拾う。
 * 各種ダッシュ（全角・半角・長音記号）を同一視する。
 */
const NO_HYPHEN_TEXT_PATTERN =
  /(ハイフン|[-‐‑–—―ー−])\s*[」』】）)]*\s*(抜き|なし|無し|不要|を除|を入れ|を含め|は入れ)|(半角)?数字のみ|数字だけ|(without|no)\s+hyphens?|digits?\s+only/i;

/**
 * この欄にハイフンを入れてはいけないか判定する（要件 5.3）。
 * 保存値はハイフン区切り（`090-1234-5678`）なので、フォームが嫌がる場合は取り除く必要がある。
 */
export function shouldStripHyphens(field: ExtractedField, value: string): boolean {
  if (!value.includes('-')) return false;
  // number 型にハイフンは入らない
  if (field.type === 'number') return true;
  if (NO_HYPHEN_TEXT_PATTERN.test(`${field.label} ${field.placeholder ?? ''}`)) return true;
  // 文言がなくても、桁数上限がハイフン込みでは収まらず、抜けば収まるなら抜く
  if (field.maxlength !== undefined) {
    const stripped = value.replace(/-/g, '');
    if (value.length > field.maxlength && stripped.length <= field.maxlength) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 共通マッチングコア: 完全一致 → 正規化一致 → 前方一致（一意な場合のみ）
// ---------------------------------------------------------------------------

export function matchCandidates(candidates: string[], options: string[]): string | null {
  const nonEmpty = candidates.filter((c) => c.length > 0);
  if (nonEmpty.length === 0 || options.length === 0) return null;

  // 1. 完全一致（候補の順に、最初に一致した選択肢を採用）
  for (const c of nonEmpty) {
    const hit = options.find((o) => o === c);
    if (hit !== undefined) return hit;
  }

  // 2. 正規化一致
  const normSet = new Set(nonEmpty.map(normalizeCommon));
  const normHit = options.find((o) => normSet.has(normalizeCommon(o)));
  if (normHit !== undefined) return normHit;

  // 3. 前方一致（一意な場合のみ）
  const prefixHits = options.filter((o) => {
    const normOption = normalizeCommon(o);
    return nonEmpty.some((c) => {
      const normCandidate = normalizeCommon(c);
      return normCandidate.length > 0 && normOption.startsWith(normCandidate);
    });
  });
  if (prefixHits.length === 1) return prefixHits[0] as string;

  return null;
}

/** カテゴリ判定のない汎用マッチ（正規化のみを候補として使う） */
export function matchOption(value: string, options: string[]): string | null {
  return matchCandidates([value], options);
}

// ---------------------------------------------------------------------------
// 都道府県: 「都/道/府/県」の接尾辞の有無を吸収
// ---------------------------------------------------------------------------

const PREFECTURE_SUFFIXES = ['都', '道', '府', '県'];

function prefectureCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const hasSuffix = PREFECTURE_SUFFIXES.some((s) => trimmed.endsWith(s));
  const bare = hasSuffix ? trimmed.slice(0, -1) : trimmed;
  const suffixed = hasSuffix ? [trimmed] : PREFECTURE_SUFFIXES.map((s) => `${bare}${s}`);
  return [trimmed, bare, ...suffixed];
}

export function matchPrefecture(value: string, options: string[]): string | null {
  return matchCandidates(prefectureCandidates(value), options);
}

// ---------------------------------------------------------------------------
// 年: 「1990年」「1990」「90」を吸収（西暦のみ。和暦は対応なし）
// ---------------------------------------------------------------------------

function yearCandidates(value: string): string[] {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return [value];
  return [digits, `${digits}年`, digits.slice(-2)];
}

export function matchYear(value: string, options: string[]): string | null {
  return matchCandidates(yearCandidates(value), options);
}

// ---------------------------------------------------------------------------
// 月・日: 「01」「1」「1月」「1日」のゼロ埋め表記ゆれを吸収
// ---------------------------------------------------------------------------

function monthOrDayCandidates(value: string): string[] {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return [value];
  const num = String(Number(digits));
  const padded = num.padStart(2, '0');
  return [digits, num, padded, `${num}月`, `${num}日`];
}

export function matchMonthOrDay(value: string, options: string[]): string | null {
  return matchCandidates(monthOrDayCandidates(value), options);
}

// ---------------------------------------------------------------------------
// 性別: 同義語吸収
// ---------------------------------------------------------------------------

const GENDER_SYNONYMS: Record<Exclude<Gender, ''>, string[]> = {
  male: ['男性', '男', 'Male', 'M'],
  female: ['女性', '女', 'Female', 'F'],
  other: ['その他', 'Other'],
  no_answer: ['回答しない', '無回答', 'Prefer not to say'],
};

export function matchGender(value: Gender, options: string[]): string | null {
  if (!value) return null;
  return matchCandidates([value, ...GENDER_SYNONYMS[value]], options);
}

// ---------------------------------------------------------------------------
// 預金種別: 「普通」「普通預金」「Ordinary」「Savings（普通の英訳として使われる）」等を吸収
// ---------------------------------------------------------------------------

const ACCOUNT_TYPE_SYNONYMS: Record<Exclude<AccountType, ''>, string[]> = {
  ordinary: ['普通', '普通預金', 'ふつう', 'Ordinary', 'Savings', 'Futsu'],
  current: ['当座', '当座預金', 'とうざ', 'Current', 'Checking', 'Toza'],
  savings: ['貯蓄', '貯蓄預金', 'ちょちく', 'Chochiku'],
};

export function matchAccountType(value: AccountType, options: string[]): string | null {
  if (!value) return null;
  return matchCandidates(ACCOUNT_TYPE_SYNONYMS[value], options);
}

// ---------------------------------------------------------------------------
// 国: 同義語吸収
// ---------------------------------------------------------------------------

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  日本: ['日本', 'Japan', 'JP', 'JPN'],
};

export function matchCountry(value: string, options: string[]): string | null {
  const trimmed = value.trim();
  const candidates = COUNTRY_SYNONYMS[trimmed] ?? [trimmed];
  return matchCandidates(candidates, options);
}
