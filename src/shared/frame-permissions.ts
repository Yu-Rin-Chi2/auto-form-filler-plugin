/**
 * クロスオリジン iframe 用のオンデマンドなホスト権限（manifest の optional_host_permissions）の操作。
 *
 * - 許可はユーザーが明示的に「許可して再実行」を押したオリジンにのみ与える（Chrome の確認ダイアログが出る）
 * - `chrome.permissions.request` はユーザー操作起点（ポップアップ / オプションのクリック）でしか呼べない
 * - プロキシ Worker 用の固定 host_permissions（manifest 記載）は一覧・取り消しの対象にしない
 */
import { DEFAULT_WORKER_ORIGIN } from './config';

export function originToPattern(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/*`;
}

/**
 * manifest の host_permissions に固定で書いてあるオリジン。ユーザーが取り消す対象ではない。
 * manifest と二重管理にならないよう config から導出する
 */
const FIXED_ORIGIN_PATTERNS = new Set([originToPattern(DEFAULT_WORKER_ORIGIN)]);

/** `https://example.com/*` → `https://example.com`（表示用）。パターン以外はそのまま返す */
export function patternToOrigin(pattern: string): string {
  return pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern;
}

/** 表示用: `https://connect-js.stripe.com` → `connect-js.stripe.com` */
export function originToHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

export async function requestFrameOrigins(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  return chrome.permissions.request({ origins: origins.map(originToPattern) });
}

/** ユーザーが許可した iframe 用オリジンの一覧（固定のプロキシ Worker ホストを除く） */
export async function listGrantedFrameOrigins(): Promise<string[]> {
  const all = await chrome.permissions.getAll();
  return (all.origins ?? []).filter((p) => !FIXED_ORIGIN_PATTERNS.has(p)).map(patternToOrigin);
}

export async function revokeFrameOrigin(origin: string): Promise<boolean> {
  return chrome.permissions.remove({ origins: [originToPattern(origin)] });
}
