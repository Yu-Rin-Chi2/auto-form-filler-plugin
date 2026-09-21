/**
 * 値注入（要件 5.4）。
 * - テキスト系: プロトタイプの value setter を直接呼び、input(insertText) → change を bubbles:true で発火。
 *   focus → 設定 → blur の順。
 * - select: value 設定 → input → change
 * - radio: 対象 option の click()
 * - contenteditable: textContent 設定 → input
 * - フィールド間で requestAnimationFrame を挟む
 * - submit / Enter は一切呼ばない
 */
import type { ApplyFillResponse, FillAssignment } from '../shared/types';
import { getExtractedField, getRegisteredElement } from './extract';
import { highlightElement } from './highlight';

function dispatchInputEvent(el: HTMLElement, inputType: string): void {
  try {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, cancelable: true }));
  } catch {
    const ev = new Event('input', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
  }
}

function dispatchChangeEvent(el: HTMLElement): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function injectText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus();
  setNativeValue(el, value);
  dispatchInputEvent(el, 'insertText');
  dispatchChangeEvent(el);
  el.blur();
}

function injectContentEditable(el: HTMLElement, value: string): void {
  el.focus();
  el.textContent = value;
  dispatchInputEvent(el, 'insertText');
  dispatchChangeEvent(el);
  el.blur();
}

function setSelectValue(el: HTMLSelectElement, optionValue: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(el, optionValue);
  else el.value = optionValue;
}

function injectSelect(el: HTMLSelectElement, value: string): boolean {
  const option = Array.from(el.options).find((o) => (o.textContent?.trim() || o.value) === value);
  if (!option) return false;
  el.focus();
  setSelectValue(el, option.value);
  dispatchInputEvent(el, 'insertReplacementText');
  dispatchChangeEvent(el);
  el.blur();
  return true;
}

function injectRadio(elements: HTMLElement[], options: string[] | undefined, value: string): HTMLElement | null {
  if (!options) return null;
  const idx = options.indexOf(value);
  if (idx === -1) return null;
  const target = elements[idx];
  if (!target) return null;
  (target as HTMLInputElement).click();
  return target;
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function isContentEditableElement(el: HTMLElement): boolean {
  return el.getAttribute('contenteditable') === 'true';
}

export async function applyFill(
  assignments: Record<string, FillAssignment>,
  highlight: boolean,
): Promise<ApplyFillResponse> {
  const filled: string[] = [];
  const failed: string[] = [];

  for (const [id, assignment] of Object.entries(assignments)) {
    const registered = getRegisteredElement(id);
    let ok = false;
    let highlightTarget: HTMLElement | null = null;

    if (!registered) {
      failed.push(id);
      await waitFrame();
      continue;
    }

    if (assignment.kind === 'select' && !Array.isArray(registered)) {
      ok = injectSelect(registered as HTMLSelectElement, assignment.value);
      if (ok) highlightTarget = registered;
    } else if (assignment.kind === 'radio' && Array.isArray(registered)) {
      const field = getExtractedField(id);
      const clicked = injectRadio(registered, field?.options, assignment.value);
      ok = clicked !== null;
      highlightTarget = clicked;
    } else if (assignment.kind === 'text' && !Array.isArray(registered)) {
      if (isContentEditableElement(registered)) {
        injectContentEditable(registered, assignment.value);
      } else {
        injectText(registered as HTMLInputElement | HTMLTextAreaElement, assignment.value);
      }
      ok = true;
      highlightTarget = registered;
    }

    if (ok) {
      filled.push(id);
      if (highlight && highlightTarget) highlightElement(highlightTarget);
    } else {
      failed.push(id);
    }

    await waitFrame();
  }

  return { filled, failed };
}
