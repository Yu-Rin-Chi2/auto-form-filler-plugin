/**
 * Worker の入力サニタイズ（要件 P1 の第 2 層）。
 * 拡張が送らない設計であることに加え、Worker 側でも値を落とすことを確認する。
 */
import { describe, expect, it } from 'vitest';
import { sanitizeCustomFields, sanitizeFields, sanitizePage } from '../../workers/src/sanitize';

describe('sanitizeCustomFields: 値を落とす（P1 最重要）', () => {
  it('value が送られてきても結果に含まれない', () => {
    const out = sanitizeCustomFields([
      { id: 'custom_ab12cd34', label: 'Twitter', description: 'handle', value: '@secret_user' },
    ]);
    expect(out).toEqual([{ id: 'custom_ab12cd34', label: 'Twitter', description: 'handle' }]);
    expect(JSON.stringify(out)).not.toContain('@secret_user');
  });

  it('id の形式が不正な項目、label が空の項目は落とす', () => {
    expect(sanitizeCustomFields([{ id: 'not_custom', label: 'x' }])).toEqual([]);
    expect(sanitizeCustomFields([{ id: 'custom_ab12cd34', label: '' }])).toEqual([]);
    expect(sanitizeCustomFields('配列でない')).toEqual([]);
  });
});

describe('sanitizeFields: 想定外のキーを落とす', () => {
  it('列挙していないプロパティ（値など）は通さない', () => {
    const out = sanitizeFields({
      f0: { tag: 'input', type: 'text', label: '姓', value: '鈴木', innerText: '鈴木一郎' },
    });
    expect(out?.f0).toEqual({
      tag: 'input',
      type: 'text',
      label: '姓',
      name: undefined,
      id: undefined,
      autocomplete: undefined,
      placeholder: undefined,
      required: undefined,
      maxlength: undefined,
      section: undefined,
      options: undefined,
      currentValue: undefined,
    });
    expect(JSON.stringify(out)).not.toContain('鈴木');
  });

  it('currentValue は empty / filled 以外を受け付けない', () => {
    expect(sanitizeFields({ f0: { tag: 'input', label: 'a', currentValue: '鈴木' } })?.f0?.currentValue).toBeUndefined();
    expect(sanitizeFields({ f0: { tag: 'input', label: 'a', currentValue: 'filled' } })?.f0?.currentValue).toBe('filled');
  });

  it('フィールドが 0 件なら null', () => {
    expect(sanitizeFields({})).toBeNull();
    expect(sanitizeFields({ f0: { label: 'tag がない' } })).toBeNull();
    expect(sanitizeFields('オブジェクトでない')).toBeNull();
  });
});

describe('sanitizePage', () => {
  it('url / title / lang だけを取り出す', () => {
    expect(sanitizePage({ url: 'https://example.com/a', title: 't', lang: 'ja', cookie: 'secret' })).toEqual({
      url: 'https://example.com/a',
      title: 't',
      lang: 'ja',
    });
  });
});
