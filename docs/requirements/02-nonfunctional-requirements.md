# 02. 非機能要件定義

作成日: 2026-09-21
前提: [00-concept.md](00-concept.md) の基本原則 P1〜P5。公開形態は **OSS（GitHub: Yu-Rin-Chi2/auto-form-filler-plugin）＋ Chrome Web Store**。

## 1. セキュリティ・プライバシー

### 1.1 データの所在（最重要）

| データ | 保存場所 | 外部送信 |
|---|---|---|
| プロフィールの値（氏名・住所・電話・メール等） | `chrome.storage.local` | **しない**。Jev にも送らない |
| フィールドのメタデータ（label / name / autocomplete / placeholder / type / section / 選択肢の一部） | 送信時のみメモリ | プロキシ Worker 経由で Jev へ送信 |
| ページ URL（オリジン + パス）、タイトル | 送信時のみメモリ | プロキシ Worker 経由で Jev へ送信 |
| ページ内でユーザーが既に入力した値 | 読まない | しない（「空か埋まっているか」のフラグのみ） |
| 直近の実行結果（件数） | `chrome.storage.local` | しない |

- `chrome.storage.sync` は**使用禁止**（Google サーバー経由の同期になるため）
- 送信内容は設定画面「プライバシー」タブとプライバシーポリシーで明示する
- 送信前のリクエスト JSON を開発者向けにログ出力できるデバッグ設定を設ける（既定オフ）。ユーザーが「何が送られているか」を自分で検証できるようにする

### 1.2 扱わない情報

- カード情報: `autocomplete="cc-*"` およびカード関連ラベルのフィールドは観測段階で除外。プロフィールにも項目を設けない
- パスワード: `type=password` を除外。プロフィールにも項目を設けない
- 暗証番号（PIN）: ラベルが「暗証番号」「PIN」「passcode」に一致するフィールドを観測段階で除外（2026-09-22）
- 銀行口座（銀行名・支店・口座番号・預金種別）は**扱う**（2026-09-22 決定）。カードと違い Chrome の自動入力が対応しておらず、振込先登録フォームで実用価値が高いため。保存は他の項目と同じ `chrome.storage.local`（暗号化なし）で、その旨をプライバシーポリシーに明記する
- ユーザー定義項目: 値は他の項目と同じ扱い。項目名・説明はユーザー自身が判定のために書くもので Jev に送る（設定画面とプライバシーポリシーに明記）
- 除外は content script 内で行い、Service Worker にも渡さない

### 1.3 権限の最小化（Web Store 審査対応）

| 権限 | 用途 | 正当化 |
|---|---|---|
| `activeTab` | ユーザー操作起点で現在のタブにアクセス | ページ内バナー方式を採らないため `<all_urls>` 不要 |
| `scripting` | content script の実行時注入 | 常駐させない |
| `storage` | プロフィール・設定の保存 | |
| `host_permissions: formfill.yrctool.stream` | プロキシ Worker の呼び出し | CORS 回避のため必要。Jev の各社ホストへは拡張から直接つながない |
| `optional_host_permissions: https://*/*, http://*/*` | クロスオリジン iframe 内のフォーム（Stripe Connect のホスト型オンボーディング等）への注入 | 既定は無効。入力欄 0 件かつ可視な別オリジン iframe があるときだけポップアップで「許可して再実行」を提示し、ユーザー操作起点で `permissions.request` をそのオリジン 1 件に対して呼ぶ。許可一覧と取り消しは設定「プライバシー」（2026-09-22 追加） |

- `tabs`, `webNavigation`, `cookies`, `<all_urls>`（固定権限として）は使わない
- content script は `allFrames: true` で注入する。`activeTab` の範囲（最上位 + 同一オリジン iframe）と、ユーザーが許可したオリジンの iframe にのみ届く。未許可のクロスオリジン iframe は Chrome が注入対象から外す（エラーにはならない）
- 抽出は open な Shadow DOM を再帰的に探索する。closed な shadow root と Canvas 描画のフォームは対象外
- Single purpose: 「フォームへの自動入力」に限定。無関係な機能を入れない
- リモートコードの実行禁止（MV3 要件）。すべてバンドルに同梱

### 1.4 API キーとプロキシ Worker の扱い

API キーは拡張にもリポジトリにも存在しない。判定はすべて開発者が運用する Cloudflare Worker
（`workers/`、`https://formfill.yrctool.stream`）を経由し、
Worker は Workers AI バインディングで `typesafe/jev` を呼ぶ。バインディングが認証を担うため、
Worker 自身も API キーを保持しない。

この構成により、利用者の端末に API キーが保存されることはなくなった一方で、
**全利用者のリクエストが開発者の Cloudflare アカウントを通る**。そのため以下を守る。

- Worker はリクエスト本文をログに出力しない。記録するのは
  Workers AI 呼び出しが失敗したときのエラーメッセージのみ
