# PoC: Jev によるフォームフィールド → プロフィール項目の対応付け精度

拡張の本体設計（ワンショット fan-out）が日本語フォームで成立するかを確かめる。

## 何を測るか

- 各フォームを **1 リクエスト**で Jev に投げ、フィールドごとに「どのプロフィール項目を入れるべきか」を Choice で答えさせる
- 正解ラベル付きのフィクスチャ（日本語 6 フォーム + 英語 1 フォーム、約 70 フィールド）で精度を出す
- 3 バリアントを比較
  - `full`: label + name + autocomplete + placeholder + section（拡張が普通に取れる情報）
  - `label-only`: 日本語ラベルと tag/type のみ（属性名が無意味なフォームを想定した最悪ケース）
  - `full-ref`: `full` と同じ情報だが、項目の説明文を state に 1 回だけ置いてトークン節約
- あわせて `confidence` でゲートした場合の precision / coverage、レイテンシ、トークン数、概算コストを出す

プロフィールの**値は一切送らない**（項目名と説明だけ）。

## API キーの取得

| プロバイダ | 取得先 | 備考 |
|---|---|---|
| OpenRouter | https://openrouter.ai/keys | 即時発行。少額のクレジット購入が必要な場合あり。裏で TypeSafe に流れるので TypeSafe 障害時は使えない |
| TypeSafe 直接 | https://console.typesafe.ai/keys | ウェイトリスト制（早期アクセス） |
| Cloudflare Workers AI | https://dash.cloudflare.com/ → Workers AI → API トークン（`Workers AI - Read/Write`）とアカウント ID | Cloudflare 側で `typesafe/jev` をホスト。無料枠あり |

障害状況: https://status.typesafe.ai/

## 実行

API キーは環境変数で渡す。リポジトリ内のファイルには書かない。

### 方法 A: シェルの環境変数

```powershell
$env:OPENROUTER_API_KEY = "sk-or-..."
npm run poc:ping        # 疎通確認
npm run poc             # 本体
```

### 方法 B: `.env` ファイル（gitignore 済み）

プロジェクト直下に `.env` を作り、使うプロバイダの変数だけ書く:

```
OPENROUTER_API_KEY=sk-or-...
# TYPESAFE_API_KEY=...
# CLOUDFLARE_ACCOUNT_ID=...
# CLOUDFLARE_API_TOKEN=...
# JEV_PROVIDER=openrouter   # 複数設定しているときの明示
```

```powershell
npm run poc:ping:env
npm run poc:env
```

複数のキーを設定している場合、優先順位は TypeSafe > OpenRouter > Cloudflare。`JEV_PROVIDER=typesafe|openrouter|cloudflare` で明示できる。

オプション:

```powershell
npm run poc -- --variants full,label-only
npm run poc -- --forms ec-signup,contact-cf7
npm run poc -- --repeat 3      # 同じリクエストを繰り返して揺らぎを見る
npm run poc -- --dump          # API を呼ばずリクエスト JSON だけ results/ に書き出す
# .env を使う場合は poc:env に同じオプションを付ける
```

結果は `poc/results/run-<timestamp>.json` に保存される（gitignore 済み）。

## ファイル

| ファイル | 役割 |
|---|---|
| `profile-fields.ts` | プロフィール項目の定義（キー + 英日併記の説明） |
| `fixtures/forms.ts` | テスト用フォーム（正解付き） |
| `build-request.ts` | state / questions の組み立て（バリアント切替） |
| `jev-client.ts` | fetch ラッパー（プロバイダ切替、リトライ、回答検証） |
| `run.ts` | 実行と集計 |
| `ping.ts` | 疎通確認 |
