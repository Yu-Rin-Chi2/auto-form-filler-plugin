import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFields } from '../../src/content/extract';
import { highlightElement } from '../../src/content/highlight';
import { applyFill } from '../../src/content/inject';
import { resolveFill } from '../../src/background/resolve/resolve';
import { createEmptyProfileFields } from '../../src/shared/profile-schema';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function stubRaf(): { calls: number } {
  const counter = { calls: 0 };
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    counter.calls++;
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  });
  return counter;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('applyFill: テキスト注入（DOM-INJECT-01〜03）', () => {
  it('DOM-INJECT-01: ネイティブ setter 経由で value が反映される', async () => {
    stubRaf();
    setBody(`<label>姓<input type="text" name="last_name"></label>`);
    const setterSpy = vi.spyOn(window.HTMLInputElement.prototype, 'value', 'set');
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    await applyFill({ [id]: { kind: 'text', value: '山田' } }, false);
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('山田');
    expect(setterSpy).toHaveBeenCalledWith('山田');
  });

  it('DOM-INJECT-02: input(insertText) → change の順で bubbles:true のイベントが発火する', async () => {
    stubRaf();
    setBody(`<label>姓<input type="text" name="last_name"></label>`);
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    const input = document.querySelector('input') as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener('input', (e) => {
      events.push('input');
      expect(e.bubbles).toBe(true);
      expect((e as InputEvent).inputType).toBe('insertText');
    });
    input.addEventListener('change', (e) => {
      events.push('change');
      expect(e.bubbles).toBe(true);
    });
    await applyFill({ [id]: { kind: 'text', value: '山田' } }, false);
    expect(events).toEqual(['input', 'change']);
  });

  it('DOM-INJECT-03: focus → 設定 → blur の順で発生する', async () => {
    stubRaf();
    setBody(`<label>姓<input type="text" name="last_name"></label>`);
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    const input = document.querySelector('input') as HTMLInputElement;
    const order: string[] = [];
    input.addEventListener('focus', () => order.push('focus'));
    input.addEventListener('input', () => order.push('set'));
    input.addEventListener('blur', () => order.push('blur'));
    await applyFill({ [id]: { kind: 'text', value: '山田' } }, false);
    expect(order).toEqual(['focus', 'set', 'blur']);
  });
});

describe('applyFill: select / radio / contenteditable（DOM-INJECT-04〜06）', () => {
  it('DOM-INJECT-04: select は value 設定後に input→change が発火する', async () => {
    stubRaf();
    setBody(`<label>都道府県<select name="pref"><option value="">--</option><option value="tokyo">東京都</option></select></label>`);
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    const select = document.querySelector('select') as HTMLSelectElement;
    const events: string[] = [];
    select.addEventListener('input', () => events.push('input'));
    select.addEventListener('change', () => events.push('change'));
    await applyFill({ [id]: { kind: 'select', value: '東京都' } }, false);
    expect(select.value).toBe('tokyo');
    expect(events).toEqual(['input', 'change']);
  });

  it('DOM-INJECT-05: radio は対象 option の click() が呼ばれ checked になる', async () => {
    stubRaf();
    setBody(`
      <form>
        <label>男性<input type="radio" name="gender" value="male"></label>
        <label>女性<input type="radio" name="gender" value="female"></label>
      </form>
    `);
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    await applyFill({ [id]: { kind: 'radio', value: '女性' } }, false);
    const radios = Array.from(document.querySelectorAll('input[type=radio]')) as HTMLInputElement[];
    expect(radios[0]?.checked).toBe(false);
    expect(radios[1]?.checked).toBe(true);
  });

  it('DOM-INJECT-06: contenteditable は textContent 設定 + input 発火', async () => {
    stubRaf();
    setBody(`<label>本文<div contenteditable="true" name="body"></div></label>`);
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    const div = document.querySelector('[contenteditable]') as HTMLElement;
    let inputFired = false;
    div.addEventListener('input', () => {
      inputFired = true;
    });
    await applyFill({ [id]: { kind: 'text', value: 'こんにちは' } }, false);
    expect(div.textContent).toBe('こんにちは');
    expect(inputFired).toBe(true);
  });
});

