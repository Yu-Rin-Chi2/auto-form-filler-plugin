# Contributing

Auto Form Filler への貢献に興味を持っていただきありがとうございます。

## 最重要の制約

**プロフィールの値（氏名・住所・電話番号・メールアドレスなどの個人情報）を、Jev API を含むいかなる外部サービスにも送信する変更は受け付けません。**

これは本拡張の中核となる設計原則（[docs/requirements/00-concept.md](docs/requirements/00-concept.md) の P1）であり、例外はありません。「精度が上がるから」「体験が良くなるから」という理由であっても、値を送信するフォールバック（select の選択肢マッチングを Jev に投げる、等）は採用しません。Pull Request がこの制約に抵触する場合、内容にかかわらずクローズします。

迷ったときは以下を確認してください。

- Jev（`src/background/jev/`）に送るのは、フィールドの**メタデータ**（ラベル・`name`・`type`・`placeholder` など）と、プロフィール項目の**説明文**のみか
- `state.profile` や `criteria` に実際の値（ユーザーが入力した氏名や住所など）を埋め込んでいないか
- テスト（`UNIT-REQ-02` 相当）で「リクエスト本文にプロフィールの実値が含まれないこと」を検証しているか

## 開発の始め方

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
| `npm run package` | ビルド後、Web Store / GitHub Release 提出用の zip を `release/` に生成 |
| `npm run store-screenshots` | Web Store 掲載用スクリーンショット（1280×800）を `docs/store/screenshots/` に生成（Jev はモック） |
| `npm run render-promo` | Web Store 用プロモタイル（440×280）を `docs/store/promo/` に生成 |

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

## Pull Request を送る前に

- `npm run typecheck` / `npm run test` / `npm run build` がすべて成功すること
- 新しい挙動には `tests/unit` または `tests/dom` にテストを追加すること
- `chrome.storage.sync` を呼び出すコードを追加しないこと
- フォームの `submit` を呼んだり `Enter` キー送信をトリガーするコードを追加しないこと
- カード情報・パスワードを扱う変更をしないこと

## リリース物を作るときの注意

- Chrome Web Store に提出するのは `npm run package` が生成する
  `release/auto-form-filler-v<version>.zip`（`dist/` の中身）だけです。
  `package` は `manifest.json` の `host_permissions` が Jev API の 2 ホストのみであることを検査し、
  それ以外が含まれていれば失敗します。
- 掲載文・権限の説明・審査者向けメモは [docs/store/listing.md](docs/store/listing.md) にまとめています。
- `npm run e2e` は `dist/` をコピーした `dist-e2e/` にローカルモックサーバー向けの
  `host_permissions` を追加してから拡張をロードします。`dist-e2e/` は E2E 専用のビルドで
  あり、`dist/` 自体は変更されません。**`dist-e2e/` は提出物に含めないでください。**
- バージョンを上げるときは `package.json` の `version` を変更し（`manifest.json` はビルド時に同期）、
  `CHANGELOG.md` にエントリを追加してください。

## バグ報告

Issue には、可能であれば「送信されたリクエスト JSON」を添付してください。デバッグ設定（オプション → 動作設定 →「送信内容をコンソールに出力する」）を有効にすると、拡張のコンソールにリクエスト JSON が出力されます。**この JSON にプロフィールの値は含まれません**が、念のため添付前にご自身で内容を確認してください。
