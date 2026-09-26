/**
 * 入力済みフィールドのハイライト（要件 5.4 / 03-uiux 3.9）。
 * outline のみを使用し、ページの CSS に干渉しない。DOM に新規属性は書き込まず、
 * 元のインラインスタイルは WeakMap で管理して 5 秒後に復元する。
 * 出現時の「寄ってくる」動きと消える前のフェードは Web Animations API で付ける
 * （インラインスタイルを追加で書き換えずに済み、解除時は cancel するだけで元に戻る）。
 */

const ACCENT_COLOR = '#2563EB';
const ACCENT_TRANSPARENT = 'rgba(37, 99, 235, 0)';
export const HIGHLIGHT_DURATION_MS = 5000;
const ENTER_MS = 350;
const FADE_MS = 600;

interface OriginalOutline {
  outline: string;
  outlineOffset: string;
}

const originalStyles = new WeakMap<HTMLElement, OriginalOutline>();
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const animations = new WeakMap<HTMLElement, Animation[]>();

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function animate(el: HTMLElement): void {
  // jsdom 等 Web Animations API が無い環境や、動きを減らす設定では枠線だけにする
  if (typeof el.animate !== 'function' || prefersReducedMotion()) return;
  const enter = el.animate(
    [
      { outlineColor: ACCENT_TRANSPARENT, outlineOffset: '8px' },
      { outlineColor: ACCENT_COLOR, outlineOffset: '2px' },
    ],
    { duration: ENTER_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
  const fade = el.animate([{ outlineColor: ACCENT_COLOR }, { outlineColor: ACCENT_TRANSPARENT }], {
    duration: FADE_MS,
    delay: HIGHLIGHT_DURATION_MS - FADE_MS,
    fill: 'forwards',
    easing: 'ease-in',
  });
  animations.set(el, [enter, fade]);
}

function cancelAnimations(el: HTMLElement): void {
  for (const a of animations.get(el) ?? []) a.cancel();
  animations.delete(el);
}

export function highlightElement(el: HTMLElement): void {
  const existingTimer = timers.get(el);
  if (existingTimer) clearTimeout(existingTimer);
  cancelAnimations(el);

  if (!originalStyles.has(el)) {
    originalStyles.set(el, { outline: el.style.outline, outlineOffset: el.style.outlineOffset });
  }
  el.style.outline = `2px solid ${ACCENT_COLOR}`;
  el.style.outlineOffset = '2px';
  animate(el);

  const timer = setTimeout(() => {
    clearHighlight(el);
  }, HIGHLIGHT_DURATION_MS);
  timers.set(el, timer);
}

export function clearHighlight(el: HTMLElement): void {
  cancelAnimations(el);
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
