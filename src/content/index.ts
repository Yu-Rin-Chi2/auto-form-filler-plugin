/**
 * content script エントリポイント。
 * `chrome.scripting.executeScript({ files })` で実行時注入される（content_scripts は宣言しない）。
 * 二重注入に耐えるよう、window 上のグローバルフラグで idempotent にする。
 */
import type { ApplyFillRequest, ContentRequest, PingResponse } from '../shared/types';
import { extractFields } from './extract';
import { applyFill } from './inject';
import { showToast } from './toast';

declare global {
  interface Window {
    __autoFormFillerInjected?: boolean;
  }
}

function handleMessage(
  message: ContentRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean | undefined {
  // 自拡張以外（他拡張・ページ自身の postMessage 由来等）からのメッセージは無視する（レビュー指摘 A-3）
  if (sender.id !== chrome.runtime.id) return undefined;
  if (!message || typeof message !== 'object') return undefined;

  switch (message.type) {
    case 'PING': {
      const response: PingResponse = { ready: true };
      sendResponse(response);
      return undefined;
    }
    case 'EXTRACT_FIELDS': {
      const result = extractFields(document);
      sendResponse(result);
      return undefined;
    }
    case 'APPLY_FILL': {
      const req = message as ApplyFillRequest;
      applyFill(req.assignments, req.highlight).then((result) => {
        if (result.filled.length > 0 && req.toastMessage) {
          showToast(req.toastMessage);
        }
        sendResponse(result);
      });
      return true; // 非同期でレスポンスすることを示す
    }
    default:
      return undefined;
  }
}

function init(): void {
  if (window.__autoFormFillerInjected) return;
  window.__autoFormFillerInjected = true;
  chrome.runtime.onMessage.addListener(handleMessage);
}

init();
