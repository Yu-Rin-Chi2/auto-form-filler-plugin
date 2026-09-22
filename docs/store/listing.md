# Chrome Web Store 掲載情報

デベロッパー ダッシュボードの各タブにそのまま貼り付けるための文言集。提出物（zip）は `npm run package` で `release/auto-form-filler-v<version>.zip` に生成する。

- スクリーンショット: `npm run store-screenshots` → `docs/store/screenshots/*.png`（1280×800）
- プロモタイル: `npm run render-promo` → `docs/store/promo/small-tile-440x280.png`
- ストアアイコン: `public/icons/icon128.png`

---

## 1. 「ストアの掲載情報」タブ

### 名前（manifest から自動）

Auto Form Filler

### 概要（manifest `description` から自動・132 文字以内）

- ja: Jev でフォームの項目を判定し、ローカルのプロフィールを自動入力します。個人情報は端末の外に送信しません。
- en: Uses Jev to identify form fields and fills them from a profile stored only on your device. Your personal data never leaves it.

### 詳細な説明（日本語）

```
Auto Form Filler は、氏名・フリガナ・住所・電話番号・メールアドレス・生年月日などを、Web フォームにワンクリックで入力する Chrome 拡張です。フォームの各項目が「何を入力する欄か」の判定に、判定特化の AI モデル Jev（TypeSafe AI）を使います。

■ 個人情報は端末の外に出しません
プロフィールの値（氏名・住所・電話番号など）は、この端末の Chrome 内（chrome.storage.local）にのみ保存されます。Google アカウント経由の同期（chrome.storage.sync）は使いません。開発者のサーバーは存在せず、テレメトリも入っていません。

AI に送るのは「フォーム項目のメタデータ」（ラベル・name 属性・type・placeholder など）と「プロフィールの項目名」（例: 姓、メールアドレス）だけです。値そのものは送信しません。何を送っているかは設定画面の「プライバシー」タブで確認でき、デバッグ設定を有効にすると実際のリクエスト JSON をコンソールで検証できます。

■ 登録できる項目
氏名・フリガナ・ローマ字、メール、電話、住所と住所のカナ、会社名・部署・ホームページ URL、生年月日・性別、SNS アカウント（X・YouTube・Instagram・Facebook・TikTok・GitHub・LinkedIn・note）、銀行口座（振込先登録用）。固定の項目にないものは「カスタム項目」として自分で追加できます。

■ 日本語フォーム特有の分割入力に対応
・電話番号の 3 分割（090 / 1234 / 5678）
・郵便番号の 2 分割（100 / 0001）
・生年月日の年・月・日 3 つの select（和暦にも対応）
・姓・名、セイ・メイ、ローマ字の分割
・都道府県 select の表記ゆれ吸収（「東京」⇄「東京都」）

■ 使い方
1. オプションページの「API 設定」で Jev の API キーを設定（BYOK 方式。OpenRouter または TypeSafe で取得）
2. 「プロフィール」で氏名・住所などを登録（個人用・会社用など複数作成可）
3. 入力したいフォームのページでツールバーのアイコンをクリックし「このページに入力」
   キーボードショートカット（既定 Alt+Shift+F）でも実行できます

■ しないこと
・フォームを自動送信しません（送信ボタンは押しません）
・パスワード・クレジットカード・暗証番号の欄は読み取りも入力もしません
・ページを開いただけでは動作しません。ボタンまたはショートカットで明示的に実行したときだけ動きます
・すでに入力済みの欄は既定では上書きしません

■ 別サイトの枠（iframe）内のフォーム
決済代行サービスなど、フォームが別サイトの枠内にあるページでは、初回に「許可して再実行」が表示されます。許可したサイトの枠内でのみ入力し、許可は設定からいつでも取り消せます。

■ API キーについて
この拡張は AI の呼び出しに利用者自身の API キーを使う BYOK（Bring Your Own Key）方式です。OpenRouter（https://openrouter.ai/）で発行したキーが利用できます。1 フォームあたりの利用料は概算 0.03 円程度です。キーはこの端末にのみ保存され、AI の呼び出し以外には使いません。

■ オープンソース
ソースコードは MIT ライセンスで公開しています。プライバシーポリシーと送信内容の仕様もリポジトリで確認できます。
https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin
```

