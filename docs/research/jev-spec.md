# Jev（TypeSafe AI System One Model）仕様調査レポート

調査日: 2026-09-21
目的: Chrome 拡張「あらかじめ登録したユーザー情報を Jev の判断でフォームに自動入力する」（BYOK 型）の実現可能性と設計方針を固めるための一次調査。

凡例: **[事実]** = 公式ドキュメント／公開ソースコードで確認済み（出典付き）、**[推測]** = 調査結果からの解釈・提案。

---

## 1. Jev とは

**[事実]**

| 項目 | 内容 |
|---|---|
| 提供元 | TypeSafe AI（サンフランシスコ） |
| 位置づけ | 「System One Model」第一弾。文章を生成せず、`state` に対する型付き質問（Choice / Score / Noul）に**確率付きの判定**を返す判定特化モデル |
| リリース | 2026-09-15 早期アクセス公開、2026-09-18 に Jev 1.13 |
| 公式サイト | https://typesafe.ai/ |
| 発表ブログ | https://typesafe.ai/blog/introducing-system-one-models-and-jev |
| ドキュメント | https://docs.typesafe.ai/ （`/llms-full.txt` で全文取得可） |
| コンソール | https://console.typesafe.ai/ |
| JS SDK | `@typesafe-ai/sdk` v0.6.0 — https://github.com/typesafe-ai/typesafe-sdk-js |

**早期アクセスはウェイトリスト制** [事実]: 公式ブログに "opening early access and bringing developers off the waitlist as quickly as we can" と明記。即時発行ではない。

---

## 2. API 仕様

### 2.1 エンドポイント・認証

**[事実]** 出典: https://docs.typesafe.ai/api

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

モデル一覧: `GET https://api.typesafe.ai/v1/models`

| Status | 意味 |
|---|---|
| 401 | API キー不正／欠落 |
| 422 | バリデーション失敗 |
| 429 | レート制限（`Retry-After` / `retry-after-ms` ヘッダあり） |
| 529 | 過負荷 |

レスポンスヘッダ `x-typesafe-request-id` でリクエスト ID を取得可。

### 2.2 リクエスト／レスポンスの基本形

```json
// Request
{
  "state": "<string | object | array>",
  "model": "jev-latest",
  "questions": {
    "<任意のキー>": { "type": "choice|score|noul", "instructions": "...", "criteria": ... }
  }
}

// Response
{
  "model": "jev-1.13.0",
  "answers": { "<キー>": { "type": "...", ... } },
  "usage": { "input_tokens": 328, "output_tokens": 34 }
}
```

質問のキーはユーザーが自由に決め、モデルには送られない（コード側での対応付け用）。

### 2.3 3 種の質問タイプ

**[事実]** 出典: https://docs.typesafe.ai/primitives

| Type | 用途 | `criteria` | レスポンス |
|---|---|---|---|
| **Choice** | 選択肢から 1 つ選ぶ | `map<string, string\|object\|array\|null>`（**最大 255 件**） | `choice`, `probabilities`（全選択肢の分布、合計 1）, `confidence`（0〜1） |
| **Score** | 順序付きルーブリック上の位置 | `array`（2〜10 段階） | `score`（確率加重平均、小数）, `legend`, `probabilities`, `confidence` |
| **Noul** | Yes/No の確率 | `{true?, false?}`（省略可） | `noul`（Yes の確率 0〜1、`confidence` なし） |

#### Choice の例

```json
// Request
{
  "state": "Help! My payouts have been failing for 3 days.",
  "model": "jev-latest",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": {
        "billing": "Payments, invoicing, refunds",
        "technical": "Bugs, outages, integrations",
        "sales": "Pricing, upgrades, new accounts"
      }
    }
  }
}
// Response
{
  "model": "jev-1.13.0",
  "answers": {
    "department": {
      "type": "choice",
      "choice": "billing",
      "confidence": 1.0,
      "probabilities": { "billing": 1.0, "technical": 0.0, "sales": 0.0 }
    }
  },
  "usage": { "input_tokens": 328, "output_tokens": 34 }
}
```

