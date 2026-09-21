import { describe, expect, it } from 'vitest';
import { buildJevRequest, MAX_FIELDS, normalizePageUrl } from '../../src/background/jev/build-request';
import { PROFILE_FIELD_KEYS_FOR_JEV } from '../../src/shared/profile-fields';
import { createProfile } from '../../src/shared/profile-schema';
import type { ExtractedField, ExtractedFields, PageInfo } from '../../src/shared/types';

function makeFields(count: number): ExtractedFields {
  const fields: ExtractedFields = {};
  for (let i = 0; i < count; i++) {
    fields[`f${i}`] = { tag: 'input', type: 'text', label: `field ${i}` } satisfies ExtractedField;
  }
  return fields;
}

const PAGE: PageInfo = { url: 'https://shop.example.jp/signup', title: '会員登録', lang: 'ja' };

describe('buildJevRequest: フィールド形式（UNIT-REQ-01/03/04）', () => {
  it('UNIT-REQ-01: state.fields は配列でなく id キーのオブジェクト', () => {
    const { request } = buildJevRequest(PAGE, makeFields(3));
    expect(Array.isArray(request?.state.fields)).toBe(false);
    expect(Object.keys(request?.state.fields ?? {})).toEqual(['f0', 'f1', 'f2']);
  });

  it('UNIT-REQ-03: 各質問の criteria はすべて null（説明文の重複がない）', () => {
    const { request } = buildJevRequest(PAGE, makeFields(1));
    const criteria = request?.questions.f0?.criteria ?? {};
    expect(Object.values(criteria).every((v) => v === null)).toBe(true);
    expect(Object.keys(criteria).length).toBeGreaterThan(0);
  });

  it('UNIT-REQ-04: none が常に選択肢に含まれる', () => {
    const { request } = buildJevRequest(PAGE, makeFields(1));
    expect(request?.state.profile.none).toBeDefined();
    expect(request?.questions.f0?.criteria).toHaveProperty('none');
  });
});

describe('buildJevRequest: プロフィール値の非送信（UNIT-REQ-02、P1 最重要）', () => {
  it('UNIT-REQ-02: リクエストを JSON 文字列化してもプロフィールの実値が一切出現しない', () => {
    // buildJevRequest は ProfileFields を受け取れない関数シグネチャ自体が P1 の保証だが、
    // 実際に実在しそうな値を profile に設定した状態からリクエストを組み立てて再確認する
    const profile = createProfile('個人');
    profile.fields.family_name = '山田';
    profile.fields.given_name = '太郎';
    profile.fields.email = 'yamada.taro@example.com';
    profile.fields.phone = '090-1234-5678';
    profile.fields.address_line1 = '千代田1-1-1';

    const { request } = buildJevRequest(PAGE, makeFields(2));
    const json = JSON.stringify(request);

    expect(json).not.toContain('山田');
    expect(json).not.toContain('太郎');
    expect(json).not.toContain('yamada.taro@example.com');
    expect(json).not.toContain('090-1234-5678');
    expect(json).not.toContain('千代田1-1-1');
    // 比較用に profile 変数を参照しておく（未使用警告防止・意図の明示）
    expect(profile.fields.family_name).toBe('山田');
  });
});

describe('buildJevRequest: page.url の正規化（UNIT-REQ-05）', () => {
  it('クエリ・フラグメントを除いた origin + pathname になる', () => {
    const { request } = buildJevRequest(
      { url: 'https://shop.example.jp/signup?ref=ad#top', title: 't', lang: 'ja' },
      makeFields(1),
    );
    expect(request?.state.page.url).toBe('https://shop.example.jp/signup');
    expect(normalizePageUrl('https://shop.example.jp/signup?ref=ad#top')).toBe('https://shop.example.jp/signup');
  });
});

describe('buildJevRequest: 0 件ガード（UNIT-REQ-06）', () => {
  it('フィールド 0 件では request が null になる（呼び出し元で Jev を呼ばないガード）', () => {
    const { request, fieldIds } = buildJevRequest(PAGE, {});
    expect(request).toBeNull();
    expect(fieldIds).toEqual([]);
  });
});

describe('buildJevRequest: 60 件上限（UNIT-REQ-07）', () => {
  it('60 件超は先頭 60 件のみ含まれ、超過件数が返る', () => {
    const { request, fieldIds, overLimitCount } = buildJevRequest(PAGE, makeFields(65));
    expect(Object.keys(request?.state.fields ?? {}).length).toBe(MAX_FIELDS);
    expect(fieldIds.length).toBe(MAX_FIELDS);
    expect(overLimitCount).toBe(5);
  });
});

describe('buildJevRequest: 可視テキストを送らない（UNIT-REQ-08）', () => {
  it('state に page.text 等の可視テキスト全文に相当するキーが存在しない', () => {
    const { request } = buildJevRequest(PAGE, makeFields(1));
    expect(request?.state.page).toEqual(PAGE);
    expect((request?.state.page as unknown as Record<string, unknown>).text).toBeUndefined();
  });
});

describe('PROFILE_FIELD_KEYS_FOR_JEV', () => {
  it('none を含み、重複がない', () => {
    expect(PROFILE_FIELD_KEYS_FOR_JEV).toContain('none');
    expect(new Set(PROFILE_FIELD_KEYS_FOR_JEV).size).toBe(PROFILE_FIELD_KEYS_FOR_JEV.length);
  });
});