### 詳細な説明（English）

```
Auto Form Filler fills web forms with your name, furigana, address, phone number, email, date of birth and more in one click. It uses Jev (TypeSafe AI), a model specialized in classification, to decide what each form field is asking for.

■ Your personal data never leaves your device
Profile values (name, address, phone number, etc.) are stored only in this device's Chrome (chrome.storage.local). Sync via your Google account (chrome.storage.sync) is not used. There is no developer server and no telemetry.

Only form field metadata (label, name attribute, type, placeholder, etc.) and the profile field *names* (e.g. "family_name", "email") are sent to the AI. The values themselves are never sent. The "Privacy" tab in the options page shows exactly what is sent, and a debug setting lets you inspect the actual request JSON in the console.

■ What you can store
Name, furigana and romaji, email, phone, address and its katakana reading, company / department / website, date of birth and gender, social accounts (X, YouTube, Instagram, Facebook, TikTok, GitHub, LinkedIn, note) and bank account details (for payout forms). Anything else can be added as a custom field.

■ Built for Japanese forms
- Phone numbers split into 3 inputs (090 / 1234 / 5678)
- Postal codes split into 2 inputs (100 / 0001)
- Date of birth as three selects (year / month / day, including Japanese era years)
- Separate family / given name, katakana and romaji fields
- Prefecture select variations ("東京" vs "東京都")

■ How to use
1. Set your Jev API key in Options → "API" (BYOK; get a key from OpenRouter or TypeSafe)
2. Create a profile in Options → "Profiles" (you can keep several, e.g. personal and work)
3. On a page with a form, click the toolbar icon and press "Fill this page"
   The keyboard shortcut (default Alt+Shift+F) also works

■ What it does NOT do
- It never submits forms
- It never reads or fills password, credit card or PIN fields
- It does nothing until you explicitly run it from the popup or shortcut
- Fields that already have a value are not overwritten by default

■ Forms inside iframes from other sites
On pages where the form lives inside an iframe from another site (common with payment providers), the popup shows "Allow and run again" the first time. The extension fills forms only inside iframes from sites you allowed, and you can revoke them from the settings page at any time.

■ About the API key
This extension is BYOK (Bring Your Own Key). A key from OpenRouter (https://openrouter.ai/) works out of the box. A typical form costs well under one cent. The key is stored only on this device and is used for nothing but calling the AI.

■ Open source
Source code is published under the MIT License, together with the privacy policy and the exact request specification.
https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin
```

### カテゴリ

生産性向上 → ワークフローとプランニング（Productivity → Workflow & Planning）

### 言語

日本語（主）、English

### 画像

| 種別 | サイズ | ファイル |
|---|---|---|
| ストアアイコン | 128×128 | `public/icons/icon128.png` |
| スクリーンショット 1 | 1280×800 | `docs/store/screenshots/01-popup-filled.png` — 入力結果とポップアップ |
| スクリーンショット 2 | 1280×800 | `docs/store/screenshots/02-options-profile.png` — プロフィール編集 |
| スクリーンショット 3 | 1280×800 | `docs/store/screenshots/03-options-privacy.png` — 送信内容の明示 |
| スクリーンショット 4 | 1280×800 | `docs/store/screenshots/04-popup-before.png` — 実行前のポップアップ |
| 小プロモタイル | 440×280 | `docs/store/promo/small-tile-440x280.png` |
| マーキー（任意） | 1400×560 | 省略 |

### URL