describe('applyFill: requestAnimationFrame と submit 非呼び出し（DOM-INJECT-08/09）', () => {
  it('DOM-INJECT-08: フィールドごとに requestAnimationFrame を挟む', async () => {
    const raf = stubRaf();
    setBody(`
      <label>姓<input type="text" name="a"></label>
      <label>名<input type="text" name="b"></label>
      <label>メール<input type="email" name="c"></label>
    `);
    const { fields } = extractFields(document);
    const ids = Object.keys(fields);
    const assignments = Object.fromEntries(ids.map((id) => [id, { kind: 'text' as const, value: 'x' }]));
    await applyFill(assignments, false);
    expect(raf.calls).toBe(3);
  });

  it('DOM-INJECT-09: submit は一度も呼ばれず、Enter も送信をトリガーしない', async () => {
    stubRaf();
    setBody(`<form><label>姓<input type="text" name="a"></label></form>`);
    const submitSpy = vi.spyOn(window.HTMLFormElement.prototype, 'submit');
    let submitEventFired = false;
    document.querySelector('form')?.addEventListener('submit', () => {
      submitEventFired = true;
    });
    const { fields } = extractFields(document);
    const id = Object.keys(fields)[0] as string;
    await applyFill({ [id]: { kind: 'text', value: '山田' } }, false);
    expect(submitSpy).not.toHaveBeenCalled();
    expect(submitEventFired).toBe(false);
  });
});

describe('highlightElement: outline のみ・DOM属性非汚染（DOM-INJECT-10/11）', () => {
  it('DOM-INJECT-10: outline は適用されるが data-* 等の新規属性は追加されない', () => {
    setBody(`<input type="text" name="a">`);
    const input = document.querySelector('input') as HTMLInputElement;
    const beforeAttrs = input.getAttributeNames();
    highlightElement(input);
    expect(input.style.outline).toContain('solid');
    const afterAttrs = input.getAttributeNames();
    const newAttrs = afterAttrs.filter((a) => !beforeAttrs.includes(a));
    expect(newAttrs.every((a) => !a.startsWith('data-'))).toBe(true);
  });

  it('DOM-INJECT-11: 5 秒後に outline が解除される', () => {
    vi.useFakeTimers();
    setBody(`<input type="text" name="a">`);
    const input = document.querySelector('input') as HTMLInputElement;
    highlightElement(input);
    expect(input.style.outline).not.toBe('');
    vi.advanceTimersByTime(5000);
    expect(input.style.outline).toBe('');
  });
});

describe('applyFill: 既存値フィールド・checkbox は入力されない（DOM-INJECT-07/12）', () => {
  it('DOM-INJECT-12: currentValue=filled のフィールドは値解決結果に含まれず、注入もされない', async () => {
    stubRaf();
    setBody(`<label>姓<input type="text" name="last_name" value="既存の値"></label>`);
    const { fields } = extractFields(document);
    const { assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'family_name', confidence: 0.9 } },
      profileFields: { ...createEmptyProfileFields(), family_name: '山田' },
      settings: { confidenceThreshold: 0.7, overwriteFilled: false },
    });
    await applyFill(assignments, false);
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('既存の値');
  });

  it('DOM-INJECT-07: checkbox は抽出段階で除外され、resolveFill・注入のいずれにも渡らない（A-4）', async () => {
    stubRaf();
    setBody(`<label>メルマガ<input type="checkbox" name="mailmag"></label>`);
    // checkbox は extractFields の時点で除外される（fields は空になる）
    const { fields } = extractFields(document);
    expect(Object.keys(fields)).toHaveLength(0);

    // 万一 checkbox が fields に紛れ込んだ場合の防御として、resolveFill 自体も
    // 常に no_match 扱いにする（tests/unit/resolve.test.ts で個別に検証済み）。
    // ここでは extract→resolve→inject の一連の流れで checkbox に触れないことを確認する。
    const { assignments } = resolveFill({
      fields,
      answers: { f0: { choice: 'company', confidence: 0.99 } },
      profileFields: { ...createEmptyProfileFields(), company: 'ACME' },
      settings: { confidenceThreshold: 0.7, overwriteFilled: false },
    });
    expect(assignments.f0).toBeUndefined();
    await applyFill(assignments, false);
    const checkbox = document.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});
