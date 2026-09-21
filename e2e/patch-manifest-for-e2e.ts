/**
 * E2E テスト専用: `dist/` を `dist-e2e/` にコピーし、コピー側の `manifest.json` にのみ
 * ローカルモックサーバー（127.0.0.1）への host_permissions を追加する。ソースの
 * `public/manifest.json` はもちろん、リリース物である `dist/manifest.json` にも一切触れない
 * （レビュー指摘 A-2: 以前は `dist/manifest.json` を直接書き換えており、`npm run e2e` 実行後に
 * `dist/` がそのまま zip されて提出されると、E2E 専用の host_permissions が
 * Chrome Web Store 提出物に混入してしまう問題があった）。
 *
 * 理由: `chrome.scripting.executeScript` / `chrome.tabs.sendMessage` は本来
 * `activeTab`（ツールバーアイコンのクリック等、実ユーザー操作でのみ付与される一時権限）で
 * 任意のページへ注入できるが、Playwright はブラウザのツールバー UI を操作できないため
 * activeTab を付与させる手段がない。そのため E2E 実行時のみ、テスト対象のローカル
 * モックサーバー（127.0.0.1）に対して恒久的な host_permissions を付与した `dist-e2e/` を
 * 別途用意し、本番の権限モデル（activeTab のみ・host_permissions は Jev API のみ）を保つ
 * `dist/` はそのままに E2E での注入を可能にする。Playwright（playwright.config.ts /
 * extension-fixture.ts）は `dist-e2e/` をロードする。
 *
 * 実行: npx tsx e2e/patch-manifest-for-e2e.ts
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const distE2eDir = join(root, 'dist-e2e');

if (!existsSync(distDir)) {
  throw new Error(`[patch-manifest-for-e2e] dist/ が見つかりません。先に npm run build を実行してください: ${distDir}`);
}

// dist-e2e/ は毎回作り直す（前回の E2E 実行の残骸を残さない）
rmSync(distE2eDir, { recursive: true, force: true });
cpSync(distDir, distE2eDir, { recursive: true });

const manifestPath = join(distE2eDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const extra = 'http://127.0.0.1/*';
if (!Array.isArray(manifest.host_permissions)) manifest.host_permissions = [];
if (!manifest.host_permissions.includes(extra)) {
  manifest.host_permissions.push(extra);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  `[patch-manifest-for-e2e] dist/ -> dist-e2e/ をコピーし、dist-e2e/manifest.json host_permissions -> ${JSON.stringify(manifest.host_permissions)}`,
);
console.log('[patch-manifest-for-e2e] dist/manifest.json は変更していません。');
