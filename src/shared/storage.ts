/**
 * chrome.storage.local のみを使う薄いラッパー。
 * chrome.storage.sync は絶対に呼ばない（要件 P1 / 02-nonfunctional 1.1）。
 */
import { DEFAULT_SETTINGS } from './types';
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
  return getItem<Profile[]>(STORAGE_KEYS.profiles, []);
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
  await setItems({ [STORAGE_KEYS.profiles]: profiles });
}

export async function getSettings(): Promise<Settings> {
  const stored = await getItem<Partial<Settings>>(STORAGE_KEYS.settings, {});
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
