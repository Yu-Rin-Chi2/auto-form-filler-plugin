import type { OptionsTabId } from '../shared/types';

export async function openOptions(tab?: OptionsTabId): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', tab });
  window.close();
}
