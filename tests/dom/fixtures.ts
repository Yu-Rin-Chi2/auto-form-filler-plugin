/**
 * `poc/fixtures/forms.ts` の 9 フォームを HTML 化するジェネレータ + シナリオ指定の追加 5 フィクスチャ。
 * ラベルは主に「祖先 <label>」パターンで表現する（resolveLabel の優先順位 4 番目）。
 * `label` が空文字のフィールド（hotel-booking の tel2/tel3 等）はあえて空の <label> になり、
 * placeholder/title もなければ `name` へフォールバックする（DOM-LABEL-10 の検証に使う）。
 */
import type { FieldFixture, FormFixture } from '../../poc/fixtures/forms';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderField(f: FieldFixture, index: number): string {
  const idAttr = `id="fx-${index}"`;
  const nameAttr = f.name ? ` name="${escapeHtml(f.name)}"` : '';
  const placeholderAttr = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
  const requiredAttr = f.required ? ' required' : '';
  const maxlengthAttr = f.maxlength !== undefined ? ` maxlength="${f.maxlength}"` : '';
  const autocompleteAttr = f.autocomplete ? ` autocomplete="${escapeHtml(f.autocomplete)}"` : '';

  if (f.tag === 'select') {
    const options = (f.options ?? [])
      .map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
      .join('');
    return `<label>${escapeHtml(f.label)}<select ${idAttr}${nameAttr}${requiredAttr}>${options}</select></label>`;
  }

  if (f.tag === 'textarea') {
    return `<label>${escapeHtml(f.label)}<textarea ${idAttr}${nameAttr}${placeholderAttr}${requiredAttr}></textarea></label>`;
  }

  if (f.type === 'radio') {
    const groupName = escapeHtml(f.name ?? `radio-${index}`);
    return (f.options ?? [])
      .map(
        (opt, i) =>
          `<label>${escapeHtml(opt)}<input type="radio" name="${groupName}" id="fx-${index}-${i}" value="${escapeHtml(opt)}"></label>`,
      )
      .join('');
  }

  if (f.type === 'checkbox') {
    return `<label>${escapeHtml(f.label)}<input type="checkbox" ${idAttr}${nameAttr}></label>`;
  }

  return `<label>${escapeHtml(f.label)}<input type="${f.type ?? 'text'}" ${idAttr}${nameAttr}${placeholderAttr}${requiredAttr}${maxlengthAttr}${autocompleteAttr}></label>`;
}

export function buildFormBodyHtml(form: FormFixture): string {
  const parts: string[] = ['<form>'];
  let lastSection: string | undefined;
  form.fields.forEach((f, i) => {
    if (f.section && f.section !== lastSection) {
      parts.push(`<h2>${escapeHtml(f.section)}</h2>`);
      lastSection = f.section;
    }
    parts.push(renderField(f, i));
  });
  parts.push('</form>');
  return parts.join('\n');
}

/** DOM-EXTRACT-15: フォームはあるが対象フィールドが 1 つもない（すべて disabled） */
export const EMPTY_FORM_HTML = `
  <form>
    <label>使われない欄<input type="text" disabled></label>
    <input type="hidden" name="csrf" value="abc">
  </form>
`;

/**
 * DOM-EXTRACT-16 / E2E-EDGE-03: 65 個のテキスト入力（先頭 3 個は実項目、残り 62 個は
 * 無関係フィールド）。`FormFixture` 自体を export し、E2E 側（generate-fixtures.ts /
 * edge-cases.spec.ts）でも同じフィールド定義（expected 含む）を再利用できるようにする。
 */
export const LONG_FORM: FormFixture = {
  id: 'long-form',
  title: '長いフォーム',
  url: 'https://example.jp/long',
  lang: 'ja',
  fields: [
    { tag: 'input', type: 'text', name: 'last_name', label: '姓', expected: 'family_name' },
    { tag: 'input', type: 'text', name: 'first_name', label: '名', expected: 'given_name' },
    { tag: 'input', type: 'email', name: 'email', label: 'メールアドレス', expected: 'email' },
    ...Array.from({ length: 62 }, (_, i) => ({
      tag: 'input' as const,
      type: 'text',
      name: `misc_${i}`,
      label: `自由記入欄${i}`,
      expected: 'none' as const,
    })),
  ],
};

export function buildLongFormHtml(): string {
  return buildFormBodyHtml(LONG_FORM);
}

/** DOM-EXTRACT/E2E-EDGE-04: 一部フィールドに value 属性を事前設定した ec-signup 相当 */
export function buildPrefilledFormHtml(): string {
  return `
    <form>
      <label>姓<input type="text" id="fx-0" name="last_name" value="山田"></label>
      <label>名<input type="text" id="fx-1" name="first_name"></label>
      <label>メールアドレス<input type="email" id="fx-2" name="email"></label>
    </form>
  `;
}

/** E2E-EDGE-06: 生年(年) の select が和暦のみ（西暦表記なし） */
export const WAREKI_BIRTH_YEAR_HTML = `
  <form>
    <label>氏名<input type="text" name="full_name"></label>
    <label>生年（和暦）
      <select name="birth_year_wareki">
        <option value="昭和60年">昭和60年</option>
        <option value="平成2年">平成2年</option>
        <option value="令和2年">令和2年</option>
      </select>
    </label>
  </form>
`;

/** E2E-EDGE-07: 都道府県 select の選択肢がローマ字表記のみ（正規化候補と一致しない） */
export const NO_MATCH_OPTIONS_HTML = `
  <form>
    <label>都道府県
      <select name="pref_romaji">
        <option value="Tokyo">Tokyo</option>
        <option value="Osaka">Osaka</option>
      </select>
    </label>
  </form>
`;
