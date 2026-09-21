import { beforeEach, describe, expect, it } from 'vitest';
import { FORMS } from '../../poc/fixtures/forms';
import { extractFields } from '../../src/content/extract';
import { buildFormBodyHtml } from './fixtures';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extractFields: radio グループ化（要件 5.1.3）', () => {
  it('DOM-RADIO-01/02: 同名 radio が 1 フィールドに集約され、options に各ラベルが入る', () => {
    const ec = FORMS.find((f) => f.id === 'ec-signup');
    if (!ec) throw new Error('fixture not found');
    document.body.innerHTML = buildFormBodyHtml(ec);
    const { fields } = extractFields(document);
    const genderField = Object.values(fields).find((f) => f.type === 'radio');
    expect(genderField?.options).toEqual(['男性', '女性', '回答しない']);

    // radio input 自体は 1 フィールドとしてしかカウントされない（3 つの input が 1 つにまとまる）
    const radioInputCount = document.querySelectorAll('input[type=radio]').length;
    expect(radioInputCount).toBe(3);
  });

  it('DOM-RADIO-03: 異なる name の radio は別フィールドとして抽出される', () => {
    document.body.innerHTML = `
      <form>
        <label>男性<input type="radio" name="gender" value="male"></label>
        <label>女性<input type="radio" name="gender" value="female"></label>
        <label>ベーシック<input type="radio" name="plan" value="basic"></label>
        <label>プレミアム<input type="radio" name="plan" value="premium"></label>
      </form>
    `;
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(2);
    const genderField = Object.values(fields).find((f) => f.options?.includes('男性'));
    const planField = Object.values(fields).find((f) => f.options?.includes('ベーシック'));
    expect(genderField?.options).toEqual(['男性', '女性']);
    expect(planField?.options).toEqual(['ベーシック', 'プレミアム']);
  });
});