| 項目 | 値 |
|---|---|
| 公式 URL | （Search Console で所有権確認済みのサイトがある場合のみ。なければ空欄） |
| ホームページ URL | https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin |
| サポート URL | https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin/issues |

---

## 2. 「プライバシー」タブ

### 単一目的の説明（Single purpose）

```
Web フォームの入力欄を判定し、利用者が端末内に保存したプロフィール（氏名・住所・連絡先など）を自動入力すること。それ以外の機能は持ちません。
```

```
Identify the fields of a web form and fill them with the profile (name, address, contact details) the user has stored on their device. The extension has no other function.
```

### 権限の理由（Permission justification）

**activeTab**

```
利用者がポップアップの「このページに入力」ボタンまたはキーボードショートカットを押したときにのみ、現在のタブのフォームを読み取り・入力するために使用します。<all_urls> や tabs は要求せず、ページを開いただけでは動作しません。
```

```
Used only when the user clicks "Fill this page" in the popup or presses the keyboard shortcut, to read and fill the form in the current tab. We do not request <all_urls> or tabs; nothing runs just by opening a page.
```

**scripting**

```
上記の操作時に、フォーム項目の抽出と値の注入を行う content script を現在のタブへ実行時に注入するために使用します。content script は manifest に常駐登録せず、実行時にのみ注入します。
```

```
Used to inject, at the time of the action above, the content script that extracts form fields and injects values into the current tab. The content script is not registered persistently in the manifest; it is injected only on demand.
```

**storage**

```
プロフィール（氏名・住所など）、API キー、動作設定をこの端末の chrome.storage.local に保存するために使用します。chrome.storage.sync は使用しません。
```

```
Used to keep profiles (name, address, etc.), the API key and settings in chrome.storage.local on this device. chrome.storage.sync is not used.
```

**ホスト権限（https://api.typesafe.ai/*, https://openrouter.ai/*）**

```
フォーム項目の判定に使う Jev API を Service Worker から呼び出すために必要です。送信するのはフォーム項目のメタデータ（ラベル・name・type など）とプロフィールの「項目名」のみで、プロフィールの値は送信しません。利用者はどちらのプロバイダを使うかを設定で選択します。
```

```
Required to call the Jev API (used to classify form fields) from the service worker. Only form field metadata (label, name, type, etc.) and profile field *names* are sent; profile values are never sent. The user chooses which provider to use in the settings.
```

**オプションのホスト権限（`https://*/*`, `http://*/*`）**

```
既定では無効です。フォームが別サイトの iframe（例: Stripe のホスト型オンボーディングは connect-js.stripe.com の iframe 内にフォームを描画します）内にあり、拡張が読み取れない場合に限り、ポップアップで「許可して再実行」を表示し、利用者が押したときだけ chrome.permissions.request でその iframe のオリジン 1 件へのアクセスを求めます。許可したオリジンの iframe 内でのみフォームの読み取りと入力を行い、送信する情報は通常時と同じ（項目のメタデータのみ、値は送らない）です。許可したサイトは設定画面から取り消せます。
```

```
Disabled by default. Only when the form lives inside an iframe from another site (e.g. Stripe's hosted onboarding renders its form inside a connect-js.stripe.com iframe) and the extension cannot read it, the popup offers "Allow and run again"; when the user clicks it, chrome.permissions.request asks for that single iframe origin. The extension then reads and fills forms only inside iframes from the allowed origin, sending the same data as usual (field metadata only, never values). Allowed sites can be revoked from the settings page.
```

### リモートコード

「いいえ、リモートコードを使用していません」を選択。すべてのコードは zip に同梱され、`eval` / 外部スクリプトの読み込みは行わない。

### データの使用

「この拡張機能が収集または使用するユーザーデータ」のチェック:

「収集または使用」の判定は Google 側の解釈に幅があるため、**端末内に保存して使用する情報は保守的にチェックする**（チェックしても 3 つの証明には影響せず、過少申告での差し戻しリスクの方が大きい）。

