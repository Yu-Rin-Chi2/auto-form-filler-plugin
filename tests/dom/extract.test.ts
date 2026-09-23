import { beforeEach, describe, expect, it } from 'vitest';
import { FORMS } from '../../poc/fixtures/forms';
import { extractFields, MAX_FIELDS } from '../../src/content/extract';
import { buildFormBodyHtml, buildLongFormHtml, buildPrefilledFormHtml, EMPTY_FORM_HTML } from './fixtures';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function formById(id: string) {
  const form = FORMS.find((f) => f.id === id);
  if (!form) throw new Error(`fixture not found: ${id}`);
  return form;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extractFields: 通常フォーム（DOM-EXTRACT-01）', () => {
  it('ec-signup の 16 フィールドが DOM 出現順に f0..f15 で抽出される（checkbox の mailmag は除外）', () => {
    setBody(buildFormBodyHtml(formById('ec-signup')));
    const { fields, excludedCount } = extractFields(document);
    const keys = Object.keys(fields);
    // ec-signup の 17 項目のうち末尾の checkbox（メルマガ同意）は A-4 により抽出段階で除外される
    expect(keys).toHaveLength(16);
    expect(keys[0]).toBe('f0');
    expect(keys[15]).toBe('f15');
    expect(fields.f0?.label).toBe('姓');
    expect(Object.values(fields).some((f) => f.type === 'checkbox')).toBe(false);
    expect(excludedCount).toBe(1);
  });
});

