# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に従います。バージョンは [Semantic Versioning](https://semver.org/lang/ja/) です。

## [Unreleased]

## [0.2.0] - 2026-09-22

GitHub Release の `v0.1.0` zip は初期コミット時点のビルドで、下記 0.1.0 に記載の一部機能（iframe 対応・カスタム項目・SNS・銀行口座・住所カナ）を含んでいませんでした。このリリースにはそれらすべてが含まれます。

### Added

- 設定画面のフッターとポップアップ下部に、開発支援（Buy Me a Coffee）と GitHub へのリンクを追加
- API 設定タブ: キー未設定時の案内、OpenRouter / TypeSafe の各ページへ直接飛べる手順リンク、README へのリンク

### Fixed

- API 設定タブで、伏字表示のままキーを貼り付けても入力されない（`readOnly` になっていた）問題を修正。入力欄を常に編集可能な password 型に変更し、前後の空白を自動除去。保存済みキーの末尾 4 文字はヒント行に表示

## [0.1.0] - 2026-09-22

初回リリース（Chrome Web Store 初回提出）。

### Added

- Jev（TypeSafe AI）でフォーム項目を判定し、ローカルに保存したプロフィールから自動入力する機能
- 複数プロフィールの作成・編集・削除・複製と、ポップアップからの切り替え
- 姓名・フリガナ・ローマ字・メール・電話・郵便番号・住所・会社名・部署・生年月日・性別の入力
- 住所カナ（市区町村・番地・建物名のカナ）の入力。都道府県のカナは自動生成、一体型の「住所（カナ）」欄にも対応
- 銀行口座（銀行名・銀行コード・支店名・支店コード・預金種別・口座番号）とホームページ URL の入力。口座名義（カナ / 漢字）は氏名から自動生成
- SNS アカウント（X・YouTube・Instagram・Facebook・TikTok・GitHub・LinkedIn・note）。URL 欄にはプロフィール URL に変換して入力
- カスタム項目: 固定の項目にないものをユーザーが追加できる（項目名・説明は Jev に送られ、値は送られない）
- 電話番号 3 分割 / 郵便番号 2 分割 / 生年月日 3 select（和暦含む）への自動分配
- select・radio の選択肢の表記ゆれ吸収（「東京」⇄「東京都」など）
- 確信度の閾値、入力済み項目の上書き可否、入力前プレビュー、ハイライト表示の設定
- キーボードショートカット（既定 `Alt+Shift+F`）による前回プロフィールでの実行
- プロフィールの JSON インポート / エクスポート（API キーは含まない）
- Jev プロバイダの選択（OpenRouter 経由 / TypeSafe 直接）と BYOK 方式の API キー設定
- 日本語 / 英語 UI（設定で切り替え）
- 別サイトの iframe 内のフォーム（Stripe Connect のホスト型オンボーディング等）への対応。入力欄が見つからず別サイトの iframe がある場合、ポップアップの「許可して再実行」からそのサイトへのアクセスを許可できる（`optional_host_permissions`、許可はサイト単位・設定から取り消し可）
- Shadow DOM（Web Components）内のフォームの抽出
- プライバシーポリシー（`PRIVACY.md`）と、設定画面での送信内容の明示

### Security

- プロフィールの値は `chrome.storage.local` にのみ保存し、Jev を含め外部に送信しない
- `chrome.storage.sync` 不使用、テレメトリなし
- パスワード・カード情報・暗証番号（PIN）のフィールドは観測段階で除外
- フォームの自動送信は行わない
- 権限は `activeTab` / `scripting` / `storage` と Jev API ホストのみ。iframe 用のホスト権限はユーザーが明示的に許可したサイトに限る

[Unreleased]: https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Yu-Rin-Chi2/auto-form-filler-plugin/releases/tag/v0.1.0