#### Noul の例

```json
// Request
{ "state": "...", "model": "jev-latest",
  "questions": { "is_urgent": { "type": "noul", "instructions": "Does this convey urgency?",
    "criteria": { "true": "Explicitly time-sensitive", "false": "No urgency expressed" } } } }
// Response
{ "model": "jev-1.13.0", "answers": { "is_urgent": { "type": "noul", "noul": 0.95 } }, "usage": {...} }
```

**注意 [事実]**: Choice / Score / Noul 間で数値の整合性は保証されない（同じ問いを Noul と 2 択 Choice で聞くと値が一致しないことがある）。閾値は型ごとに調整する。出典: https://docs.typesafe.ai/model-jaggedness/jev-1.13

### 2.4 `state` の制約

**[事実]** 出典: https://docs.typesafe.ai/concepts/state, https://docs.typesafe.ai/models

- 形式: string / JSON object / JSON array
- **テキストのみ**。画像・音声・動画は非対応（"not supported (yet)"）
- `instructions` 内でバッククォート付きパスで state の一部を参照できる（例: `` `fields[0].label` ``）
- コンテキスト上限: リクエスト全体 64k トークン、**`state` + 最長の 1 問 = 32k トークン**（Cloudflare / OpenRouter の表示は 32k。安全側として 32k を上限扱いにする）
- **言語: 英語が主要学習言語。CJK を含む他言語は「現状精度が低い」と公式明記** ← 日本語フォームで最大のリスク

### 2.5 複数質問の同送（Fan-Out）

**[事実]** 出典: https://docs.typesafe.ai/patterns/fan-out, https://docs.typesafe.ai/cookbooks/parallel_questions

- 1 リクエストの `questions` に任意個の質問を詰められる（上限はトークン予算のみ）
- 全質問は独立・並列に評価される。「使うかもしれない質問」も先に混ぜて、不要な回答は捨てる Speculative Fan-Out が公式推奨
- ベンチマーク: 13 問を 1 回にまとめると個別 13 回呼び出しに比べ **12.2 倍安く、10.0 倍速い**
- ストリーミングなし。複数 `state` を 1 回で評価するバッチ API もなし（複数レコードは「1 レコード 1 質問」に展開して同じ state に投げる）

### 2.6 レート制限・レイテンシ・料金

**[事実]**

- レート制限（暫定、予告なく変更あり）: 250,000 tokens/秒、1,200 requests/分
- レイテンシ: 公式 70〜500ms（"Most queries complete in about 100 ms"）。OpenRouter 実測 P50 ≈ 0.23〜0.28s
- 料金: **入力 $0.042 / 1M トークン、出力無料**。1 判定あたり概算 $0.0004 前後

---

## 3. JavaScript SDK（`@typesafe-ai/sdk` v0.6.0）

**[事実]** 出典: https://github.com/typesafe-ai/typesafe-sdk-js の `src/*.ts`

```ts
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({
  apiKey: "...",                        // 省略時は env TYPESAFE_API_KEY
  baseURL: "https://api.typesafe.ai",   // OpenRouter 経由なら "https://openrouter.ai/api"
  defaultModel: "jev-latest",
  timeout: 10000,                       // 1 試行あたり ms
  retry: { maxRetries: 2, /* backoff, respectRetryAfter ... */ },
  fetch: customFetch,                   // 既定はグローバル fetch
  dangerouslyAllowBrowser: false,       // window.document がある環境では true が必須
});

const result = await client.systemOne({
  state: {...},
  questions: {
    f1: choice("Which profile key fills this field?", { family_name: "...", none: "..." }),
    risky: noul("Is this a payment form?"),
  },
});
result.answers.f1.choice; // 型推論される
```

