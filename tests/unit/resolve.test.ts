import { describe, expect, it } from 'vitest';
import { resolveFill } from '../../src/background/resolve/resolve';
import { createEmptyProfileFields } from '../../src/shared/profile-schema';
import type { ExtractedField, ExtractedFields, ProfileFields } from '../../src/shared/types';

function field(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return { tag: 'input', type: 'text', label: 'field', currentValue: 'empty', ...overrides };
}

function profile(overrides: Partial<ProfileFields> = {}): ProfileFields {
  return { ...createEmptyProfileFields(), ...overrides };
}

const DEFAULT_SETTINGS = { confidenceThreshold: 0.7, overwriteFilled: false };

describe('resolveFill: choice / confidence ゲート（UNIT-RESOLVE-01〜05）', () => {
  it('UNIT-RESOLVE-01: choice=none は対応なし', () => {
    const fields: ExtractedFields = { f0: field() };
    const { outcomes, assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'none', confidence: 0.99 } },
      profileFields: profile({ company: 'ACME' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('no_match');
    expect(assignments.f0).toBeUndefined();
  });

  it('UNIT-RESOLVE-02: 確信度が閾値未満はスキップ', () => {
    const fields: ExtractedFields = { f0: field() };
    const { outcomes } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.65 } },
      profileFields: profile({ company: 'ACME' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('skipped_low_confidence');
  });

  it('UNIT-RESOLVE-03: 確信度が閾値ちょうどなら採用（境界値）', () => {
    const fields: ExtractedFields = { f0: field() };
    const { outcomes } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.7 } },
      profileFields: profile({ company: 'ACME' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('filled');
  });

  it('UNIT-RESOLVE-04: 確信度が閾値をわずかに下回るとスキップ', () => {
    const fields: ExtractedFields = { f0: field() };
    const { outcomes } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.699 } },
      profileFields: profile({ company: 'ACME' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('skipped_low_confidence');
  });

  it('UNIT-RESOLVE-05: プロフィール値が未設定ならスキップ', () => {
    const fields: ExtractedFields = { f0: field() };
    const { outcomes } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.9 } },
      profileFields: profile({ company: '' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('skipped_unset');
  });
});

describe('resolveFill: 分割グループ（UNIT-RESOLVE-06〜08 / 15）', () => {
  it('UNIT-RESOLVE-06: 電話 3 分割の正常割当', () => {
    const fields: ExtractedFields = {
      f0: field({ maxlength: 4 }),
      f1: field({ maxlength: 4 }),
      f2: field({ maxlength: 4 }),
    };
    const { assignments, outcomes } = resolveFill({
      fields,
      answers: {
        f0: { choice: 'phone', confidence: 0.9 },
        f1: { choice: 'phone', confidence: 0.9 },
        f2: { choice: 'phone', confidence: 0.9 },
      },
      profileFields: profile({ phone: '090-1234-5678' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '090' });
    expect(assignments.f1).toEqual({ kind: 'text', value: '1234' });
    expect(assignments.f2).toEqual({ kind: 'text', value: '5678' });
    expect(outcomes.every((o) => o.reason === 'filled')).toBe(true);
  });

  it('UNIT-RESOLVE-07: フィールド数(3) > ハイフン区切り数(2) は先頭に全体、残りはスキップ', () => {
    const fields: ExtractedFields = { f0: field(), f1: field(), f2: field() };
    const { assignments, outcomes } = resolveFill({
      fields,
      answers: {
        f0: { choice: 'phone', confidence: 0.9 },
        f1: { choice: 'phone', confidence: 0.9 },
        f2: { choice: 'phone', confidence: 0.9 },
      },
      profileFields: profile({ phone: '090-1234' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '090-1234' });
    expect(assignments.f1).toBeUndefined();
    expect(assignments.f2).toBeUndefined();
    expect(outcomes[1]?.reason).toBe('skipped_split_mismatch');
    expect(outcomes[2]?.reason).toBe('skipped_split_mismatch');
  });

  it('UNIT-RESOLVE-08: フィールド数(2) < ハイフン区切り数(3、postal_code) は先頭に全体、残りはスキップ', () => {
    const fields: ExtractedFields = { f0: field(), f1: field() };
    const { assignments, outcomes } = resolveFill({
      fields,
      answers: {
        f0: { choice: 'postal_code', confidence: 0.9 },
        f1: { choice: 'postal_code', confidence: 0.9 },
      },
      profileFields: profile({ postal_code: '100-00-01' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '100-00-01' });
    expect(assignments.f1).toBeUndefined();
    expect(outcomes[1]?.reason).toBe('skipped_split_mismatch');
  });

  it('UNIT-RESOLVE-15: email + email_confirm は分割せず同じ値がそのまま入る', () => {
    const fields: ExtractedFields = { f0: field(), f1: field() };
    const { assignments } = resolveFill({
      fields,
      answers: {
        f0: { choice: 'email', confidence: 0.9 },
        f1: { choice: 'email', confidence: 0.9 },
      },
      profileFields: profile({ email: 'taro@example.com' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: 'taro@example.com' });
    expect(assignments.f1).toEqual({ kind: 'text', value: 'taro@example.com' });
  });
});

describe('resolveFill: type=date / type=month（UNIT-RESOLVE-09/10）', () => {
  it('UNIT-RESOLVE-09: input[type=date] へ YYYY-MM-DD', () => {
    const fields: ExtractedFields = { f0: field({ type: 'date' }) };
    const { assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'birth_date', confidence: 0.9 } },
      profileFields: profile({ birth_date: '1990-01-31' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '1990-01-31' });
  });

  it('UNIT-RESOLVE-10: input[type=month] へ YYYY-MM', () => {
    const fields: ExtractedFields = { f0: field({ type: 'month' }) };
    const { assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'birth_date', confidence: 0.9 } },
      profileFields: profile({ birth_date: '1990-01-31' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '1990-01' });
  });
});

describe('resolveFill: maxlength（UNIT-RESOLVE-11/12）', () => {
  it('UNIT-RESOLVE-11: maxlength 超過はスキップ', () => {
    const fields: ExtractedFields = { f0: field({ maxlength: 4 }) };
    const { outcomes } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.9 } },
      profileFields: profile({ company: 'ABCDE' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('skipped_max_length');
  });

  it('UNIT-RESOLVE-12: maxlength ちょうどは採用', () => {
    const fields: ExtractedFields = { f0: field({ maxlength: 4 }) };
    const { assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.9 } },
      profileFields: profile({ company: 'ABCD' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: 'ABCD' });
  });
});

describe('resolveFill: 既存値の非上書き（UNIT-RESOLVE-13/14）', () => {
  it('UNIT-RESOLVE-13: 既存値ありは既定で上書きしない', () => {
    const fields: ExtractedFields = { f0: field({ currentValue: 'filled' }) };
    const { outcomes, assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.9 } },
      profileFields: profile({ company: 'ACME' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('skipped_existing_value');
    expect(assignments.f0).toBeUndefined();
  });

  it('UNIT-RESOLVE-14: overwriteFilled=true なら上書きする', () => {
    const fields: ExtractedFields = { f0: field({ currentValue: 'filled' }) };
    const { assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.9 } },
      profileFields: profile({ company: 'ACME' }),
      settings: { ...DEFAULT_SETTINGS, overwriteFilled: true },
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: 'ACME' });
  });
});

describe('resolveFill: select/radio の選択肢不一致（UNIT-RESOLVE-16）', () => {
  it('選択肢が正規化候補のどれとも一致しなければスキップ', () => {
    const fields: ExtractedFields = {
      f0: field({ tag: 'select', type: undefined, options: ['Tokyo', 'Osaka'] }),
    };
    const { outcomes, assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'prefecture', confidence: 0.9 } },
      profileFields: profile({ prefecture: '東京都' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('skipped_no_option_match');
    expect(assignments.f0).toBeUndefined();
  });
});

describe('resolveFill: checkbox は常に対象外', () => {
  it('checkbox は Jev の回答に関わらず入力されない', () => {
    const fields: ExtractedFields = { f0: field({ type: 'checkbox' }) };
    const { outcomes, assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.99 } },
      profileFields: profile({ company: 'ACME' }),
      settings: DEFAULT_SETTINGS,
    });
    expect(outcomes[0]?.reason).toBe('no_match');
    expect(assignments.f0).toBeUndefined();
  });
});

describe('resolveFill: ハイフン抜きを求める欄', () => {
  const PHONE = profile({ phone: '090-1234-5678', postal_code: '100-0001' });

  function fill(f: Partial<ExtractedField>, choice = 'phone', profileFields = PHONE) {
    const { assignments, outcomes } = resolveFill({
      fields: { f0: field(f) },
      answers: { f0: { choice, confidence: 0.95 } },
      profileFields,
      settings: DEFAULT_SETTINGS,
    });
    return { assignment: assignments.f0, reason: outcomes[0]?.reason };
  }

  it('「-」抜きでご登録ください と書かれていればハイフンを取り除く（実サイトで報告された事例）', () => {
    expect(fill({ label: '電話番号（「-」抜きでご登録ください）' }).assignment).toEqual({
      kind: 'text',
      value: '09012345678',
    });
  });

  it('ハイフンなし / ハイフン不要 / 半角数字のみ / without hyphens も拾う', () => {
    for (const label of ['電話番号 ハイフンなし', '電話番号（ハイフン不要）', '電話番号 半角数字のみ', 'Phone (without hyphens)']) {
      expect(fill({ label }).assignment).toEqual({ kind: 'text', value: '09012345678' });
    }
  });

  it('プレースホルダーに書かれている場合も拾う', () => {
    expect(fill({ label: '電話番号', placeholder: '09012345678（ハイフンなし）' }).assignment).toEqual({
      kind: 'text',
      value: '09012345678',
    });
  });

  it('文言がなくても maxlength がハイフン込みでは足りない場合は取り除く', () => {
    expect(fill({ label: '電話番号', maxlength: 11 }).assignment).toEqual({ kind: 'text', value: '09012345678' });
  });

  it('type=number にはハイフンを入れない', () => {
    expect(fill({ label: '電話番号', type: 'number' }).assignment).toEqual({ kind: 'text', value: '09012345678' });
  });

  it('郵便番号も同様に扱う', () => {
    expect(fill({ label: '郵便番号（ハイフンなし）' }, 'postal_code').assignment).toEqual({
      kind: 'text',
      value: '1000001',
    });
  });

  it('指示がなければハイフンを保つ', () => {
    expect(fill({ label: '電話番号' }).assignment).toEqual({ kind: 'text', value: '090-1234-5678' });
    expect(fill({ label: '電話番号', maxlength: 13 }).assignment).toEqual({ kind: 'text', value: '090-1234-5678' });
  });

  it('ハイフンを抜いても maxlength に収まらなければ従来どおりスキップする', () => {
    expect(fill({ label: '電話番号', maxlength: 5 }).reason).toBe('skipped_max_length');
  });
});
