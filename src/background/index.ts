/**
 * Service Worker エントリポイント。メッセージルータ、onInstalled、キーボードショートカット。
 */
import { getSettings } from '../shared/storage';
import type { OptionsTabId, RuntimeRequest } from '../shared/types';
import { runFill } from './orchestrate';

const OPTIONS_URL_PATTERN = 'options.html*';

async function openOptions(tab?: OptionsTabId): Promise<void> {
  if (!tab) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  const url = chrome.runtime.getURL(`options.html#${tab}`);
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL(OPTIONS_URL_PATTERN) });
  const existingTab = existing[0];
  if (existingTab?.id !== undefined) {
    await chrome.tabs.update(existingTab.id, { url, active: true });
    if (existingTab.windowId !== undefined) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;

  switch (message.type) {
    case 'FILL_REQUEST':
      runFill(message.profileId).then(sendResponse);
      return true;
    case 'OPEN_OPTIONS':
      openOptions(message.tab).then(() => sendResponse({ ok: true }));
      return true;
    default:
      return undefined;
  }
});

// 初回インストール時にオプションページを開く（要件 4.2 / F-13）。
// API キー設定が不要になったので、最初にやることはプロフィール入力
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void openOptions('profiles');
  }
});

// キーボードショートカット（要件 4.3 / F-09）。前回のプロフィールで即実行する
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-form') return;
  const settings = await getSettings();
  if (!settings.lastProfileId) {
    // 誘導: バッジ表示でポップアップを開くよう促す（chrome.action.openPopup は制約があるため）
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
    return;
  }
  await chrome.action.setBadgeText({ text: '' });
  await runFill(settings.lastProfileId);
});