- コアメソッドは `client.systemOne()` のみ（+ `client.models.list()`）。`APIPromise` は `.withResponse()` で `requestId` 等を取れる
- エラークラス: `AuthenticationError(401)` / `RateLimitError(429, retryAfterMs)` / `UnprocessableEntityError(422)` / `APIConnectionError` / `APITimeoutError` など
- **Chrome 拡張での動作可否 [事実（ソース解析）]**:
  - `isBrowser()` は `window.document` と `navigator` の存在で判定 → **MV3 service worker では `false` になり、追加設定なしで動く見込み**
  - content script（`window.document` あり）では `dangerouslyAllowBrowser: true` が必要
  - Node 専用 API（`fs` 等）への依存なし。`process.env` は `typeof process` ガード付き
  - 実機検証はしていない [推測]
- 公式 SKILL.md には "Keep API credentials server-side in web apps." とあり、ブラウザ直叩きは公式の推奨ではない。BYOK は「ユーザー自身のキーをユーザー自身のブラウザで使う」という位置づけで、設定画面にその旨を明示する

---

## 4. プロバイダの選択肢（BYOK で受け付けるキー）

**[事実]**

| プロバイダ | エンドポイント | 認証 | 備考 |
|---|---|---|---|
| TypeSafe 直接 | `POST https://api.typesafe.ai/v1/systemone` | `Bearer <TypeSafe key>` | ウェイトリスト制。本家の形式 |
| OpenRouter | `POST https://openrouter.ai/api/v1/systemone`（公式 docs） | `Bearer <OpenRouter key>` | モデル ID `typesafe/jev-1.13`。レスポンスに `id`, `provider`, `usage.cost` が追加。**OpenRouter キーは即時発行可能** |
| Cloudflare Workers AI | `POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run` | `Bearer <CF token>` | `{ "model": "typesafe/jev", "input": { state, questions } }` と **`input` でラップされる**点が異なる |

注意: 非公式拡張 `jev-for-chrome` は OpenRouter に `/api/alpha/decisions` を使っているが、OpenRouter 公式ドキュメントは `/api/v1/systemone` を案内している。実装時にどちらが有効か要確認。

**[推測]** TypeSafe 直接キーがウェイトリスト制である以上、BYOK の実用性を担保するには **OpenRouter キー対応が実質必須**。TypeSafe 直接 / OpenRouter の 2 プロバイダ対応を第一候補とし、Cloudflare は任意。

---

## 5. 公式の設計思想（重要）

**[事実]** 出典: https://docs.typesafe.ai/concepts/how-to-build-with-system-one

> "System One is TypeSafe's model for building AI-powered software, **not agents**. It does not generate code or choose its own next action."
> "Avoid agent `while` loops when a software workflow can express the same behavior."

3 アーキテクチャの対比:

| 方式 | 説明 |
|---|---|
| 従来ソフトウェア | 決定木 |
| LLM エージェント | 次の一手を自分で選ぶ。ループごとに脱線リスクが増える |
| **AI-powered software（推奨）** | **コードが制御フローを持ち、常識判断が必要な箇所だけモデルを呼ぶ。各 AI タスクはアトミックで制約されている** |

公式にはブラウザ操作・DOM・フォーム入力のサンプルは存在しない（Wikiracing / Doom デモはソース非公開）。

**[推測]** 本プロジェクトは「フォームのフィールド列挙はコードが決定的に行い、各フィールドに『どのプロフィール項目を入れるか』を Choice で聞き、全フィールド分を 1 リクエストにまとめる」という**ワンショット fan-out 構成**が公式思想に最も素直に沿う。observe→decide→act のエージェントループは不要。

---

## 6. 既存 OSS の実装パターン

いずれも TypeSafe **非公式**のコミュニティ実装（2026-09-16〜18 に立ち上がった新規リポジトリ）。

### 6.1 `chy4pro/jev-for-chrome`（MV3 Chrome 拡張、MIT、★12）