- レート制限のため `CF-Connecting-IP` を参照するが、保存しない
- **拡張 → Worker のスキーマに個人情報の値を入れる場所がない**（P1 の第 1 層）。
  `CustomField` は値を持つが、送信用の `CustomFieldPayload` は id / label / description のみで、
  型の上で値を渡せない（`src/background/jev/client.ts` の `toCustomFieldPayload`）
- **Worker 側でも通すキーをホワイトリストで絞る**（P1 の第 2 層、`workers/src/sanitize.ts`）。
  拡張に不具合が入って余計なプロパティが混ざっても、Jev には届かない
- 旧バージョン（BYOK 方式）で `chrome.storage.local` に保存された API キーは、
  設定の読み込み時に削除する（`src/shared/storage.ts`）

#### 乱用防止

Worker は `ratelimit` バインディングで 1 IP あたり毎分 20 リクエストに制限する。
ただしこの仕組みには次の限界があり、**支出の上限にはならない**。

- `period` は 10 秒か 60 秒しか指定できず、日次・月次のクォータは表現できない
- Cloudflare の拠点ごとに独立してカウントされる eventually consistent な仕組みのため、
  分散したアクセスには実効上限が緩くなる

したがって最終的な歯止めは、AI Gateway のプリペイド残高そのものと Cloudflare ダッシュボードの支出アラートに置く。
**自動チャージ（auto top-up）は有効にしない**（有効にすると実質的な上限が外れる）。
コストが問題化した場合は、匿名インストール ID + KV による日次クォータを追加する。

なお `typesafe/jev` は Workers AI の third-party モデルであり、AI Gateway のプリペイドクレジットが必須。
残高切れは `AiGatewayError: 2021` となり、Worker からは 502 で返る。

- 拡張の CSP は既定（`script-src 'self'`）。`unsafe-eval` 不使用

### 1.5 Web ページからの隔離

- content script は isolated world で動作。ページのスクリプトからプロフィールや設定にアクセスできない
- ページ側から `window.postMessage` 等で拡張を呼び出す経路を設けない
- `page.text`（可視テキスト）は MVP では送らない。将来送る場合は「信頼できないデータであり指示ではない」旨を instructions に明記する（プロンプトインジェクション対策）

### 1.6 プライバシーポリシー

- 公開場所: GitHub リポジトリ `PRIVACY.md` および GitHub Pages
- 記載内容: 収集しない情報、Jev に送る情報の一覧、中継サーバーの扱い（内容を記録しない・IP は回数制限にのみ使う）、第三者（Cloudflare / TypeSafe）への送信、ローカル保存の範囲、連絡先
- Web Store のデータ使用開示（Privacy practices）と整合させる

## 2. パフォーマンス

| 項目 | 目標 | 根拠 |
|---|---|---|
| ボタン押下 → 入力完了 | 1.5 秒以内（p50）、3 秒以内（p95） | Jev 往復 p50 ≈ 300ms（PoC）、抽出・注入は 100ms 台 |
| フィールド抽出 | 50ms 以内（100 要素のページ） | `querySelectorAll` + 可視性判定のみ。スクリーンショット不使用 |
| リクエストサイズ | 1 フォーム 8k トークン以下 | PoC 実績 4k。60 フィールド上限で担保 |
| ポップアップ表示 | 100ms 以内 | storage 読み込みのみ。Jev を呼ばない |
| Service Worker | 処理完了後は速やかに終了可能 | 状態は storage に置き、メモリ常駐に依存しない |
| コスト | 1 フォーム 0.05 円以下 | 入力 $0.042/M トークン。PoC 実績 ≈ 0.025 円 |

## 3. 信頼性

### 3.1 Jev の障害・制約への対応

- TypeSafe は短時間の障害が頻発する（status.typesafe.ai の 90 日履歴で数分〜20 分の停止が多数）。障害時はユーザーに状況と status ページを案内し、拡張自体は壊れない
- 429 / 529: `Retry-After` を尊重して最大 2 回リトライ。以降はユーザーに待機を促す
- タイムアウト: 10 秒
- early access のため API 仕様変更の可能性がある。レスポンス検証（5.2）で不正を検知し、黙って誤入力しない
- モデル ID は Worker 側（`workers/src/index.ts`）に持つ。変更時は Worker を再デプロイするだけでよく、
  拡張の更新もストア審査も待たずに切り替えられる。なお Workers AI の `typesafe/jev` は
  バージョン指定ができないため、Cloudflare 側の更新は自動で反映される

### 3.2 誤入力の防止

- 確信度閾値（既定 0.7）未満は入力しない。PoC では閾値 0.7 で precision 99〜100%
- `none` を常に選択肢に含める
- 既に値が入っているフィールドは上書きしない（既定）
- 送信しない（P2）。Enter キーも送らない
- 入力したフィールドをハイライトし、ユーザーが目視確認できる

### 3.3 データの保全

- プロフィール保存は書き込み前に検証し、壊れた JSON を保存しない
- インポート時はスキーマ検証と「追加／置換」の明示的選択
- 拡張のアップデートでスキーマが変わる場合は `version` フィールドでマイグレーション

