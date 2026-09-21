/**
 * カタカナ ⇄ ひらがな変換（純粋関数、DOM/storage 非依存）。
 * プロフィールの *_kana はカタカナで保存する（要件 2.3）。
 * ラベルに「ふりがな」「ひらがな」を含む場合のみひらがなへ変換する（要件 2.4）。
 * 「フリガナ」「カタカナ」「カナ」はそのまま（カタカナ）を使う。
 */

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const HIRAGANA_OFFSET = -0x60;

export function katakanaToHiragana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= KATAKANA_START && code <= KATAKANA_END) {
      out += String.fromCodePoint(code + HIRAGANA_OFFSET);
    } else {
      out += ch;
    }
  }
  return out;
}

const HIRAGANA_LABEL_PATTERN = /ふりがな|ひらがな/;

/** ラベルが「ひらがな要求」であればカタカナ→ひらがな変換を行うべきか判定する */
export function shouldConvertToHiragana(label: string): boolean {
  return HIRAGANA_LABEL_PATTERN.test(label);
}
