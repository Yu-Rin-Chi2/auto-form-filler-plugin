/**
 * Shadow DOM 内のフォーム抽出と、クロスオリジン iframe の検出（frame_permission_needed の材料）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { extractFields } from '../../src/content/extract';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extractFields: Shadow DOM', () => {
  it('open な shadow root 内の入力欄を抽出し、shadow 内の label[for] / aria-labelledby を解決する', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <form>
        <label for="ln">姓</label><input id="ln" name="last_name" />
        <span id="em-label">メールアドレス</span><input aria-labelledby="em-label" type="email" name="email" />
      </form>
    `;
    // light DOM 側にも 1 件（DOM 順: host の shadow → 後続の兄弟）
    document.body.insertAdjacentHTML('beforeend', '<input name="tel" aria-label="電話番号" />');

    const { fields } = extractFields(document);
    const labels = Object.values(fields).map((f) => f.label);
    expect(labels).toEqual(['姓', 'メールアドレス', '電話番号']);
  });

  it('入れ子の shadow root も探索する', () => {
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    const outerShadow = outer.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    outerShadow.appendChild(inner);
    const innerShadow = inner.attachShadow({ mode: 'open' });
    innerShadow.innerHTML = '<input aria-label="市区町村" name="city" />';

    const { fields } = extractFields(document);
    expect(Object.values(fields).map((f) => f.label)).toEqual(['市区町村']);
  });

  it('closed な shadow root の中は到達できない（仕様上の限界）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = '<input aria-label="姓" />';

    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);
  });
});

describe('extractFields: クロスオリジン iframe の検出', () => {
  it('別オリジンの可視 iframe のオリジンを重複なく返し、同一オリジンは含めない', () => {
    // vitest(jsdom) の document.location は http://localhost:3000
    document.body.innerHTML = `
      <iframe src="https://connect-js.stripe.com/ui_layer_abc.html#x=1" style="width:600px;height:900px"></iframe>
      <iframe src="https://connect-js.stripe.com/other.html"></iframe>
      <iframe src="http://localhost:3000/same-origin.html"></iframe>
      <iframe src="about:blank"></iframe>
    `;
    const { crossOriginFrameOrigins, isTopFrame } = extractFields(document);
    expect(crossOriginFrameOrigins).toEqual(['https://connect-js.stripe.com']);
    expect(isTopFrame).toBe(true);
  });

  it('非表示の iframe は含めない', () => {
    document.body.innerHTML = `
      <iframe src="https://newassets.hcaptcha.com/captcha.html" style="display:none"></iframe>
      <div aria-hidden="true"><iframe src="https://hidden.example.org/x"></iframe></div>
    `;
    const { crossOriginFrameOrigins } = extractFields(document);
    expect(crossOriginFrameOrigins).toEqual([]);
  });

  it('src のない iframe や http(s) 以外の src は含めない', () => {
    document.body.innerHTML = `
      <iframe></iframe>
      <iframe src="javascript:void(0)"></iframe>
      <iframe src="data:text/html,<input>"></iframe>
    `;
    const { crossOriginFrameOrigins } = extractFields(document);
    expect(crossOriginFrameOrigins).toEqual([]);
  });
});