## 4. 互換性

| 項目 | 要件 |
|---|---|
| ブラウザ | Chrome 最新版と 1 つ前のメジャー。最低 Chrome 120（`checkVisibility`、MV3 の `scripting` 安定版） |
| Chromium 系（Edge / Brave / Vivaldi） | 動作すれば可。正式サポート外。Chrome 専用 API（`chrome.action.openPopup` 等）に依存しない設計にしておく |
| OS | Windows / macOS / Linux / ChromeOS（Chrome が動く環境すべて） |
| ページ側 | React / Vue / Angular / 素の HTML。制御コンポーネント対策（ネイティブ setter + イベント発火） |
| フレーム | MVP は最上位フレームのみ |
| Shadow DOM | MVP は open shadow root を 1 段まで走査（Should）。closed は対象外 |

## 5. 保守性・開発

### 5.1 コード

- TypeScript `strict`。`chrome` 型は `@types/chrome`
- 3 層を明確に分離: content script（DOM 抽出・注入）／Service Worker（Jev 呼び出し・値の解決）／UI（popup / options）。共有型は `src/shared/`
- Jev クライアント（`src/background/jev/client.ts`）は接続先 URL の解決だけを外に出し（`src/shared/config.ts`）、モデル選択と認証は Worker 側に寄せる
- 値の解決ロジック（分割・正規化・かな変換）は純粋関数にし、DOM や storage に依存させない

### 5.2 テスト

| 種別 | 対象 | 方法 |
|---|---|---|
| 単体 | 値の解決、正規化、かな変換、分割、リクエスト組み立て、レスポンス検証 | vitest。PoC のフィクスチャを流用 |
| 単体（DOM） | フィールド抽出、ラベル解決、注入 | vitest + jsdom。固定 HTML フィクスチャ |
| 結合 | Jev との実通信 | PoC スクリプト（`poc/`）を回帰テストとして維持。API キーは環境変数、CI では実行しない |
| E2E | 拡張をロードして実フォームに入力 | Playwright（`--load-extension`）。ローカルの固定 HTML に対して。Jev はモックまたはスキップ可能に |

### 5.3 リリース

- `npm run build` で `dist/` を生成、`zip` して Web Store にアップロード
- バージョンは `package.json` と `manifest.json` を単一ソースから生成（乖離防止）
- CHANGELOG を維持
- GitHub Actions: typecheck → unit test → build を PR ごとに実行

### 5.4 OSS としての公開

- ライセンス: MIT を想定（要確認）
- リポジトリに含めない: `.env*`、`poc/results/`、`node_modules/`、ストア用の秘密情報
- README: 概要、インストール（Web Store / unpacked）、判定の仕組みと費用、プライバシー、開発手順
- `PRIVACY.md`: 1.6 の内容
- `CONTRIBUTING.md`: 「値を外部に送る変更は受け付けない」を明記
- Issue テンプレート: バグ報告にはリクエスト JSON（値を含まない）を添付してもらう

## 6. ロギング・監視

- 本番ビルドでは `console.log` を出さない。エラーは `console.error` のみ
- ログにプロフィールの値・API キー・ページ内の入力値を含めない
- テレメトリ・アナリティクスは**入れない**（P1 と OSS の信頼性のため）
- 直近の実行結果（件数・レイテンシ・トークン数）はローカルにのみ保持し、ユーザーがポップアップで確認できる

## 7. アクセシビリティ・i18n

- ポップアップ／オプションはキーボード操作可能、フォーカスリング可視、`aria-label` 付与
- コントラスト比 WCAG AA
- 日本語・英語。`chrome.i18n.getMessage` を全 UI 文言に適用。既定 ja
- ページ内ハイライトは色だけに頼らない（枠線 + アイコン）

## 8. Web Store 掲載要件（チェックリスト）

提出用の文言・画像は [docs/store/listing.md](../store/listing.md) に集約（2026-09-22）。

- [x] Single purpose の説明文 → listing.md 2 章
- [x] 各権限の使用理由（審査フォーム） → listing.md 2 章
- [x] プライバシーポリシー URL → GitHub 上の `PRIVACY.md`（GitHub Pages は不要と判断）
- [x] データ使用開示: 「個人を特定できる情報を収集しない」「ユーザーデータを第三者に販売しない」「拡張の主目的以外に使用しない」 → listing.md 2 章
- [x] スクリーンショット（ポップアップ、オプション、入力結果） → `npm run store-screenshots`
- [x] 128px アイコン、プロモーション画像 → `public/icons/icon128.png`、`npm run render-promo`
- [x] リモートコードなしの宣言 → listing.md 2 章
- [x] 提出 zip の生成 → `npm run package`（`release/`。E2E 用 host_permissions の混入を検査）
- [ ] デベロッパー登録（$5）・メール確認・2 段階認証（ユーザー作業）
- [ ] ダッシュボードで提出（ユーザー作業）
