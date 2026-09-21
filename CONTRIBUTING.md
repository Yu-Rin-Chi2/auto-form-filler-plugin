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

`README.md` の「開発手順」を参照してください。

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Pull Request を送る前に

- `npm run typecheck` / `npm run test` / `npm run build` がすべて成功すること
- 新しい挙動には `tests/unit` または `tests/dom` にテストを追加すること
- `chrome.storage.sync` を呼び出すコードを追加しないこと
- フォームの `submit` を呼んだり `Enter` キー送信をトリガーするコードを追加しないこと
- カード情報・パスワードを扱う変更をしないこと

## リリース物を作るときの注意

- Chrome Web Store に提出するのは `npm run build` が生成する `dist/` を zip したものだけです。
- `npm run e2e` は `dist/` をコピーした `dist-e2e/` にローカルモックサーバー向けの
  `host_permissions` を追加してから拡張をロードします。`dist-e2e/` は E2E 専用のビルドで
  あり、`dist/` 自体は変更されません。**`dist-e2e/` は提出物に含めないでください。**

## バグ報告

Issue には、可能であれば「送信されたリクエスト JSON」を添付してください。デバッグ設定（オプション → 動作設定 →「送信内容をコンソールに出力する」）を有効にすると、拡張のコンソールにリクエスト JSON が出力されます。**この JSON にプロフィールの値は含まれません**が、念のため添付前にご自身で内容を確認してください。
