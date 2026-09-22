/**
 * content script エントリポイント。
 * `chrome.scripting.executeScript({ files })` で実行時注入される（content_scripts は宣言しない）。
 * 二重注入に耐えるよう、window 上のグローバルフラグで idempotent にする。
 */
import type { ApplyFillRequest, ContentRequest, PingResponse, ShowToastRequest, ShowToastResponse } from '../shared/types';
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
  // 自拡張以外（他拡張・ページ自身の postMessage 由来等）からのメッセージは無視する（レビュー指摘 A-3）。
  // 拡張の再読み込み・更新後に残った古い content script では chrome.runtime へのアクセス自体が
  // 「Extension context invalidated」を投げるため、その場合は黙って何もしない（タブ再読み込みで解消する）
  let selfId: string | undefined;
  try {
    selfId = chrome.runtime.id;
  } catch {
    return undefined;
  }
  if (sender.id !== selfId) return undefined;
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
    case 'SHOW_TOAST': {
      // 入力は複数フレームにまたがることがあるため、集計済みのトーストは background が
      // 最上位フレームにだけ送る（APPLY_FILL の toastMessage はフレーム内で入力があったときのみ）
      const req = message as ShowToastRequest;
      showToast(req.message);
      const response: ShowToastResponse = { shown: true };
      sendResponse(response);
      return undefined;
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
