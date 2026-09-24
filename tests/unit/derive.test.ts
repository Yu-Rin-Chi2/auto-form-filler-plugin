import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  deriveAddressFull,
  deriveBirthDay,
  deriveBirthMonth,
  deriveBirthYear,
  deriveFullName,
  deriveFullNameKana,
  deriveFullNameRomaji,
  splitByHyphen,
  splitForFieldCount,
} from '../../src/shared/derive';
import { createEmptyProfileFields } from '../../src/shared/profile-schema';
import type { ProfileFields } from '../../src/shared/types';

function baseFields(overrides: Partial<ProfileFields> = {}): ProfileFields {
  return { ...createEmptyProfileFields(), ...overrides };
}

describe('derive: full_name / full_name_kana / full_name_romaji', () => {
  it('UNIT-DERIVE-01: 氏名一体型は半角スペース区切り', () => {
    const fields = baseFields({ family_name: '山田', given_name: '太郎' });
    expect(deriveFullName(fields)).toBe('山田 太郎');
  });

  it('UNIT-DERIVE-02: 対象 placeholder に全角スペースがあれば全角スペース区切り', () => {
    const fields = baseFields({ family_name: '山田', given_name: '太郎' });
    expect(deriveFullName(fields, '山田　太郎')).toBe('山田　太郎');
  });

  it('UNIT-DERIVE-03: フリガナ一体型', () => {
    const fields = baseFields({ family_name_kana: 'ヤマダ', given_name_kana: 'タロウ' });
    expect(deriveFullNameKana(fields)).toBe('ヤマダ タロウ');
  });

  it('UNIT-DERIVE-04: ローマ字氏名は英語語順（名→姓）', () => {
    const fields = baseFields({ family_name_romaji: 'YAMADA', given_name_romaji: 'TARO' });
    expect(deriveFullNameRomaji(fields)).toBe('TARO YAMADA');
  });
});

describe('derive: address_full', () => {
  it('UNIT-DERIVE-05: 4項目を区切りなしで連結', () => {
    const fields = baseFields({
      prefecture: '東京都',
      city: '千代田区',
      address_line1: '千代田1-1-1',
      address_line2: 'サンプルマンション101',
    });
    expect(deriveAddressFull(fields)).toBe('東京都千代田区千代田1-1-1サンプルマンション101');
  });

  it('UNIT-DERIVE-06: 建物名が未設定でも余分な区切り・空白が残らない', () => {
    const fields = baseFields({ prefecture: '東京都', city: '千代田区', address_line1: '千代田1-1-1', address_line2: '' });
    expect(deriveAddressFull(fields)).toBe('東京都千代田区千代田1-1-1');
  });
});

describe('derive: birth_year / birth_month / birth_day', () => {
  it('UNIT-DERIVE-07: 年は西暦4桁', () => {
    expect(deriveBirthYear('1990-01-31')).toBe('1990');
  });

  it('UNIT-DERIVE-08: 月・日はゼロ埋め2桁（表記ゆれ吸収は normalize 側の責務）', () => {
    expect(deriveBirthMonth('1990-01-31')).toBe('01');
    expect(deriveBirthDay('1990-01-31')).toBe('31');
  });
});

describe('derive: age', () => {
  it('UNIT-DERIVE-09: 誕生日未到来なら加齢前の年齢になる', () => {
    // 1990-06-15 生まれ、実行日 2026-06-14（誕生日前日）→ 35 歳（36 歳にはまだならない）
    const at = new Date(2026, 5, 14);
    expect(calculateAge('1990-06-15', at)).toBe(35);
  });

  it('誕生日当日は加齢後の年齢になる', () => {
    const at = new Date(2026, 5, 15);
    expect(calculateAge('1990-06-15', at)).toBe(36);
  });

  it('UNIT-DERIVE-10: うるう年 2/29 生まれは、うるう年でない年の 3/1 到来で加齢とみなす', () => {
    // 2000-02-29 生まれ。2026 年はうるう年でないため、2/29 は存在せず 3/1 に繰り上がる
    const feb28 = new Date(2026, 1, 28);
    const mar1 = new Date(2026, 2, 1);
    expect(calculateAge('2000-02-29', feb28)).toBe(25); // まだ加齢前
    expect(calculateAge('2000-02-29', mar1)).toBe(26); // 3/1 到来で加齢
  });

  it('不正な日付には null を返す', () => {
    expect(calculateAge('not-a-date')).toBeNull();
  });
});

describe('derive: 電話・郵便番号の分割', () => {
  const none = (n: number) => Array<number | undefined>(n).fill(undefined);

  it('UNIT-DERIVE-11: 電話番号 3 分割', () => {
    expect(splitForFieldCount('phone', '090-1234-5678', none(3))).toEqual(['090', '1234', '5678']);
  });

  it('UNIT-DERIVE-12: 電話番号 2 分割は先頭パーツ + 残り全部', () => {
    expect(splitForFieldCount('phone', '090-1234-5678', none(2))).toEqual(['090', '12345678']);
  });

  it('UNIT-DERIVE-13: 郵便番号 2 分割', () => {
    expect(splitByHyphen('100-0001')).toEqual(['100', '0001']);
    expect(splitForFieldCount('postal_code', '100-0001', none(2))).toEqual(['100', '0001']);
  });

  it('全角数字・全角ハイフン・長音記号で保存されていても分割できる', () => {
    expect(splitByHyphen('１００－０００１')).toEqual(['100', '0001']);
    expect(splitForFieldCount('phone', '090ー1234ー5678', none(3))).toEqual(['090', '1234', '5678']);
  });

  it('ハイフンなしの郵便番号は 3-4 に分ける', () => {
    expect(splitForFieldCount('postal_code', '1000001', none(2))).toEqual(['100', '0001']);
  });

  it('ハイフンなしの携帯・IP 電話は 3-4-4、2 分割なら先頭 + 残り', () => {
    expect(splitForFieldCount('phone', '09012345678', none(3))).toEqual(['090', '1234', '5678']);
    expect(splitForFieldCount('phone', '05012345678', none(3))).toEqual(['050', '1234', '5678']);
    expect(splitForFieldCount('phone', '09012345678', none(2))).toEqual(['090', '12345678']);
  });

  it('ハイフンなしの東京・大阪の固定電話は 2-4-4、フリーダイヤルは 4-3-3', () => {
    expect(splitForFieldCount('phone', '0312345678', none(3))).toEqual(['03', '1234', '5678']);
    expect(splitForFieldCount('phone', '0120123456', none(3))).toEqual(['0120', '123', '456']);
  });

  it('市外局番の桁数が決まらない固定電話は推測しない', () => {
    expect(splitForFieldCount('phone', '0451234567', none(3))).toEqual(['0451234567']);
  });

  it('各欄の maxlength の合計が桁数と一致すれば、その長さで区切る', () => {
    expect(splitForFieldCount('phone', '0451234567', [3, 3, 4])).toEqual(['045', '123', '4567']);
    expect(splitForFieldCount('phone', '0467123456', [4, 2, 4])).toEqual(['0467', '12', '3456']);
  });

  it('ハイフン区切りのパーツ数が欄の数と一致すれば maxlength より優先する', () => {
    expect(splitForFieldCount('phone', '0467-12-3456', [5, 4, 4])).toEqual(['0467', '12', '3456']);
  });
});
