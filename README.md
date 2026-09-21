# Auto Form Filler

Jev（TypeSafe AI の判定特化モデル）でフォームの項目を判定し、ローカルに保存したプロフィールで自動入力する Chrome 拡張（Manifest V3）です。

氏名・フリガナ・住所・電話番号・生年月日など、日本語フォームでよく崩れる分割入力（電話 3 分割、郵便番号 2 分割、生年月日 3 select など）にも対応します。

**個人情報の値は端末の外に一切出しません。** Jev に送るのはフォーム項目のメタデータ（ラベル・name・type など）とプロフィールの「項目名」だけで、値そのものは送信しません。詳しくは [PRIVACY.md](PRIVACY.md) を参照してください。

## できること

- 複数プロフィールの作成・編集・削除・複製（個人用・会社用など切り替え）
- 姓名・フリガナ・ローマ字・住所・電話・郵便番号・生年月日・性別などの自動入力
- 電話番号 3 分割 / 郵便番号 2 分割 / 生年月日 3 select への自動分配
- select・radio の選択肢の表記ゆれ吸収（「東京」⇄「東京都」など）
- ポップアップのボタン、またはキーボードショートカット（既定 `Alt+Shift+F`）から実行
- 入力結果のハイライト表示とポップアップでの件数サマリ
- プロフィールの JSON インポート / エクスポート（API キーは含まれません）
- 日本語 / 英語 UI

対応していないこと（意図的なスコープ外）は [docs/requirements/00-concept.md](docs/requirements/00-concept.md) の「スコープ外」を参照してください（カード情報・パスワードの取り扱い、フォームの自動送信は行いません）。

## インストール

### Chrome Web Store（公開後）

準備中です。公開され次第リンクを追加します。

### GitHub Release から読み込む（ビルド不要・推奨）

1. [Releases](https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin/releases) ページから最新の `auto-form-filler-vX.Y.Z.zip` をダウンロードし、任意のフォルダに展開する。
2. Chrome で `chrome://extensions` を開く。
3. 右上の「デベロッパーモード」を有効にする。
4. 「パッケージ化されていない拡張機能を読み込む」から、展開したフォルダを選択する。
5. ツールバーに拡張のアイコンが表示されます。初回はオプションページが自動で開き、API キー設定へ進みます。

### ソースからビルドして読み込む（開発者向け）

1. このリポジトリを取得し、依存関係をインストールしてビルドします（後述の「開発手順」）。
2. Chrome で `chrome://extensions` を開く。
3. 右上の「デベロッパーモード」を有効にする。
4. 「パッケージ化されていない拡張機能を読み込む」から、このリポジトリの `dist/` フォルダを選択する。
5. ツールバーに拡張のアイコンが表示されます。初回はオプションページが自動で開き、API キー設定へ進みます。

## Jev の API キーを取得する

この拡張は BYOK（Bring Your Own Key）方式です。以下のいずれかのプロバイダでキーを取得し、オプションページの「API 設定」タブに設定してください。

### OpenRouter 経由（推奨・即時発行）

1. [openrouter.ai](https://openrouter.ai/) でアカウントを作成する。
2. 「Credits」で少額をチャージする（1 フォームあたり概算 0.03 円程度）。
3. 「Keys」で新しいキーを作成し、オプションページに貼り付ける。

### TypeSafe 直接（早期アクセス・ウェイトリスト制）

1. [console.typesafe.ai](https://console.typesafe.ai/) でアカウントを作成する。
2. 「API Keys」で新しいキーを作成し、オプションページに貼り付ける。

キーはこの端末の `chrome.storage.local` にのみ保存され、Jev API の呼び出し以外には使われません。エクスポートした JSON にも含まれません。

## プライバシー

送信する情報・しない情報の一覧は [PRIVACY.md](PRIVACY.md) にまとめています。要点:

- プロフィールの値（氏名・住所・電話番号・メールアドレスなど）は**一切外部に送信しません**。`chrome.storage.local` にのみ保存され、`chrome.storage.sync`（Google アカウント経由の同期）は使用しません。
- Jev に送るのは、フォーム項目のメタデータ（ラベル・`name`・`type`・`placeholder` など）と、プロフィール項目の「項目名」（例: 姓、メールアドレス）だけです。
- カード情報・パスワードは観測段階で除外し、読み取りもしません。
- フォームを自動送信することはありません（`submit` / Enter は一切呼びません）。

## 開発手順

### 必要要件

- Node.js 20 以上
- npm

### セットアップ

```bash
npm install
```

### 主なコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | Vite の開発サーバー（popup/options の単体確認用） |
| `npm run build` | `dist/` に本番ビルドを生成（popup / options / background / content） |
| `npm run typecheck` | TypeScript の型チェック |
| `npm run test` | vitest による単体テスト・DOM テスト |
| `npm run e2e` | ビルド後、Playwright で拡張をロードした E2E テストを実行 |
| `npm run render-icons` | `public/icons/` のアイコン PNG を再生成 |

### ディレクトリ構成

```
public/            manifest.json, _locales/, icons/（そのまま dist/ へコピー）
src/
  shared/          型、メッセージ定義、プロフィールスキーマと派生項目、storage ラッパー、i18n
  background/      service worker: メッセージルータ、オーケストレーション、Jev クライアント、値の解決
  content/         実行時注入: フィールド抽出、ラベル解決、値注入、ハイライト/トースト
  popup/           React
  options/         React
tests/             vitest（unit / dom）
e2e/               Playwright + 固定 HTML フィクスチャ + ローカルモックサーバー
poc/               Jev 精度 PoC（実 API を叩く。CI では実行しない）
docs/              requirements/, research/, test-scenarios/
```

### Jev への実通信について

`poc/` 配下の PoC スクリプトは実際に Jev API（TypeSafe / OpenRouter）へ通信します。本体（`src/`）のテスト（`npm run test` / `npm run e2e`）は実 API に一切通信しません（`npm run e2e` はローカルのモック HTTP サーバーを使います）。

### リリース手順（Chrome Web Store への提出）

1. `npm run build` を実行し、`dist/` を生成する。
2. `dist/` フォルダをそのまま zip する（提出するのはこの zip のみ）。
3. `dist-e2e/`（`npm run e2e` が生成する E2E 専用ビルド。ローカルモックサーバー向けの
   `host_permissions` が追加で入っている）は**提出しない**。`.gitignore` 対象でもあり、
   `dist/` とは別ディレクトリなので混入する心配はないが、手元にファイルが残っていても
   zip に含めないこと。
4. 提出前に `dist/manifest.json` の `host_permissions` が `api.typesafe.ai` /
   `openrouter.ai` の 2 件のみであることを確認する（`npm run e2e` を実行しても `dist/` は
   変更されない設計だが、念のため zip 化前に目視確認する）。

### コントリビュート

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。**プロフィールの値を外部に送信するような変更は受け付けません。**

## ライセンス

[MIT License](LICENSE)
