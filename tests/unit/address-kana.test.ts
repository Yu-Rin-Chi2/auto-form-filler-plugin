/**
 * 住所カナ（city_kana / address_line1_kana / address_line2_kana と派生の prefecture_kana /
 * address_kana_full）。金融・決済系フォーム（Stripe Connect のオンボーディング等）向け。
 */
import { describe, expect, it } from 'vitest';
import { resolveFill } from '../../src/background/resolve/resolve';
import {
  deriveAddressKanaFull,
  derivePrefectureKana,
  resolveProfileFieldValue,
} from '../../src/shared/derive';
import { PROFILE_FIELD_DESCRIPTIONS } from '../../workers/src/profile-fields';
import {
  createEmptyProfileFields,
  normalizeProfileFields,
  validateImportPayload,
  validateProfileFields,
} from '../../src/shared/profile-schema';
import { DERIVED_FIELD_KEYS, PROFILE_EXPORT_VERSION, PROFILE_FIELD_KEYS } from '../../src/shared/types';
import type { ExtractedField, ProfileFields } from '../../src/shared/types';

function fields(overrides: Partial<ProfileFields> = {}): ProfileFields {
  return { ...createEmptyProfileFields(), ...overrides };
}

describe('derivePrefectureKana', () => {
  it('47 都道府県の正式表記をカナに変換する', () => {
    expect(derivePrefectureKana('東京都')).toBe('トウキョウト');
    expect(derivePrefectureKana('北海道')).toBe('ホッカイドウ');
    expect(derivePrefectureKana('京都府')).toBe('キョウトフ');
    expect(derivePrefectureKana('鹿児島県')).toBe('カゴシマケン');
  });

  it('接尾辞なしの表記（東京 / 大阪）でも解決する', () => {
    expect(derivePrefectureKana('東京')).toBe('トウキョウト');
    expect(derivePrefectureKana('大阪')).toBe('オオサカフ');
    expect(derivePrefectureKana(' 神奈川 ')).toBe('カナガワケン');
  });

  it('表にない値・空文字は空文字（未設定扱い）', () => {
    expect(derivePrefectureKana('')).toBe('');
    expect(derivePrefectureKana('California')).toBe('');
  });
});

describe('deriveAddressKanaFull / resolveProfileFieldValue', () => {
  const f = fields({
    prefecture: '東京都',
    city: '渋谷区',
    city_kana: 'シブヤク',
    address_line1_kana: 'シブヤ1-2-3',
    address_line2_kana: 'サンプルビル5F',
  });

  it('都道府県カナ + 市区町村カナ + 番地カナ + 建物名カナ を区切りなしで連結する', () => {
    expect(deriveAddressKanaFull(f)).toBe('トウキョウトシブヤクシブヤ1-2-3サンプルビル5F');
  });

  it('未入力の部分は飛ばして連結する', () => {
    expect(deriveAddressKanaFull(fields({ prefecture: '大阪府', city_kana: 'オオサカシ' }))).toBe('オオサカフオオサカシ');
  });

  it('resolveProfileFieldValue で直接項目と派生項目の両方を引ける', () => {
    expect(resolveProfileFieldValue('city_kana', f)).toBe('シブヤク');
    expect(resolveProfileFieldValue('address_line1_kana', f)).toBe('シブヤ1-2-3');
    expect(resolveProfileFieldValue('address_line2_kana', f)).toBe('サンプルビル5F');
    expect(resolveProfileFieldValue('prefecture_kana', f)).toBe('トウキョウト');
    expect(resolveProfileFieldValue('address_kana_full', f)).toBe('トウキョウトシブヤクシブヤ1-2-3サンプルビル5F');
  });
});

describe('resolveFill: 住所カナのひらがな変換', () => {
  function extracted(label: string): ExtractedField {
    return { tag: 'input', type: 'text', label, currentValue: 'empty' };
  }
  const profileFields = fields({ prefecture: '東京都', city_kana: 'シブヤク' });
  const settings = { confidenceThreshold: 0.7, overwriteFilled: false };

  it('ラベルが「ふりがな」なら住所カナもひらがなに変換する', () => {
    const { assignments } = resolveFill({
      fields: { f0: extracted('市区町村（ふりがな）'), f1: extracted('都道府県（ふりがな）') },
      answers: {
        f0: { choice: 'city_kana', confidence: 0.95 },
        f1: { choice: 'prefecture_kana', confidence: 0.95 },
      },
      profileFields,
      settings,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: 'しぶやく' });
    expect(assignments.f1).toEqual({ kind: 'text', value: 'とうきょうと' });
  });

  it('ラベルが「カナ」「フリガナ」ならカタカナのまま', () => {
    const { assignments } = resolveFill({
      fields: { f0: extracted('市区町村（カタカナ）') },
      answers: { f0: { choice: 'city_kana', confidence: 0.95 } },
      profileFields,
      settings,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: 'シブヤク' });
  });

  it('未入力の住所カナは skipped_unset', () => {
    const { outcomes } = resolveFill({
      fields: { f0: extracted('建物名（カナ）') },
      answers: { f0: { choice: 'address_line2_kana', confidence: 0.95 } },
      profileFields,
      settings,
    });
    expect(outcomes[0]?.reason).toBe('skipped_unset');
  });
});

describe('スキーマ: 旧データとの互換', () => {
  it('Jev に提示する説明は全項目キー（直接 + 派生 + none）を網羅している', () => {
    for (const key of [...PROFILE_FIELD_KEYS, ...DERIVED_FIELD_KEYS, 'none'] as const) {
      expect(PROFILE_FIELD_DESCRIPTIONS[key], key).toBeTruthy();
    }
  });

  it('住所カナのキーを持たない旧バージョンの fields も有効と判定し、正規化で空文字が補われる', () => {
    const legacy = { ...createEmptyProfileFields() } as Record<string, unknown>;
    delete legacy.city_kana;
    delete legacy.address_line1_kana;
    delete legacy.address_line2_kana;
    expect(validateProfileFields(legacy).valid).toBe(true);
    const normalized = normalizeProfileFields(legacy as Partial<ProfileFields>);
    expect(normalized.city_kana).toBe('');
    expect(normalized.address_line1_kana).toBe('');
    expect(normalized.address_line2_kana).toBe('');
    // 既存の値は保持される
    expect(normalized.country).toBe('日本');
  });

  it('旧バージョンのエクスポート JSON をインポートすると新キーが補われる', () => {
    const legacyFields = { ...createEmptyProfileFields(), family_name: '山田' } as Record<string, unknown>;
    delete legacyFields.city_kana;
    const payload = {
      version: PROFILE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      profiles: [
        { id: 'p1', name: '個人', color: '#EF4444', fields: legacyFields, createdAt: 'x', updatedAt: 'x' },
      ],
    };
    const result = validateImportPayload(payload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.profiles[0]?.fields.city_kana).toBe('');
      expect(result.data.profiles[0]?.fields.family_name).toBe('山田');
    }
  });

  it('型が不正な値（文字列以外）は引き続き拒否する', () => {
    const bad = { ...createEmptyProfileFields(), city_kana: 123 };
    expect(validateProfileFields(bad).valid).toBe(false);
  });
});
