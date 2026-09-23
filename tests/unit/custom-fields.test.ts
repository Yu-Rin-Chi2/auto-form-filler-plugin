/**
 * ユーザー定義項目（customFields）: Jev への説明文、リクエストの criteria、値の解決、スキーマ検証。
 * 銀行口座・website の解決もここで確認する。
 */
import { describe, expect, it } from 'vitest';
import { buildJevRequest } from '../../workers/src/build-request';
import { toCustomFieldPayload } from '../../src/background/jev/client';
import { resolveFill } from '../../src/background/resolve/resolve';
import { matchAccountType } from '../../src/background/resolve/normalize';
import { resolveProfileFieldValue } from '../../src/shared/derive';
import { buildProfileDescriptions, describeCustomField, PROFILE_FIELD_DESCRIPTIONS } from '../../workers/src/profile-fields';
import {
  createCustomField,
  createEmptyProfileFields,
  createProfile,
  duplicateProfile,
  normalizeProfile,
  validateCustomFields,
  validateProfile,
} from '../../src/shared/profile-schema';
import type { CustomField, ExtractedField, ProfileFields } from '../../src/shared/types';

function fields(overrides: Partial<ProfileFields> = {}): ProfileFields {
  return { ...createEmptyProfileFields(), ...overrides };
}
function extracted(label: string, overrides: Partial<ExtractedField> = {}): ExtractedField {
  return { tag: 'input', type: 'text', label, currentValue: 'empty', ...overrides };
}
const SETTINGS = { confidenceThreshold: 0.7, overwriteFilled: false };
const TWITTER: CustomField = {
  id: 'custom_ab12cd34',
  label: 'X（Twitter）の ID',
  description: 'Twitter handle starting with @',
  value: '@example_user',
};

describe('createCustomField / describeCustomField / buildProfileDescriptions', () => {
  it('id は custom_ で始まり、呼ぶたびに異なる', () => {
    const a = createCustomField('a');
    const b = createCustomField('b');
    expect(a.id.startsWith('custom_')).toBe(true);
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ label: 'a', description: '', value: '' });
  });

  it('説明文には label と description だけが入り、value は含まれない', () => {
    const text = describeCustomField(TWITTER) as string;
    expect(text).toContain('X（Twitter）の ID');
    expect(text).toContain('Twitter handle starting with @');
    expect(text).not.toContain('@example_user');
    expect(describeCustomField({ ...TWITTER, description: '' })).toBe('User-defined entry "X（Twitter）の ID"');
  });

  it('label が空の項目は Jev に提示しない。none は常に末尾', () => {
    const descriptions = buildProfileDescriptions([TWITTER, { ...TWITTER, id: 'custom_empty000', label: '  ' }]);
    const keys = Object.keys(descriptions);
    expect(keys).toContain('custom_ab12cd34');
    expect(keys).not.toContain('custom_empty000');
    expect(keys[keys.length - 1]).toBe('none');
    // 固定項目はすべて含まれる
    for (const k of Object.keys(PROFILE_FIELD_DESCRIPTIONS)) expect(keys).toContain(k);
  });
});

describe('toCustomFieldPayload: Worker へ値を送らない（P1 最重要）', () => {
  it('id / label / description のみが残り、value は含まれない', () => {
    const payload = toCustomFieldPayload([TWITTER]);
    expect(payload).toEqual([
      { id: 'custom_ab12cd34', label: 'X（Twitter）の ID', description: 'Twitter handle starting with @' },
    ]);
    expect(JSON.stringify(payload)).not.toContain('@example_user');
    expect(payload[0]).not.toHaveProperty('value');
  });

  it('label が空の項目は送らない', () => {
    expect(toCustomFieldPayload([{ ...TWITTER, label: '  ' }])).toEqual([]);
  });
});

describe('buildJevRequest: ユーザー定義項目', () => {
  it('state.profile と各 question の criteria にユーザー定義項目のキーが含まれ、値は含まれない', () => {
    const descriptions = buildProfileDescriptions([TWITTER]);
    const { request } = buildJevRequest(
      { url: 'https://example.com/x', title: 't', lang: 'ja' },
      { f0: extracted('Twitter ID') },
      descriptions,
    );
    expect(request).not.toBeNull();
    const json = JSON.stringify(request);
    expect(request?.state.profile).toHaveProperty('custom_ab12cd34');
    expect(Object.keys(request?.questions.f0?.criteria ?? {})).toContain('custom_ab12cd34');
    expect(json).not.toContain('@example_user');
  });
});

