# auto-form-filler-plugin

Jev（TypeSafe AI の判定特化モデル）でフォームの項目を判定し、ローカルに保持したプロフィールを自動入力する Chrome 拡張（Manifest V3）。OSS として公開予定。

- リポジトリ: https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin

## 要件定義書

- [docs/requirements/](docs/requirements/) を参照
  - [00-concept.md](docs/requirements/00-concept.md) — ビジョン、基本原則 P1〜P5、MVP 定義、スコープ外
  - [01-functional-requirements.md](docs/requirements/01-functional-requirements.md) — 機能一覧（MoSCoW）、データモデル、フロー、処理仕様、マニフェスト
  - [02-nonfunctional-requirements.md](docs/requirements/02-nonfunctional-requirements.md) — セキュリティ・プライバシー、性能、信頼性、互換性、OSS 公開、Web Store 要件
  - [03-uiux-definition.md](docs/requirements/03-uiux-definition.md) — ワイヤーフレーム、状態遷移、カラー、i18n

## 調査・PoC

- [docs/research/jev-spec.md](docs/research/jev-spec.md) — Jev の API / SDK 仕様、既存 OSS の実装パターン
- [docs/research/poc-jev-mapping-results.md](docs/research/poc-jev-mapping-results.md) — 対応付け精度 PoC の結果と設計への反映
- [poc/](poc/) — PoC スクリプト（API キーは `.env` に置き、`npm run poc:env` で実行）

## 技術スタック

- Chrome 拡張 Manifest V3、TypeScript（`strict`）、`@types/chrome`
- ビルド: Vite。エントリは popup / options（HTML + React）、background（ESM service worker）、content（**IIFE**。`chrome.scripting.executeScript` で注入するため `import` を含めない。別 config でビルド）
- UI: React 19（popup / options のみ。content script は素の DOM 操作）
- テスト: vitest（純粋関数）+ jsdom（DOM 抽出・注入）、Playwright（`--load-extension` で E2E、Jev はモック）
- i18n: UI 文言は `src/shared/i18n.ts` の実行時辞書（`Settings.locale` で日英切替。`chrome.i18n` はブラウザ言語固定で切替できないため不採用）。`public/_locales/{ja,en}/messages.json` は manifest の名前・説明・コマンド説明のみ。既定 `ja`
- Jev 呼び出し: 拡張は開発者が運用する Cloudflare Worker（`workers/`）に素の `fetch` で `POST /v1/infer` するだけ。API キーは持たない。**Jev への指示文・選択肢・モデル・レスポンス検証はすべて Worker 側の責務**で、拡張が送るのはフォーム項目のメタデータのみ。形式は `docs/requirements/01-functional-requirements.md` 5.2 に準拠
- Workers: `workers/` は独立した npm パッケージ。デプロイは `cd workers && npm run deploy`（wrangler CLI。Cloudflare MCP は OAuth が通らないため使わない）

## ディレクトリ構成

```
workers/           Cloudflare Workers の Jev プロキシ（独立パッケージ。wrangler でデプロイ）
public/            manifest.json, _locales/, icons/（そのまま dist/ へ）
src/
  shared/          型、メッセージ定義、プロフィールスキーマと派生項目、storage ラッパー、i18n ヘルパー
  background/      service worker: メッセージルータ、入力オーケストレーション、Jev クライアント、値の解決
  content/         実行時注入: フィールド抽出、ラベル解決、値注入、ハイライト/トースト
  popup/           React
  options/         React
tests/             vitest（unit / dom）
e2e/               Playwright + 固定 HTML フィクスチャ
poc/               Jev 精度 PoC（実 API を叩く。CI では実行しない）
docs/              requirements/, research/, test-scenarios/
```

## 開発コマンド

- `npm run dev` / `npm run build`（dist/ 生成）/ `npm run typecheck` / `npm run test`（vitest）/ `npm run e2e`（Playwright）
- 動作確認: `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」で `dist/` を指定

## 絶対に守ること

- プロフィールの値（氏名・住所・電話等）は `chrome.storage.local` のみ。Jev を含め外部に送らない。`chrome.storage.sync` 不使用
- Worker はリクエスト本文をログに出力しない（全利用者のリクエストが開発者のアカウントを通るため、これが利用者への約束になっている）
- 拡張 → Worker のスキーマに個人情報の値を入れる場所を作らない。`CustomField.value` を素通ししないこと（`toCustomFieldPayload` で id/label/description のみに詰め替える）。Worker 側も `sanitize.ts` のホワイトリストで二重に落とす
- Worker が Jev への指示文・選択肢を組み立てる設計を崩さない。呼び出し側に指定させるとフォーム入力以外の用途に転用できてしまう（エンドポイントは認証なしの公開 API）
- フォームを送信しない
- カード情報・パスワードは扱わない（観測段階で除外）
- `.env` はコミットしない。Claude は `.env` を読み書きしない（`--env-file` 経由で実行のみ）
