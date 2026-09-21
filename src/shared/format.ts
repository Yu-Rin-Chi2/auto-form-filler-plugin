/** 表示用のフォーマット関数（純粋関数。Date.now() のみ副作用として利用） */

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function timeAgo(iso: string, locale: 'ja' | 'en', now: number = Date.now()): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return locale === 'ja' ? 'たった今' : 'just now';
  if (minutes < 60) return locale === 'ja' ? `${minutes}分前` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'ja' ? `${hours}時間前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === 'ja' ? `${days}日前` : `${days}d ago`;
}