describe('resolveFill: ユーザー定義項目・銀行口座・website', () => {
  it('Jev がユーザー定義項目を選ぶと、その値が入り、詳細には表示名が付く', () => {
    const { assignments, outcomes } = resolveFill({
      fields: { f0: extracted('Twitter ID') },
      answers: { f0: { choice: 'custom_ab12cd34', confidence: 0.9 } },
      profileFields: fields(),
      customFields: [TWITTER],
      settings: SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '@example_user' });
    expect(outcomes[0]).toMatchObject({ reason: 'filled', choice: 'custom_ab12cd34', choiceLabel: 'X（Twitter）の ID' });
  });

  it('値が空のユーザー定義項目は skipped_unset。未知の custom_ キーも同様', () => {
    const { outcomes } = resolveFill({
      fields: { f0: extracted('a'), f1: extracted('b') },
      answers: {
        f0: { choice: 'custom_ab12cd34', confidence: 0.9 },
        f1: { choice: 'custom_unknown1', confidence: 0.9 },
      },
      profileFields: fields(),
      customFields: [{ ...TWITTER, value: '' }],
      settings: SETTINGS,
    });
    expect(outcomes.map((o) => o.reason)).toEqual(['skipped_unset', 'skipped_unset']);
  });

  it('銀行口座: テキスト欄・select・radio と口座名義（カナ / 漢字）', () => {
    const profileFields = fields({
      family_name: '山田',
      given_name: '太郎',
      family_name_kana: 'ヤマダ',
      given_name_kana: 'タロウ',
      bank_name: '三菱UFJ銀行',
      bank_code: '0005',
      branch_name: '渋谷支店',
      branch_code: '135',
      account_type: 'ordinary',
      account_number: '1234567',
      website: 'https://example.com',
    });
    const { assignments } = resolveFill({
      fields: {
        f0: extracted('金融機関名'),
        f1: extracted('銀行コード'),
        f2: extracted('支店コード'),
        f3: extracted('口座番号'),
        f4: extracted('預金種別', { tag: 'select', options: ['選択してください', '普通預金', '当座預金'] }),
        f5: extracted('口座種別', { tag: 'input', type: 'radio', options: ['普通', '当座'] }),
        f6: extracted('預金種目'),
        f7: extracted('口座名義（カナ）'),
        f8: extracted('口座名義人'),
        f9: extracted('ホームページ'),
      },
      answers: {
        f0: { choice: 'bank_name', confidence: 0.9 },
        f1: { choice: 'bank_code', confidence: 0.9 },
        f2: { choice: 'branch_code', confidence: 0.9 },
        f3: { choice: 'account_number', confidence: 0.9 },
        f4: { choice: 'account_type', confidence: 0.9 },
        f5: { choice: 'account_type', confidence: 0.9 },
        f6: { choice: 'account_type', confidence: 0.9 },
        f7: { choice: 'account_holder_kana', confidence: 0.9 },
        f8: { choice: 'account_holder', confidence: 0.9 },
        f9: { choice: 'website', confidence: 0.9 },
      },
      profileFields,
      settings: SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: '三菱UFJ銀行' });
    expect(assignments.f1).toEqual({ kind: 'text', value: '0005' });
    expect(assignments.f2).toEqual({ kind: 'text', value: '135' });
    expect(assignments.f3).toEqual({ kind: 'text', value: '1234567' });
    expect(assignments.f4).toEqual({ kind: 'select', value: '普通預金' });
    expect(assignments.f5).toEqual({ kind: 'radio', value: '普通' });
    expect(assignments.f6).toEqual({ kind: 'text', value: '普通' });
    expect(assignments.f7).toEqual({ kind: 'text', value: 'ヤマダ タロウ' });
    expect(assignments.f8).toEqual({ kind: 'text', value: '山田 太郎' });
    expect(assignments.f9).toEqual({ kind: 'text', value: 'https://example.com' });
  });

  it('預金種別の同義語（英語・ひらがな）を吸収する', () => {
    expect(matchAccountType('ordinary', ['Savings', 'Checking'])).toBe('Savings');
    expect(matchAccountType('current', ['Savings', 'Checking'])).toBe('Checking');
    expect(matchAccountType('savings', ['ふつう', 'とうざ', 'ちょちく'])).toBe('ちょちく');
    expect(matchAccountType('', ['普通'])).toBeNull();
    expect(resolveProfileFieldValue('account_type', fields({ account_type: 'current' }))).toBe('当座');
  });
});

describe('スキーマ: customFields', () => {
  it('createProfile は customFields: [] を持ち、duplicateProfile は複製する', () => {
    const p = createProfile('個人');
    expect(p.customFields).toEqual([]);
    p.customFields = [TWITTER];
    const d = duplicateProfile(p, ' のコピー');
    expect(d.customFields).toEqual([TWITTER]);
    expect(d.customFields).not.toBe(p.customFields);
  });

  it('customFields のない旧プロフィールも有効で、正規化で [] が補われる', () => {
    const legacy = { ...createProfile('旧') } as Record<string, unknown>;
    delete legacy.customFields;
    expect(validateProfile(legacy).valid).toBe(true);
    expect(normalizeProfile(legacy as never).customFields).toEqual([]);
  });

  it('不正な customFields（配列でない・id が custom_ でない・重複 id）は拒否する', () => {
    expect(validateCustomFields('x').valid).toBe(false);
    expect(validateCustomFields([{ id: 'family_name', label: 'a', description: '', value: '' }]).valid).toBe(false);
    expect(validateCustomFields([TWITTER, { ...TWITTER }]).valid).toBe(false);
    expect(validateCustomFields([TWITTER]).valid).toBe(true);
  });

  it('正規化は不正な要素を落とし、欠けた文字列を空文字で補う', () => {
    const p = { ...createProfile('x'), customFields: [{ id: 'custom_ok000001', label: 'L' }, { id: 'bad' }, 'junk'] };
    const n = normalizeProfile(p as never);
    expect(n.customFields).toEqual([{ id: 'custom_ok000001', label: 'L', description: '', value: '' }]);
  });
});
