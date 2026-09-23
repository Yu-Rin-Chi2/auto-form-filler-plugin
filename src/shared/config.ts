/**
 * Jev プロキシ Worker の接続先。実装は `workers/` を参照。
 * ここを変更したら `public/manifest.json` の host_permissions も合わせること。
 */
export const DEFAULT_WORKER_ORIGIN = 'https://formfill.yrctool.stream';

export const INFER_PATH = '/v1/infer';

/** `Settings.workerEndpoint` は推論エンドポイントの完全な URL。未設定なら既定の Worker を使う */
export function resolveInferUrl(workerEndpoint?: string): string {
  return workerEndpoint?.trim() || `${DEFAULT_WORKER_ORIGIN}${INFER_PATH}`;
}
