/**
 * 入力済みフィールドのハイライト（要件 5.4 / 03-uiux 3.9）。
 * outline のみを使用し、ページの CSS に干渉しない。DOM に新規属性は書き込まず、
 * 元のインラインスタイルは WeakMap で管理して 5 秒後に復元する。
 */

const ACCENT_COLOR = '#2563EB';
export const HIGHLIGHT_DURATION_MS = 5000;

interface OriginalOutline {
  outline: string;
  outlineOffset: string;
}

const originalStyles = new WeakMap<HTMLElement, OriginalOutline>();
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function highlightElement(el: HTMLElement): void {
  const existingTimer = timers.get(el);
  if (existingTimer) clearTimeout(existingTimer);

  if (!originalStyles.has(el)) {
    originalStyles.set(el, { outline: el.style.outline, outlineOffset: el.style.outlineOffset });
  }
  el.style.outline = `2px solid ${ACCENT_COLOR}`;
  el.style.outlineOffset = '2px';

  const timer = setTimeout(() => {
    clearHighlight(el);
  }, HIGHLIGHT_DURATION_MS);
  timers.set(el, timer);
}

export function clearHighlight(el: HTMLElement): void {
  const original = originalStyles.get(el);
  if (original) {
    el.style.outline = original.outline;
    el.style.outlineOffset = original.outlineOffset;
  }
  originalStyles.delete(el);
  const timer = timers.get(el);
  if (timer) clearTimeout(timer);
  timers.delete(el);
}
