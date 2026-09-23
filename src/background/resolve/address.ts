/**
 * 住所欄の分割の度合いへの対応（要件 5.3 手順 4a）。
 *
 * 住所は必ず「都道府県 → 市区町村 → 町名・番地 → 建物名」の順に並ぶ。DOM 順で並んだ住所系の欄を
 * 1 つのまとまりとして扱い、Jev の答えは「その欄がどこから始まるか」の手がかりとして使う。
 * 各テキスト欄には、隣の欄が受け持たない部分まで広げた値を入れる。
 *
 * 例: 都道府県(select) + 市区(text) + 1 欄(text) → 3 つ目の欄は「番地＋建物名」。
 * 3 つ目の欄に Jev が full / line1 / line2 のどれを答えても同じ結果になる。
 */
import { derivePrefectureKana } from '../../shared/derive';
import type { ExtractedField, ProfileFieldKey, ProfileFields } from '../../shared/types';

export type AddressScript = 'kanji' | 'kana';

/** 都道府県=0, 市区町村=1, 町名・番地=2, 建物名=3 */
const PART_KEYS: Record<AddressScript, readonly ProfileFieldKey[]> = {
  kanji: ['prefecture', 'city', 'address_line1', 'address_line2'],
  kana: ['prefecture_kana', 'city_kana', 'address_line1_kana', 'address_line2_kana'],
};
const FULL_KEY: Record<AddressScript, ProfileFieldKey> = {
  kanji: 'address_full',
  kana: 'address_kana_full',
};
const LAST_PART = 3;
const CITY_PART = 1;
const LINE1_PART = 2;

/** まとまりを途切れさせない（住所の間に挟まっていてよい）項目 */
const TRANSPARENT_KEYS = new Set<string>(['postal_code']);

interface AddressKeyInfo {
  script: AddressScript;
  /** 住所一体型（full）なら null。位置は前の欄から決まる */
  part: number | null;
}

function addressKeyInfo(choice: string): AddressKeyInfo | null {
  for (const script of ['kanji', 'kana'] as const) {
    if (choice === FULL_KEY[script]) return { script, part: null };
    const part = PART_KEYS[script].indexOf(choice as ProfileFieldKey);
    if (part >= 0) return { script, part };
  }
  return null;
}

export interface AddressDecisionInput {
  id: string;
  field: ExtractedField;
  /** Jev の回答がない・none・checkbox 等で対象外の欄は undefined */
  choice?: string;
  probabilities?: Record<string, number>;
}

export interface AddressPlan {
  script: AddressScript;
  /** 受け持つ範囲（両端を含む） */
  from: number;
  to: number;
  /** その欄自身の位置。広げた値が maxlength に収まらないときはここだけを入れる */
  own: number;
  /** 住所のいずれかの部分である確率の合計（確信度ゲートに使う） */
  addressConfidence?: number;
}

function isText(field: ExtractedField): boolean {
  return field.tag !== 'select' && !(field.tag === 'input' && field.type === 'radio');
}

function sumAddressProbabilities(script: AddressScript, probabilities?: Record<string, number>): number | undefined {
  if (!probabilities) return undefined;
  const keys = [...PART_KEYS[script], FULL_KEY[script]];
  return keys.reduce((sum, k) => sum + (probabilities[k] ?? 0), 0);
}

interface Member {
  d: AddressDecisionInput;
  info: AddressKeyInfo;
}

function planGroup(members: Member[], out: Map<string, AddressPlan>): void {
  // 1 欄だけなら広げない（「市区町村」だけを尋ねるフォーム等を壊さないため）
  if (members.length < 2) return;
  const script = members[0]!.info.script;

  // 各欄の位置。full は直前の欄の次から始まる
  const pos: number[] = [];
  for (let i = 0; i < members.length; i++) {
    const part = members[i]!.info.part;
    // full が続くのは「住所」と「住所（確認）」のような別々の一体型欄なので、分け合わせない
    if (part === null && i > 0 && members[i - 1]!.info.part === null) return;
    pos.push(part ?? (i === 0 ? 0 : Math.min(pos[i - 1]! + 1, LAST_PART)));
  }
  // 位置が DOM 順で単調増加でなければ、判定が怪しいので手を出さない
  for (let i = 1; i < pos.length; i++) if (pos[i]! <= pos[i - 1]!) return;

  const from = [...pos];
  const to = [...pos];
  const isFull = members.map((m) => m.info.part === null);
  const text = members.map((m) => isText(m.d.field));

  // 間の抜けを埋める: 前が full なら前が、そうでなければ後ろのテキスト欄が、それも無理なら前のテキスト欄が受け持つ
  for (let i = 1; i < members.length; i++) {
    const gapStart = pos[i - 1]! + 1;
    const gapEnd = pos[i]! - 1;
    if (gapStart > gapEnd) continue;
    if (isFull[i - 1] && text[i - 1]) to[i - 1] = gapEnd;
    else if (text[i]) from[i] = gapStart;
    else if (text[i - 1]) to[i - 1] = gapEnd;
  }

  // 先頭: 都道府県・市区町村の欄がまとまりに無ければ（「住所1 + 住所2」型）、先頭のテキスト欄が頭から受け持つ
  const hasUpperPart = pos.some((p) => p <= CITY_PART);
  if (text[0] && (isFull[0] || !hasUpperPart)) from[0] = 0;

  // 末尾: 番地以降の欄なら建物名まで受け持つ。市区町村で終わるフォーム（お住まいの地域のみ等）は広げない
  const last = members.length - 1;
  if (text[last] && (isFull[last] || pos[last]! >= LINE1_PART)) to[last] = LAST_PART;

  members.forEach((m, i) => {
    out.set(m.d.id, {
      script,
      from: from[i]!,
      to: to[i]!,
      own: pos[i]!,
      addressConfidence: sumAddressProbabilities(script, m.d.probabilities),
    });
  });
}

/**
 * DOM 順の判定結果から、住所のまとまりごとに各欄の受け持ち範囲を決める。
 * 確信度不足でスキップされる欄も、隣の欄の範囲を決める手がかりには使う（同じ部分を重複して入れないため）。
 * 漢字とカナは別々のまとまりとして扱い、互いに挟まっていてもまとまりを途切れさせない。
 */
export function planAddressRanges(decisions: AddressDecisionInput[]): Map<string, AddressPlan> {
  const out = new Map<string, AddressPlan>();
  const groups: Record<AddressScript, Member[]> = { kanji: [], kana: [] };
  const flush = () => {
    for (const script of ['kanji', 'kana'] as const) {
      planGroup(groups[script], out);
      groups[script] = [];
    }
  };

  for (const d of decisions) {
    const info = d.choice ? addressKeyInfo(d.choice) : null;
    if (info) {
      groups[info.script].push({ d, info });
    } else if (!d.choice || !TRANSPARENT_KEYS.has(d.choice)) {
      flush();
    }
  }
  flush();
  return out;
}

/** 範囲の部分を連結する。漢字は番地と建物名の間だけ半角スペース、カナは区切りなし */
export function buildAddressValue(fields: ProfileFields, script: AddressScript, from: number, to: number): string {
  const parts =
    script === 'kanji'
      ? [fields.prefecture, fields.city, fields.address_line1, fields.address_line2]
      : [derivePrefectureKana(fields.prefecture), fields.city_kana, fields.address_line1_kana, fields.address_line2_kana];
  let value = '';
  for (let i = from; i <= to; i++) {
    const part = (parts[i] ?? '').trim();
    if (!part) continue;
    const sep = script === 'kanji' && i === LAST_PART && value ? ' ' : '';
    value += sep + part;
  }
  return value;
}
