import { describe, expect, it } from 'vitest';
import { katakanaToHiragana, shouldConvertToHiragana } from '../../src/shared/kana';

describe('kana: かな変換（要件 2.4）', () => {
  it('UNIT-DERIVE-14: ラベルに「ふりがな」「ひらがな」を含めばひらがな変換', () => {
    expect(shouldConvertToHiragana('ふりがな')).toBe(true);
    expect(shouldConvertToHiragana('お名前（ひらがな）')).toBe(true);
    expect(katakanaToHiragana('ヤマダ')).toBe('やまだ');
  });

  it('UNIT-DERIVE-15: 「フリガナ」「カタカナ」「カナ」はそのまま（変換しない）', () => {
    expect(shouldConvertToHiragana('フリガナ')).toBe(false);
    expect(shouldConvertToHiragana('カタカナ')).toBe(false);
    expect(shouldConvertToHiragana('カナ')).toBe(false);
  });

  it('katakanaToHiragana は非カタカナ文字をそのまま保持する', () => {
    expect(katakanaToHiragana('ヤマダ TARO123')).toBe('やまだ TARO123');
  });
});
