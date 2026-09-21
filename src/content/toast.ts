/**
 * 完了トースト（要件 5.4 / 03-uiux 3.9）。Shadow DOM 内に描画し、ページのスタイルの影響を受けない。
 */

const TOAST_HOST_ID = '__auto-form-filler-toast-host__';
const TOAST_DURATION_MS = 5000;

function removeExistingToast(): void {
  document.getElementById(TOAST_HOST_ID)?.remove();
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
  style.textContent = `
    .toast {
      font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
      font-size: 13px;
      line-height: 1.5;
      background: #1A1A1A;
      color: #FFFFFF;
      border-radius: 8px;
      padding: 10px 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.24);
      max-width: 280px;
      white-space: pre-line;
    }
  `;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  shadow.appendChild(style);
  shadow.appendChild(toast);

  setTimeout(() => {
    host.remove();
  }, TOAST_DURATION_MS);
}
