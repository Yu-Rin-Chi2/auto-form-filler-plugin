# auto-form-filler-proxy

拡張から Jev（`typesafe/jev`）を呼ぶための Cloudflare Workers プロキシ。

利用者が API キーを自分で用意しなくても拡張を使えるようにするために置いている。
キーは拡張にもこのリポジトリにも存在しない。Workers AI バインディングが認証を担い、
利用料は Worker をデプロイした Cloudflare アカウントに課金される。

## エンドポイント

### `POST /v1/infer`

フォーム項目の「見た目」の情報を受け取り、どのプロフィール項目に対応するかを返す。

```jsonc
// リクエスト
{
  "page": { "url": "https://example.com/signup", "title": "会員登録", "lang": "ja" },
  "fields": {                                  // 最大 60 件
    "f0": { "tag": "input", "type": "text", "label": "お名前", "name": "name" }
  },
  "customFields": [                            // 任意。value は受け付けない
    { "id": "custom_ab12cd34", "label": "Twitter ID", "description": "handle starting with @" }
  ]
}
```

```jsonc
// レスポンス
{
  "model": "jev-1.13.0",
  "answers": { "f0": { "type": "choice", "choice": "full_name", "confidence": 0.99, "probabilities": {} } },
  "usage": { "input_tokens": 2577, "output_tokens": 874 }
}
```

| ステータス | 意味 |
| --- | --- |
| 400 | JSON が不正、`fields` が空、または 60 件を超えている |
| 404 / 405 | パスまたはメソッドの誤り |
| 413 | ボディが 64KB を超えている |
| 429 | レート制限（`Retry-After: 60` を返す） |
| 502 | Workers AI 側の失敗、または再送しても回答が不正（`invalid_response`） |

**Jev への指示文と選択肢はこの Worker が組み立てる**（`src/build-request.ts`）。
呼び出し側は判定内容を指定できないため、フォーム入力以外の用途には使えない。

### `GET /health`

`{ "ok": true }` を返すだけ。AI を呼ばないので疎通確認に使える。

## プライバシー上の約束

- **リクエスト本文をログに出力しない。** 障害調査のために記録するのは AI 呼び出しのエラーメッセージだけ
- レート制限のために `CF-Connecting-IP` を参照するが、保存はしない
  （Cloudflare の `ratelimit` バインディングが内部でカウントするのみ）
- **API のスキーマに個人情報の値を入れる場所がない。** `customFields` は id / label / description のみを
  受け取り、`value` は `src/sanitize.ts` のホワイトリストで落とす。フィールド情報も列挙したキーしか通さないため、
  拡張側に不具合が入って余計なプロパティが混ざっても Jev には届かない

## 乱用防止

`ratelimit` バインディングで 1 IP あたり毎分 20 リクエストに制限している（`wrangler.jsonc`）。

この仕組みには以下の限界がある。運用時はこれを踏まえること。

- `period` は 10 秒か 60 秒しか指定できず、**日次・月次のクォータは表現できない**
- Cloudflare の拠点ごとに独立してカウントされる eventually consistent な仕組みのため、
  分散したアクセスに対しては実効上限が設定値より緩くなる

したがって**バースト的な攻撃は防げるが、長期的な支出の上限にはならない**。
Cloudflare ダッシュボードで Workers AI の支出アラートを設定しておくこと。

## 開発

```sh
npm install
npm run typecheck
npm run dev      # ローカル（http://localhost:8787）
```

`src/` のうち Workers ランタイムに依存しないモジュール（`build-request` / `profile-fields` /
`sanitize` / `validate-response` / `infer`）は、リポジトリルートの vitest からテストしている
（`npm run test`。テスト基盤を二重に持たないため）。

`npm run dev` ではレート制限は動作しない（Cloudflare のネットワーク上でのみ有効）。

## デプロイ

```sh
npm run deploy
npm run tail     # 稼働中のログを見る
```

デプロイ先の URL を変更した場合は、拡張側の既定エンドポイント（`src/shared/config.ts`）と
`public/manifest.json` の `host_permissions` も合わせて更新すること。