- **BYOK 構成の実例**: service worker から各プロバイダに直接 `fetch`。キーは `chrome.storage.local` の `jev_settings` に保存。`host_permissions: ["<all_urls>"]` により CORS 制約なしで動作している
- manifest: `permissions: ["storage","activeTab","scripting","tabs","debugger"]`、content script は `<all_urls>` / `document_end`、popup 方式（side panel 不使用）
- 質問設計: `operation`（Choice: CLICK/TYPE_TEXT/SELECT/SCROLL/DONE/BLOCKED…）と `{op}_target`（Choice: 対象要素）を分離して同送 + `goal_done` / `stuck`（Noul）でクロスチェック。Score は未使用
- **値の生成は別の小型 LLM**（DeepSeek 等、OpenAI 互換 `/chat/completions`）。「ユーザー情報を事前登録して自動入力する」機能は存在しない
- DOM シリアライズ: `a[href],button,input,textarea,select,[role=...]` を走査、`password`/`file`/`hidden` は**観測段階で除外**、可視テキスト 6,000 文字・要素 250 件でキャップ、直近の見出しを `section` として付与。スクリーンショット不使用
- アクション実行: 既定は `chrome.debugger`（CDP `Input.insertText` 等）による trusted input、失敗時は合成イベントにフォールバック。React 対策として `HTMLInputElement.prototype` の value setter を直接呼ぶ
- 回答の厳格バリデーション（`probabilities` 合計 1±0.02、`choice` が最大確率と一致）。不正なら 1 回だけ再試行、2 回連続で停止
- ビルド: Vite 8 + TypeScript + React 19、vitest、Playwright E2E

### 6.2 `browser-use/jev-ultrafast`（Python 参照実装、★13k）

- 「2 つの意思決定を 1 往復」: `operation` と全 `*_target` ヘッドを投機的に同送し、選ばれた operation のヘッドだけ採用
- Noul を廃止し Choice のみに統一（DONE/BLOCKED は operation の選択肢に統合）
- **SELECT は各 `<option>` を Choice の選択肢として列挙**（値生成なし）。チェックボックスは CLICK に統合し `checked` 状態を渡す
- 値生成は別 LLM。完了判定は Jev の DONE を信用せず独立した `verify()` で裏取り
- 実測: Google Flights 検索で Jev 17 リクエスト、中央値レイテンシ 178ms
- 制約: shadow DOM / iframe / canvas 非対応

### 6.3 `Ying-Kai-Liao/jev-browser`（TypeScript ライブラリ/CLI/MCP、★61）

- **値は呼び出し元が `values` 辞書として渡し、Jev は「どのキーを使うか」を Choice で選ぶだけ** ← 本プロジェクトに最も近い方式

  ```js
  common.value = {
    type: "choice",
    instructions: "If the next action toward `task.goal` types, selects or uploads something, which of `task.values` should it use? Prefer values not yet entered on `page`.",
    criteria: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v).slice(0, 200)])),
  };
  ```

- 1 ラウンドに `done` / `blocked` / `error` / `login` / `irreversible`（Noul）+ `tool` / `target` / `value`（Choice）を同送
- `irreversible`（不可逆操作か）を毎ラウンド問い、閾値 0.6 以上なら `needs_confirmation` で停止 → **送信ボタン誤クリック防止のガードレール**
- ターゲット確信度 < 0.3 なら実行せず `ambiguous` を返す
- 2,000 要素超のページは 30 要素単位のグループ化 → 上位グループから絞り込みの 2 段階選択
- iframe / shadow DOM 対応あり。`data-jev-i` 属性を DOM に付与して再ヒット
- ベンチ: 42 タスク中 40 正解、フォーム系 8/8、平均 286ms/呼び出し、約 2,800 入力トークン/呼び出し
- NOTES.md: 「修正 11 件中 8 件は Jev のミスではなくページ記述側コードの穴だった」（透明チェックボックス、`<label>` 欠落、日付ピッカーが `fill()` を上書き等）

### 6.4 `trycua/cua` の `libs/cua-s1`（CUA-S1-FORMS）

