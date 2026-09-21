import { describe, expect, it } from 'vitest';
import {
  createProfile,
  isValidGender,
  safeParseJson,
  validateImportPayload,
  validateProfile,
} from '../../src/shared/profile-schema';
import { PROFILE_EXPORT_VERSION } from '../../src/shared/types';

describe('validateProfile（UNIT-SCHEMA-01/02）', () => {
  it('UNIT-SCHEMA-01: 必須フィールドを欠いたオブジェクトは不正として拒否される', () => {
    expect(validateProfile({}).valid).toBe(false);
    expect(validateProfile(null).valid).toBe(false);
    expect(validateProfile({ id: 1, name: 'x' }).valid).toBe(false); // id が型違い
  });

  it('妥当な Profile は valid=true', () => {
    const profile = createProfile('個人');
    expect(validateProfile(profile).valid).toBe(true);
  });

  it('UNIT-SCHEMA-02: gender が列挙値以外なら不正として拒否される', () => {
    expect(isValidGender('male')).toBe(true);
    expect(isValidGender('female')).toBe(true);
    expect(isValidGender('other')).toBe(true);
    expect(isValidGender('no_answer')).toBe(true);
    expect(isValidGender('')).toBe(true);
    expect(isValidGender('unknown')).toBe(false);

    const profile = createProfile('個人');
    (profile.fields as unknown as Record<string, unknown>).gender = 'unknown';
    expect(validateProfile(profile).valid).toBe(false);
  });
});

describe('validateImportPayload（UNIT-SCHEMA-03/04/05）', () => {
  it('UNIT-SCHEMA-03: 正しい形式なら profiles 配列を取得できる', () => {
    const profile = createProfile('個人');
    const payload = { version: PROFILE_EXPORT_VERSION, exportedAt: new Date().toISOString(), profiles: [profile] };
    const result = validateImportPayload(payload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.profiles).toHaveLength(1);
    }
  });

  it('UNIT-SCHEMA-04: profiles キーがない、または配列でなければ不正', () => {
    expect(validateImportPayload({ version: 1 }).valid).toBe(false);
    expect(validateImportPayload({ version: 1, profiles: 'not-an-array' }).valid).toBe(false);
  });

  it('UNIT-SCHEMA-05: 既存プロフィールと同じ id を含む場合、重複 id 一覧が返る', () => {
    const existing = createProfile('既存');
    const incoming = { ...createProfile('インポート'), id: existing.id };
    const payload = { version: PROFILE_EXPORT_VERSION, exportedAt: new Date().toISOString(), profiles: [incoming] };
    const result = validateImportPayload(payload, [existing]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.duplicateIds).toEqual([existing.id]);
    }
  });
});

describe('safeParseJson（UNIT-SCHEMA-06）', () => {
  it('構文エラーのある JSON は例外を投げず null を返す', () => {
    expect(safeParseJson('{ this is not json')).toBeNull();
  });

  it('妥当な JSON はパースされたオブジェクトを返す', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });
});
