/**
 * e2e/fixtures/*.html を生成する。`tests/dom/fixtures.ts` の HTML 化ロジックを再利用し、
 * poc/fixtures/forms.ts のフォーム定義から実ファイルとして書き出す（固定 HTML フィクスチャ）。
 * 加えて、テストシナリオ 1 章の追加フィクスチャ（empty-form / long-form / prefilled-ec-signup /
 * wareki-birth-year / no-match-options）も同じロジックで書き出す。
 * 実行: npx tsx e2e/generate-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMS } from '../poc/fixtures/forms';
import {
  buildFormBodyHtml,
  buildLongFormHtml,
  buildPrefilledFormHtml,
  EMPTY_FORM_HTML,
  NO_MATCH_OPTIONS_HTML,
  WAREKI_BIRTH_YEAR_HTML,
} from '../tests/dom/fixtures';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'fixtures');
mkdirSync(outDir, { recursive: true });

// メインフロー相当のフィクスチャ（E2E-FLOW-*）。
// google-forms / job-apply / municipal-event / en-checkout はレビュー指摘 B-1 で追加。
const TARGET_IDS = [
  'ec-signup',
  'login',
  'payment',
  'contact-cf7',
  'hotel-booking',
  'google-forms',
  'job-apply',
  'municipal-event',
  'en-checkout',
];

function wrapHtml(title: string, lang: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

for (const id of TARGET_IDS) {
  const form = FORMS.find((f) => f.id === id);
  if (!form) throw new Error(`fixture not found: ${id}`);
  const html = wrapHtml(form.title, form.lang, buildFormBodyHtml(form));
  const outPath = join(outDir, `${id}.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`[generate-fixtures] wrote ${outPath}`);
}

// エッジケース用の追加フィクスチャ（テストシナリオ 1 章、レビュー指摘 B-2）
const EDGE_FIXTURES: Record<string, string> = {
  'empty-form': EMPTY_FORM_HTML,
  'long-form': buildLongFormHtml(),
  'prefilled-ec-signup': buildPrefilledFormHtml(),
  'wareki-birth-year': WAREKI_BIRTH_YEAR_HTML,
  'no-match-options': NO_MATCH_OPTIONS_HTML,
};

for (const [id, body] of Object.entries(EDGE_FIXTURES)) {
  const html = wrapHtml(id, 'ja', body);
  const outPath = join(outDir, `${id}.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`[generate-fixtures] wrote ${outPath}`);
}

// iframe 内フォーム用のホストページ（Stripe Connect のホスト型オンボーディングを模す）。
// iframe の src は URL のハッシュ（#src=...）で指定する。E2E ではモックサーバーを 2 つ起動し、
// 別ポート（= 別オリジン）の ec-signup.html を埋め込むことでクロスオリジン iframe を再現する。
// 最上位ページには言語切替の <select>（opacity:0）だけを置き、これは抽出対象外になることも確認する。
const IFRAME_HOST_HTML = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>iframe-host</title></head>
<body>
  <h1>アカウント設定</h1>
  <div style="position:relative;width:120px;height:24px">
    <span>日本語</span>
    <select name="locale" style="position:absolute;left:0;top:0;width:100%;height:100%;opacity:0">
      <option value="ja">日本語</option><option value="en">English</option>
    </select>
  </div>
  <div id="frame-slot"></div>
  <script>
    (function () {
      var m = /[#&]src=([^&]+)/.exec(location.hash);
      if (!m) return;
      var iframe = document.createElement('iframe');
      iframe.src = decodeURIComponent(m[1]);
      iframe.style.width = '800px';
      iframe.style.height = '900px';
      iframe.style.border = '0';
      document.getElementById('frame-slot').appendChild(iframe);
    })();
  </script>
</body>
</html>
`;
const iframeHostPath = join(outDir, 'iframe-host.html');
writeFileSync(iframeHostPath, IFRAME_HOST_HTML, 'utf8');
console.log(`[generate-fixtures] wrote ${iframeHostPath}`);