| 項目 | 選択 | 根拠 |
|---|---|---|
| 個人を特定できる情報 | **チェックする** | 氏名・住所・連絡先を端末内に保存して使用する（外部送信はしない。プライバシーポリシーに明記） |
| 健康情報 | しない | |
| 財務および支払い情報 | **チェックする** | 銀行口座（銀行名・支店・口座番号）を端末内に保存して使用する（外部送信はしない）。カード情報は扱わない |
| 認証情報 | しない | パスワード・暗証番号は扱わない。API キーは利用者自身のもので端末内保存 |
| 個人的なコミュニケーション | しない | |
| 位置情報 | しない | |
| ウェブ履歴 | しない | |
| ユーザー アクティビティ | しない | |
| **ウェブサイトのコンテンツ** | **チェックする** | 実行時にフォーム項目のメタデータ（ラベル・name 等）とページ URL・タイトルを Jev API に送るため |

3 つの証明（すべてチェック）:

- [x] ユーザーデータを承認された用途以外で第三者に販売または譲渡しない
- [x] アイテムの単一目的に関係のない目的でユーザーデータを使用または譲渡しない
- [x] 信用度の判断や融資目的でユーザーデータを使用または譲渡しない

### プライバシー ポリシー URL

```
https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin/blob/main/PRIVACY.md
```

---

## 3. 「配布」タブ

| 項目 | 値 |
|---|---|
| 公開設定 | 公開 |
| 支払い | 無料 |
| 配布地域 | すべての地域 |

---

## 4. 審査者向けメモ（「審査に関するメモ」欄）

```
[English]
This extension is BYOK (Bring Your Own Key): it calls the Jev API (TypeSafe AI) with an API key supplied by the user, and does nothing until a key is set.

To test:
1. Open the options page (opens automatically on first install) → "API" tab.
2. Provider: "OpenRouter". Paste an OpenRouter API key (https://openrouter.ai/keys). [任意: 審査用のキーをここに記載する場合 → "Test key: sk-or-v1-...  (limited credit, will be revoked after review)"]
3. "Profiles" tab → create a profile with any sample values.
4. Open any page with a sign-up / contact form (the repository's e2e/fixtures/*.html files are sample forms you can open locally), click the toolbar icon → "Fill this page".

Privacy notes for review:
- Profile values are stored only in chrome.storage.local and are never sent anywhere, including to the Jev API. Only field metadata (label, name, type, placeholder, options) and profile field names are sent. The exact request format is documented in PRIVACY.md and docs/requirements/01-functional-requirements.md (section 5.2) in the public repository.
- The extension never submits forms and excludes password / credit-card fields at extraction time.
- No remote code, no telemetry, no chrome.storage.sync.
- Source: https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin (MIT)
```

審査用キーを添えるかどうかは提出時に判断する。添える場合は **審査専用に発行した、残高を少額（$1 程度）に限定したキー**を使い、公開後に必ず失効させる。添えない場合、審査者が動作確認できず「機能が確認できない」で差し戻される可能性があるため、その際はメモに記載して再提出する。

---

## 5. 提出前チェックリスト

- [ ] `npm run typecheck && npm run test` が通る
- [ ] `npm run package` で zip を生成し、`manifest.json` が zip のルートにある
- [ ] zip の `manifest.json` の `host_permissions` が Jev API の 2 ホストのみ（`127.0.0.1` が混入していない）
- [ ] `version` が `package.json` / `manifest.json` / `CHANGELOG.md` で一致
- [ ] スクリーンショット 4 枚（1280×800）とプロモタイル（440×280）を生成済み
- [ ] `PRIVACY.md` の「最終更新日」が今回のリリース内容を反映している
- [ ] デベロッパー アカウントのメールアドレス確認と 2 段階認証が完了している
- [ ] 提出後: GitHub に `v0.1.0` タグを打ち、Release に同じ zip を添付する