describe('extractFields: 除外ルール（DOM-EXTRACT-02〜11）', () => {
  it('DOM-EXTRACT-02: type=password を除外し、メール欄のみ残る', () => {
    setBody(buildFormBodyHtml(formById('login')));
    const { fields, excludedCount } = extractFields(document);
    const labels = Object.values(fields).map((f) => f.label);
    expect(labels).not.toContain('パスワード');
    expect(Object.values(fields).some((f) => f.type === 'password')).toBe(false);
    expect(Object.values(fields).some((f) => f.type === 'checkbox')).toBe(false);
    // login フィクスチャに password 欄はない（email + checkbox のみ）。
    // checkbox（ログイン状態保持）は A-4 により抽出段階で除外されるため excludedCount は 1
    expect(excludedCount).toBe(1);
    expect(Object.keys(fields)).toHaveLength(1);
  });

  it('DOM-EXTRACT-checkbox: checkbox は抽出段階で除外され excluded にカウントされる（レビュー指摘 A-4）', () => {
    setBody(`<form>
      <label>会社名<input type="text" name="company"></label>
      <label>メールマガジンを受け取る<input type="checkbox" name="mailmag"></label>
    </form>`);
    const { fields, excludedCount } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(1);
    expect(fields.f0?.name).toBe('company');
    expect(excludedCount).toBe(1);
  });

  it('DOM-EXTRACT-02b: password 欄を含む場合は除外され excludedCount に計上される', () => {
    setBody(`<form>
      <label>メール<input type="email" name="email"></label>
      <label>パスワード<input type="password" name="pw"></label>
    </form>`);
    const { fields, excludedCount } = extractFields(document);
    expect(Object.values(fields).some((f) => f.type === 'password')).toBe(false);
    expect(excludedCount).toBe(1);
  });

  it('DOM-EXTRACT-03: type=file を除外', () => {
    setBody(`<form><label>添付<input type="file" name="attachment"></label></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-04: type=hidden を除外', () => {
    setBody(`<form><input type="hidden" name="csrf" value="x"></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-05: cc-* 一式を除外し billing_zip のみ残る（payment フィクスチャ）', () => {
    setBody(buildFormBodyHtml(formById('payment')));
    const { fields, excludedCount } = extractFields(document);
    const names = Object.values(fields).map((f) => f.name);
    expect(names).toEqual(['billing_zip']);
    expect(excludedCount).toBe(5);
  });

  it('DOM-EXTRACT-06: autocomplete がなくてもカード関連ラベルで除外される', () => {
    setBody(`<form>
      <label>カード番号<input type="text" name="card_no"></label>
      <label>セキュリティコード<input type="text" name="csc"></label>
      <label>有効期限<input type="text" name="exp"></label>
      <label>備考<input type="text" name="memo"></label>
    </form>`);
    const { fields, excludedCount } = extractFields(document);
    expect(excludedCount).toBe(3);
    expect(Object.values(fields).map((f) => f.name)).toEqual(['memo']);
  });

  it('DOM-EXTRACT-07: readonly を除外', () => {
    setBody(`<form><label>会員番号<input type="text" name="member_id" readonly value="123"></label></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-08: disabled を除外', () => {
    setBody(`<form><label>会員番号<input type="text" name="member_id" disabled></label></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-09: 非表示要素（display:none）を除外', () => {
    setBody(`<form><label>隠し項目<input type="text" name="hidden_text" style="display:none"></label></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-10: aria-hidden 祖先を除外', () => {
    setBody(`<form><div aria-hidden="true"><label>隠し項目<input type="text" name="hidden2"></label></div></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-11: submit/button/image/reset を除外', () => {
    setBody(`<form>
      <input type="submit" value="送信">
      <input type="button" value="ボタン">
      <input type="image" src="x.png">
      <input type="reset" value="リセット">
      <button type="submit">送信2</button>
    </form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });
});

describe('extractFields: contenteditable / search（DOM-EXTRACT-12〜14）', () => {
  it('DOM-EXTRACT-12: contenteditable=true を textarea 相当として抽出', () => {
    setBody(`<form><label>本文<div contenteditable="true" name="body"></div></label></form>`);
    const { fields } = extractFields(document);
    expect(Object.values(fields)[0]?.tag).toBe('textarea');
  });

  it('DOM-EXTRACT-13: type=search（フォーム内）は対象', () => {
    setBody(`<form><label>検索語<input type="search" name="q"></label></form>`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(1);
  });

  it('DOM-EXTRACT-14: type=search（フォーム外）は除外', () => {
    setBody(`<input type="search" name="site-search">`);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });
});

describe('extractFields: 空フォーム・上限（DOM-EXTRACT-15/16）', () => {
  it('DOM-EXTRACT-15: フィールド 0 件なら fields が空オブジェクト', () => {
    setBody(EMPTY_FORM_HTML);
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('DOM-EXTRACT-16: 65 フィールドは先頭 60 件のみ、超過 5 件が返り値に含まれる', () => {
    setBody(buildLongFormHtml());
    const { fields, overLimitCount } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(MAX_FIELDS);
    expect(overLimitCount).toBe(5);
  });
});

describe('extractFields: 既存値の検出（E2E-EDGE-04 の前提確認）', () => {
  it('value 属性がある欄は currentValue=filled、ないものは empty', () => {
    setBody(buildPrefilledFormHtml());
    const { fields } = extractFields(document);
    expect(fields.f0?.currentValue).toBe('filled');
    expect(fields.f1?.currentValue).toBe('empty');
  });
});

/**
 * 実サイト（appreco.com のお問い合わせ、Pardot の iframe）で報告された事例。
 * ページの JS が都道府県・市区郡・番地の入力欄を「住所」行へ移し、元の行（label ごと）を削除した後の DOM。
 */
const PARDOT_ADDRESS_HTML = `
  <form>
    <div class="form-group row form-field zip pd-text required">
      <div class="formHeading col-sm-3">
        <label class="field-label col-form-label" for="zip_id">住所</label>
      </div>
      <div class="col-sm-9">
        <div class="formInputOuter zip">
          <div class="formInputInner zip">
            <input type="text" name="893021_217035pi_893021_217035" id="zip_id" class="text form-control" maxlength="32" placeholder="422-8067">
          </div>
          <div class="formInputInner state">
            <select name="893021_217038pi_893021_217038" id="state_id" class="select form-control">
              <option value="2125539" selected="selected"></option>
              <option value="2125542">北海道</option>
              <option value="2125605">静岡県</option>
            </select>
          </div>
          <div class="formInputInner city">
            <input type="text" name="893021_217041pi_893021_217041" id="city_id" class="text form-control" maxlength="40" placeholder="静岡市">
          </div>
          <div class="formInputInner address_one">
            <input type="text" name="893021_217044pi_893021_217044" id="addr_id" class="text form-control" maxlength="255" placeholder="駿河区南町11番1号 静銀・あいち銀静岡駅南ビル6階">
          </div>
        </div>
      </div>
    </div>
  </form>
`;

describe('extractFields: ラベルが切り離された住所欄（Pardot）', () => {
  it('入力欄を包む要素の class 名を hints として拾う（隣の項目の class は混ぜない）', () => {
    setBody(PARDOT_ADDRESS_HTML);
    const { fields } = extractFields(document);
    expect(fields.f0?.hints).toEqual(['zip']);
    expect(fields.f1?.hints).toEqual(['state']);
    expect(fields.f2?.hints).toEqual(['city']);
    expect(fields.f3?.hints).toEqual(['address_one']);
  });

  it('value はあるが表示が空の option が selected でも、select は未入力扱い', () => {
    setBody(PARDOT_ADDRESS_HTML);
    const { fields } = extractFields(document);
    expect(fields.f1?.currentValue).toBe('empty');
  });

  it('自動採番の name はラベルに使わない', () => {
    setBody(PARDOT_ADDRESS_HTML);
    const { fields } = extractFields(document);
    expect(fields.f1?.label).toBe('');
  });

  it('レイアウト用の class しかなければ hints は付けない', () => {
    setBody('<form><div class="form-group row col-sm-9"><input type="text" class="form-control" name="x"></div></form>');
    const { fields } = extractFields(document);
    expect(fields.f0?.hints).toBeUndefined();
  });
});

describe('extractFields: select の案内用 option', () => {
  function stateOf(optionsHtml: string) {
    setBody(`<form><select name="pref">${optionsHtml}</select></form>`);
    return extractFields(document).fields.f0?.currentValue;
  }

  it('「選択してください」「---」が selected 属性付きで先頭にあっても未入力', () => {
    expect(stateOf('<option value="0" selected>選択してください</option><option value="1">東京都</option>')).toBe('empty');
    expect(stateOf('<option value="x" selected>---</option><option value="1">東京都</option>')).toBe('empty');
    expect(stateOf('<option value="x" selected>Please select</option><option value="1">Tokyo</option>')).toBe('empty');
  });

  it('実在の選択肢が選ばれていれば入力済み', () => {
    expect(stateOf('<option value="">選択してください</option><option value="1" selected>東京都</option>')).toBe('filled');
  });
});
