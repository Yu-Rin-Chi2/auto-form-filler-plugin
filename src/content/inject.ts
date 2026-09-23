/**
 * 値注入（要件 5.4）。
 * - テキスト系: プロトタイプの value setter を直接呼び、input(insertText) → change を bubbles:true で発火。
 *   focus → 設定 → blur の順。
 * - select: value 設定 → input → change
 * - radio: 対象 option の click()
 * - contenteditable: textContent 設定 → input
 * - フィールド間で requestAnimationFrame を挟む
 * - submit / Enter は一切呼ばない
 * - 入力後しばらく、ページのスクリプトによる上書きを見張り、1 回だけ入れ直す（guardAgainstOverwrite）
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

function injectText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  el.focus();
  setNativeValue(el, value);
  // type=number / date 等は受け付けない形式の値を空にする（コンソールに警告が出るだけで例外にはならない）。
  // 入ったことにしないよう失敗として扱う
  if (value !== '' && el.value === '') {
    el.blur();
    return false;
  }
  dispatchInputEvent(el, 'insertText');
  dispatchChangeEvent(el);
  el.blur();
  return true;
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

// ---------------------------------------------------------------------------
// ページのスクリプトによる上書きへの対策
// 例: 郵便番号から住所を補完するスクリプト（jpostal / AjaxZip3 等）は、郵便番号欄の change を受けて
// 非同期に住所を引き、都道府県・市区町村・町名の欄を無条件に書き換える。引き終わるのが
// こちらの入力より後だと、入れた「番地＋建物名」が町名だけに上書きされる。
// ---------------------------------------------------------------------------

export interface OverwriteGuardOptions {
  durationMs: number;
  intervalMs: number;
}

const DEFAULT_GUARD: OverwriteGuardOptions = { durationMs: 2500, intervalMs: 100 };

interface GuardTarget {
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  /** 入力直後の DOM 上の値（select は option の value） */
  expected: string;
  done: boolean;
}

/** 表記の違いだけ（ハイフン・空白・全角半角）なら、ページ側の整形とみなして受け入れる */
function sameIgnoringFormat(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFKC').replace(/[\s\-‐‑–—―ー−]/g, '');
  return norm(a) === norm(b);
}

let activeGuard: Promise<void> = Promise.resolve();

/** テスト用: 直近の上書き見張りが終わるのを待つ */
export function waitForOverwriteGuard(): Promise<void> {
  return activeGuard;
}

function guardAgainstOverwrite(targets: GuardTarget[], options: OverwriteGuardOptions): Promise<void> {
  if (targets.length === 0 || options.durationMs <= 0) return Promise.resolve();
  // 利用者が自分で打ち始めた欄は見張りをやめる（isTrusted の input は人間の操作）
  const onUserInput = (e: Event) => {
    if (!e.isTrusted) return;
    const t = targets.find((x) => x.el === e.target);
    if (t) t.done = true;
  };
  for (const t of targets) t.el.addEventListener('input', onUserInput);

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      for (const t of targets) {
        if (t.done || t.el.value === t.expected) continue;
        if (!t.el.isConnected || t.el.ownerDocument.activeElement === t.el) {
          t.done = true;
          continue;
        }
        t.done = true; // 入れ直しは 1 回だけ（整形するスクリプトと取り合いにしない）
        if (sameIgnoringFormat(t.el.value, t.expected)) continue;
        if (t.el instanceof HTMLSelectElement) {
          setSelectValue(t.el, t.expected);
          dispatchInputEvent(t.el, 'insertReplacementText');
          dispatchChangeEvent(t.el);
        } else {
          setNativeValue(t.el, t.expected);
          dispatchInputEvent(t.el, 'insertText');
          dispatchChangeEvent(t.el);
        }
      }
      if (Date.now() - started >= options.durationMs || targets.every((t) => t.done)) {
        clearInterval(timer);
        for (const t of targets) t.el.removeEventListener('input', onUserInput);
        resolve();
      }
    }, options.intervalMs);
  });
}

export async function applyFill(
  assignments: Record<string, FillAssignment>,
  highlight: boolean,
  guard: OverwriteGuardOptions = DEFAULT_GUARD,
): Promise<ApplyFillResponse> {
  const filled: string[] = [];
  const failed: string[] = [];
  const guardTargets: GuardTarget[] = [];

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
      if (ok) {
        highlightTarget = registered;
        const select = registered as HTMLSelectElement;
        guardTargets.push({ el: select, expected: select.value, done: false });
      }
    } else if (assignment.kind === 'radio' && Array.isArray(registered)) {
      const field = getExtractedField(id);
      const clicked = injectRadio(registered, field?.options, assignment.value);
      ok = clicked !== null;
      highlightTarget = clicked;
    } else if (assignment.kind === 'text' && !Array.isArray(registered)) {
      if (isContentEditableElement(registered)) {
        injectContentEditable(registered, assignment.value);
        ok = true;
      } else {
        const input = registered as HTMLInputElement | HTMLTextAreaElement;
        ok = injectText(input, assignment.value);
        if (ok) guardTargets.push({ el: input, expected: input.value, done: false });
      }
      if (ok) highlightTarget = registered;
    }

    if (ok) {
      filled.push(id);
      if (highlight && highlightTarget) highlightElement(highlightTarget);
    } else {
      failed.push(id);
    }

    await waitFrame();
  }

  // 結果はすぐ返し、見張りは裏で続ける
  activeGuard = guardAgainstOverwrite(guardTargets, guard);
  return { filled, failed };
}
