/** クエリ・フラグメントを除いた origin + pathname を返す（要件 5.2）。content / background 共用 */
export function normalizePageUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return rawUrl.split('?')[0]?.split('#')[0] ?? rawUrl;
  }
}
