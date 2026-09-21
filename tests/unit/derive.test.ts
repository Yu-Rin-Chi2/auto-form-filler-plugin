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
  splitPhoneForFieldCount,
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

describe('derive: 電話・郵便番号のハイフン分割', () => {
  it('UNIT-DERIVE-11: 電話番号 3 分割', () => {
    expect(splitPhoneForFieldCount('090-1234-5678', 3)).toEqual(['090', '1234', '5678']);
  });

  it('UNIT-DERIVE-12: 電話番号 2 分割は先頭パーツ + 残り全部', () => {
    expect(splitPhoneForFieldCount('090-1234-5678', 2)).toEqual(['090', '12345678']);
  });

  it('UNIT-DERIVE-13: 郵便番号 2 分割', () => {
    expect(splitByHyphen('100-0001')).toEqual(['100', '0001']);
  });
});