- **Jev API は使っていない**（同じ System One 的思想の自前小型モデル）。ただしフォーム特化設計として参考価値が高い
- 文書から抽出した `Label: value` ペアを選択肢として列挙し、各フォーム要素に `fill <entity>` / `check` / `click` / `skip` を割り当てる。**全要素を 1 パス 50ms で一括判定**（ループなし）
- ガードレール: 送信ボタンはラベルが厳密に `submit` の 1 個のみ許可、チェックボックスは状態不明なら触らない、既定 dry-run、実行後 postcondition 検証

---

## 7. 本プロジェクトへの示唆

**[推測]** 以下は調査結果に基づく設計提案。要件定義で確定させる。

### 7.1 推奨アーキテクチャ: ワンショット fan-out

```
[content script] フォーム検出・フィールド列挙・シリアライズ（決定的処理）
       ↓ chrome.runtime.sendMessage
[service worker] state を組み立て、全フィールド分の Choice を 1 リクエストで Jev へ
       ↓ ユーザーの API キー（chrome.storage）で直接 fetch
[Jev] 各フィールド → プロフィールキー の対応を確率付きで返す
       ↓
[service worker] 確信度で絞り込み → content script に「fieldId: value」のリストを返す
       ↓
[content script] 値を注入（React 対策込み）、送信はしない
```

- エージェントループ不要。1 フォーム = 基本 1 リクエスト（select のフォールバック等で +α）
- 公式推奨の「コードが制御フローを持ち、Jev は判断のみ」に合致
- レイテンシ目安: 1 フォームあたり 0.2〜0.5 秒、コスト 1 円未満

### 7.2 質問設計案

```json
{
  "state": {
    "page": { "url": "https://example.jp/entry", "title": "お申し込みフォーム", "lang": "ja" },
    "fields": [
      { "id": "f1", "tag": "input", "type": "text", "name": "last_name", "autocomplete": "family-name",
        "label": "姓", "placeholder": "山田", "required": true, "section": "お客様情報" },
      { "id": "f2", "tag": "select", "name": "pref", "label": "都道府県",
        "options": ["北海道", "青森県", "...", "東京都"] }
    ],
    "profile_keys": {
      "family_name": "Family name in kanji (姓)",
      "given_name": "Given name in kanji (名)",
      "family_name_kana": "Family name in katakana (セイ)",
      "email": "Email address",
      "postal_code": "Postal code (郵便番号)",
      "prefecture": "Prefecture (都道府県)"
    }
  },
  "questions": {
    "f1": { "type": "choice",
      "instructions": "Which `profile_keys` entry should fill `fields[0]`? Choose `none` if nothing fits.",
      "criteria": { "family_name": null, "given_name": null, "family_name_kana": null, "email": null,
                    "postal_code": null, "prefecture": null, "none": "No profile value fits" } },
    "f2": { "...同様..." },
    "is_payment": { "type": "noul", "instructions": "Does `page` ask for credit card or payment details?" },
    "is_login": { "type": "noul", "instructions": "Is `page` a sign-in screen?" }
  }
}
```

ポイント:
- **プロフィールの「値」は Jev に送らない**（キー名と説明だけ送る）。個人情報が外部に出るのはフィールドのメタデータのみ → プライバシー面で強い設計
- select の選択肢は、まずコード側で完全一致／正規化一致を試し、外れた場合のみ `options` を Choice の選択肢にした追加質問へフォールバック（この時だけ値を送る）
- `none` 選択肢を必ず含め、`confidence` / `probabilities` の閾値で「入れない」判断をコード側で行う
- `is_payment` / `is_login` のような Noul ガードレールを同送し、閾値超えなら自動入力を止めてユーザー確認
- パスワード欄・カード番号欄は観測段階で除外（jev-for-chrome / PRIVACY.md と同方針）

### 7.3 BYOK 実装方針（2026-09-23 に破棄）

