import { describe, expect, it } from 'vitest';
import {
  matchCandidates,
  matchCountry,
  matchGender,
  matchMonthOrDay,
  matchOption,
  matchPrefecture,
  matchYear,
  normalizeCommon,
} from '../../src/background/resolve/normalize';

describe('normalize: 共通正規化（要件 5.3.1）', () => {
  it('UNIT-NORM-01: trim・全角半角・空白除去・大文字小文字無視で一致判定できる', () => {
    // 全角の "Ａ" や前後空白・大文字小文字違いを許容して一致するか
    expect(matchOption('ABC', ['  ａｂｃ  '])).toBe('  ａｂｃ  ');
  });
});

describe('normalize: 都道府県（UNIT-NORM-02/03/10）', () => {
  it('UNIT-NORM-02: 「東京」⇄「東京都」', () => {
    expect(matchPrefecture('東京', ['東京都'])).toBe('東京都');
  });

  it('UNIT-NORM-03: 「大阪」⇄「大阪府」', () => {
    expect(matchPrefecture('大阪', ['大阪府'])).toBe('大阪府');
  });

  it('UNIT-NORM-10: 前方一致は一意な場合のみ（複数該当なら不一致）', () => {
    expect(matchCandidates(['東京'], ['東京都', '東京都八王子市'])).toBeNull();
  });
});

describe('normalize: 年・月・日（UNIT-NORM-04/05/12）', () => {
  it('UNIT-NORM-04: 年の表記ゆれ（1990年 / 90 のいずれも一致）', () => {
    expect(matchYear('1990', ['1990年'])).toBe('1990年');
    expect(matchYear('1990', ['90'])).toBe('90');
  });

  it('UNIT-NORM-05: 月日の表記ゆれ（01 / 1月 のいずれも一致）', () => {
    expect(matchMonthOrDay('1', ['01'])).toBe('01');
    expect(matchMonthOrDay('1', ['1月'])).toBe('1月');
  });

  it('UNIT-NORM-12: 和暦 select は対応なし（西暦のみ対応）', () => {
    expect(matchYear('1990', ['令和2年', '平成2年'])).toBeNull();
  });
});

describe('normalize: 性別（UNIT-NORM-06/07）', () => {
  it('UNIT-NORM-06: male の同義語', () => {
    expect(matchGender('male', ['男性'])).toBe('男性');
    expect(matchGender('male', ['男'])).toBe('男');
    expect(matchGender('male', ['Male'])).toBe('Male');
    expect(matchGender('male', ['M'])).toBe('M');
  });

  it('UNIT-NORM-07: no_answer の同義語', () => {
    expect(matchGender('no_answer', ['回答しない'])).toBe('回答しない');
    expect(matchGender('no_answer', ['無回答'])).toBe('無回答');
  });
});

describe('normalize: 国（UNIT-NORM-08）', () => {
  it('日本の同義語（Japan / JP / JPN）', () => {
    expect(matchCountry('日本', ['Japan'])).toBe('Japan');
    expect(matchCountry('日本', ['JP'])).toBe('JP');
    expect(matchCountry('日本', ['JPN'])).toBe('JPN');
  });
});

describe('normalize: マッチ優先順位（UNIT-NORM-09/11）', () => {
  it('UNIT-NORM-09: 完全一致が正規化一致より優先される', () => {
    // "東京都" は候補そのものと完全一致する選択肢と、正規化後にのみ一致する選択肢の両方がある
    expect(matchCandidates(['東京都'], [' 東京都 ', '東京都'])).toBe('東京都');
  });

  it('UNIT-NORM-11: どの選択肢とも一致しなければ null', () => {
    expect(matchOption('沖縄県', ['東京都', '大阪府'])).toBeNull();
  });
});

describe('normalizeCommon', () => {
  it('半角カナ（濁点含む）を全角カナへ正規化し、全角表記と同じ結果になる', () => {
    expect(normalizeCommon('ﾔﾏﾀﾞ')).toBe(normalizeCommon('ヤマダ'));
  });

  it('全角英数を半角へ正規化する', () => {
    expect(normalizeCommon('ＡＢＣ１２３')).toBe(normalizeCommon('ABC123'));
  });
});
