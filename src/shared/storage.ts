/**
 * chrome.storage.local のみを使う薄いラッパー。
 * chrome.storage.sync は絶対に呼ばない（要件 P1 / 02-nonfunctional 1.1）。
 */
import { DEFAULT_SETTINGS } from './types';
import { normalizeProfile } from './profile-schema';
import type { FieldOutcome, FillResult, Profile, Settings } from './types';

const STORAGE_KEYS = {
  profiles: 'profiles',
  settings: 'settings',
  lastResult: 'lastResult',
  lastResultDetail: 'lastResultDetail',
} as const;

async function getItem<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return value === undefined ? fallback : (value as T);
}

async function setItems(items: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(items);
}

export async function getProfiles(): Promise<Profile[]> {
  // 旧バージョンで保存されたプロフィールは後から追加された項目を持たないため、読み込み時に補う
  const stored = await getItem<Profile[]>(STORAGE_KEYS.profiles, []);
  return stored.map(normalizeProfile);
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
  await setItems({ [STORAGE_KEYS.profiles]: profiles });
}

/** BYOK 時代の設定キー。見つけたら消す（古い API キーを端末に残したままにしないため） */
const LEGACY_SETTINGS_KEYS = ['provider', 'apiKey', 'model', 'baseUrl'] as const;

export async function getSettings(): Promise<Settings> {
  const stored = await getItem<Partial<Settings> & Record<string, unknown>>(STORAGE_KEYS.settings, {});
  const legacy = LEGACY_SETTINGS_KEYS.filter((key) => key in stored);
  if (legacy.length > 0) {
    for (const key of legacy) delete stored[key];
    await setItems({ [STORAGE_KEYS.settings]: stored });
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setItems({ [STORAGE_KEYS.settings]: settings });
}

export async function getLastResult(): Promise<FillResult | null> {
  return getItem<FillResult | null>(STORAGE_KEYS.lastResult, null);
}

export async function getLastResultDetail(): Promise<FieldOutcome[]> {
  return getItem<FieldOutcome[]>(STORAGE_KEYS.lastResultDetail, []);
}

export async function saveLastResult(result: FillResult, details: FieldOutcome[]): Promise<void> {
  await setItems({
    [STORAGE_KEYS.lastResult]: result,
    [STORAGE_KEYS.lastResultDetail]: details,
  });
}

export function onStorageChanged(
  callback: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    callback(changes, areaName);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export { STORAGE_KEYS };
