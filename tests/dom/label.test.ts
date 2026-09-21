import { beforeEach, describe, expect, it } from 'vitest';
import { FORMS } from '../../poc/fixtures/forms';
import { resolveLabel } from '../../src/content/label';
import { extractFields } from '../../src/content/extract';
import { buildFormBodyHtml } from './fixtures';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function el(id = 'target'): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolveLabel: 優先順位（要件 5.1.1）', () => {
  it('DOM-LABEL-01: aria-labelledby が最優先', () => {
    setBody(`
      <span id="ref">正しいラベル</span>
      <label for="target">誤ったラベル</label>
      <input id="target" aria-labelledby="ref">
    `);
    expect(resolveLabel(el())).toBe('正しいラベル');
  });

  it('DOM-LABEL-02: aria-label（aria-labelledby なし）', () => {
    setBody(`
      <label for="target">誤ったラベル</label>
      <input id="target" aria-label="正しいラベル">
    `);
    expect(resolveLabel(el())).toBe('正しいラベル');
  });

  it('DOM-LABEL-03: label[for]', () => {
    setBody(`
      <label for="target">姓</label>
      <input id="target">
    `);
    expect(resolveLabel(el())).toBe('姓');
  });

  it('DOM-LABEL-04: 祖先 <label>（for 属性なし）', () => {
    setBody(`<label>姓<input id="target"></label>`);
    expect(resolveLabel(el())).toBe('姓');
  });

  it('DOM-LABEL-05: テーブル構造の <th>', () => {
    setBody(`
      <table><tr><th>姓</th><td><input id="target"></td></tr></table>
    `);
    expect(resolveLabel(el())).toBe('姓');
  });

  it('DOM-LABEL-06: 定義リストの <dt>', () => {
    setBody(`
      <dl><dt>姓</dt><dd><input id="target"></dd></dl>
    `);
    expect(resolveLabel(el())).toBe('姓');
  });

  it('DOM-LABEL-07: 直前の兄弟テキスト', () => {
    setBody(`<div>姓 <input id="target"></div>`);
    expect(resolveLabel(el())).toBe('姓');
  });

  it('DOM-LABEL-08: placeholder フォールバック', () => {
    setBody(`<input id="target" placeholder="山田">`);
    expect(resolveLabel(el())).toBe('山田');
  });

  it('DOM-LABEL-09: title フォールバック', () => {
    setBody(`<input id="target" title="姓（漢字）">`);
    expect(resolveLabel(el())).toBe('姓（漢字）');
  });

  it('DOM-LABEL-10: name 最終フォールバック（hotel-booking の tel2/tel3）', () => {
    const hotel = FORMS.find((f) => f.id === 'hotel-booking');
    if (!hotel) throw new Error('fixture not found');
    setBody(buildFormBodyHtml(hotel));
    const { fields } = extractFields(document);
    const tel2 = Object.values(fields).find((f) => f.name === 'tel2');
    const tel3 = Object.values(fields).find((f) => f.name === 'tel3');
    expect(tel2?.label).toBe('tel2');
    expect(tel3?.label).toBe('tel3');
  });
});
