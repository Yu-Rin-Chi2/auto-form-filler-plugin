/**
 * 完了トースト（要件 5.4 / 03-uiux 3.9）。Shadow DOM 内に描画し、ページのスタイルの影響を受けない。
 * メッセージは background が組み立てた複数行テキスト。1 行目（先頭の「✓」は除く）を見出し、
 * 2 行目以降を補足として表示する。クリックで閉じる。
 */

const TOAST_HOST_ID = '__auto-form-filler-toast-host__';
const TOAST_DURATION_MS = 5000;
const EXIT_DURATION_MS = 200;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** チェックマーク。Trusted Types を強制するページでも動くよう innerHTML を使わずに組み立てる */
function createCheckIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '3',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M20 6L9 17l-5-5');
  svg.appendChild(path);
  return svg;
}

const STYLE = `
  :host { all: initial; }
  .toast {
    --bg: #ffffff;
    --text: #111827;
    --muted: #6b7280;
    --border: rgba(15, 23, 42, 0.08);
    --accent: #2563eb;
    --success: #16a34a;
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    box-sizing: border-box;
    width: 300px;
    max-width: calc(100vw - 32px);
    padding: 14px 16px 16px 14px;
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 16px 40px -12px rgba(15, 23, 42, 0.35);
    font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
    font-size: 13px;
    line-height: 1.5;
    cursor: pointer;
    animation: enter 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .toast.is-leaving {
    animation: leave ${EXIT_DURATION_MS}ms ease-in forwards;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--success);
    color: #ffffff;
    box-shadow: 0 4px 10px -4px var(--success);
  }
  .content { min-width: 0; }
  .eyebrow {
    margin: 0 0 1px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }
  .body {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--muted);
    white-space: pre-line;
  }
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: linear-gradient(90deg, #2563eb, #4338ca);
    transform-origin: left center;
    animation: countdown ${TOAST_DURATION_MS}ms linear forwards;
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }
  @keyframes leave {
    to { opacity: 0; transform: translateY(8px); }
  }
  @keyframes countdown {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }
  @media (prefers-color-scheme: dark) {
    .toast {
      --bg: #1f2229;
      --text: #eceef2;
      --muted: #a1a7b3;
      --border: rgba(255, 255, 255, 0.08);
      --accent: #7aa7ff;
      --success: #22c55e;
      box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast, .toast.is-leaving { animation: none; }
    .progress { display: none; }
  }
`;

function removeExistingToast(): void {
  document.getElementById(TOAST_HOST_ID)?.remove();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function showToast(message: string): void {
  removeExistingToast();

  const host = document.createElement('div');
  host.id = TOAST_HOST_ID;
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.right = '16px';
  host.style.bottom = '16px';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;

  const [firstLine = '', ...restLines] = message.split('\n');
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = el('span', 'icon');
  icon.appendChild(createCheckIcon());
  const content = el('div', 'content');
  // content script は Settings.locale を持たないため、manifest 用の拡張名（ブラウザ言語）を使う
  content.appendChild(el('p', 'eyebrow', chrome.i18n?.getMessage('ext_name') || 'Form Fill: Instant'));
  content.appendChild(el('p', 'title', firstLine.replace(/^✓\s*/, '')));
  if (restLines.length > 0) content.appendChild(el('p', 'body', restLines.join('\n')));

  toast.appendChild(icon);
  toast.appendChild(content);
  toast.appendChild(el('div', 'progress'));

  shadow.appendChild(style);
  shadow.appendChild(toast);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    toast.classList.add('is-leaving');
    setTimeout(() => host.remove(), EXIT_DURATION_MS);
  };
  toast.addEventListener('click', close);
  setTimeout(close, TOAST_DURATION_MS);
}