> **この節は経緯として残している。** 2026-09-23 に BYOK を全面廃止し、開発者が運用する
> Cloudflare Workers のプロキシ経由（Workers AI バインディングで `typesafe/jev` を呼ぶ）に移行した。
> キー取得の手間が利用開始の最大の障壁だったため。現行仕様は
> [02-nonfunctional-requirements.md](../requirements/02-nonfunctional-requirements.md) 1.4 を参照。
> なお Workers AI の `typesafe/jev` は third-party モデル扱いで、AI Gateway のプリペイドクレジットが必要。

- 対応プロバイダ: TypeSafe 直接 + OpenRouter（必須）、Cloudflare Workers AI（任意）
- キー保存: `chrome.storage.local`（デバイス内のみ）。設定画面で「あなたのキーはこの端末の拡張内にのみ保存され、Jev API 呼び出しにだけ使われます」と明示
- `host_permissions` に各 API ホスト（`https://api.typesafe.ai/*`, `https://openrouter.ai/*`）を含める。`<all_urls>` は避け、フォーム対象ページは `activeTab` + ユーザー操作起点にするとストア審査・プライバシー面で有利
- 設定画面に「接続テスト」（`GET /v1/models` または最小 Noul 1 問）を用意

### 7.4 リスクと検証項目

| リスク | 内容 | 検証方法 |
|---|---|---|
| **日本語精度** | CJK は精度が低いと公式明記。日本語ラベル（姓/名/フリガナ/都道府県）を正しく対応付けられるか未知 | 代表的な日本語フォーム 5〜10 種で PoC。`name` / `autocomplete` 属性（英語）と英語説明付き `profile_keys` で緩和できるか比較 |
| **キー入手性** | TypeSafe はウェイトリスト。ユーザーが即座に使えない | OpenRouter 対応で回避 |
| **CORS** | 公式ドキュメントに明記なし | `host_permissions` 付き MV3 拡張では jev-for-chrome が動作実績あり。実装初期に確認 |
| **OpenRouter エンドポイント** | `/api/v1/systemone` vs `/api/alpha/decisions` の不一致 | 両方叩いて確認 |
| **フォーム側の癖** | React 制御コンポーネント、カスタム select、日付ピッカー、shadow DOM、iframe | jev-browser NOTES.md の落とし穴リストを参照。trusted input（`chrome.debugger`）は権限が重いので、まず合成イベント + prototype setter で対応し必要なら検討 |
| **仕様変動** | early access のためレート制限・料金・API が予告なく変わる | SDK のバージョン固定、エラーハンドリングを厚く |

---

## 8. 未確認事項

- `api.typesafe.ai` の CORS ヘッダ（拡張では `host_permissions` で回避可能なため優先度低）
- `@typesafe-ai/sdk` の service worker 実動作（ソース解析上は動く見込み）
- OpenRouter の正しい Jev エンドポイント
- 日本語フォームでの実効精度（PoC 必須）
- ウェイトリストの待ち時間

---

## 参考リンク

- TypeSafe 公式: https://typesafe.ai/ / https://docs.typesafe.ai/ / https://console.typesafe.ai/
- 発表ブログ: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- 設計思想: https://docs.typesafe.ai/concepts/how-to-build-with-system-one
- Primitives: https://docs.typesafe.ai/primitives
- Fan-out: https://docs.typesafe.ai/patterns/fan-out
- JS SDK: https://github.com/typesafe-ai/typesafe-sdk-js / https://docs.typesafe.ai/sdk/javascript
- 公式スキル: https://github.com/typesafe-ai/skills
- OpenRouter: https://openrouter.ai/typesafe/jev-1.13 / https://openrouter.ai/docs/guides/community/typesafe-sdk
- Cloudflare Workers AI: https://developers.cloudflare.com/ai/models/typesafe/jev/
- jev-for-chrome: https://github.com/chy4pro/jev-for-chrome
- jev-ultrafast: https://github.com/browser-use/jev-ultrafast
- jev-browser: https://github.com/Ying-Kai-Liao/jev-browser
- CUA-S1-FORMS: https://github.com/trycua/cua （`libs/cua-s1`）
- ショーケース: https://madewithjev.com/github-repos
