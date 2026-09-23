/**
 * 拡張全体で共有する型定義。
 * content / background / popup / options のどこからも import してよい。
 * DOM や chrome.* への依存はここには置かない（型のみ）。
 */

// ---------------------------------------------------------------------------
// プロフィール（要件 2.2 / 2.3）
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female' | 'other' | 'no_answer' | '';

/** 預金種別。ordinary=普通 / current=当座 / savings=貯蓄。未設定は空文字 */
export type AccountType = 'ordinary' | 'current' | 'savings' | '';

/** ユーザーが直接入力する項目（要件 2.3） */
export interface ProfileFields {
  family_name: string;
  given_name: string;
  family_name_kana: string;
  given_name_kana: string;
  family_name_romaji: string;
  given_name_romaji: string;
  email: string;
  phone: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line1: string;
  address_line2: string;
  /** 市区町村のカナ（カタカナで保存。例: シブヤク）。金融・決済系フォームの住所カナ欄向け */
  city_kana: string;
  /** 町名・番地のカナ（例: シブヤ1-2-3） */
  address_line1_kana: string;
  /** 建物名・部屋番号のカナ（例: サンプルビル5F） */
  address_line2_kana: string;
  country: string;
  company: string;
  department: string;
  /** ホームページ / 会社サイトの URL（2026-09-22 追加） */
  website: string;
  /** ISO 8601 (YYYY-MM-DD)。未設定は空文字 */
  birth_date: string;
  gender: Gender;
  /** 銀行口座（振込先・売上入金口座の登録フォーム向け。2026-09-22 追加）。カード情報は引き続き扱わない */
  bank_name: string;
  /** 金融機関コード（4 桁） */
  bank_code: string;
  branch_name: string;
  /** 支店コード・店番（3 桁） */
  branch_code: string;
  account_type: AccountType;
  /** 口座番号（通常 7 桁） */
  account_number: string;
  /**
   * SNS のアカウント ID（2026-09-22 追加）。`@` の有無・URL のどちらで保存してもよい。
   * URL 欄（type=url、ラベル/placeholder に URL/http）へは各サービスのプロフィール URL に変換して入力する
   */
  sns_x: string;
  sns_youtube: string;
  sns_instagram: string;
  sns_facebook: string;
  sns_tiktok: string;
  sns_github: string;
  sns_linkedin: string;
  sns_note: string;
}

export const PROFILE_FIELD_KEYS: (keyof ProfileFields)[] = [
  'family_name',
  'given_name',
  'family_name_kana',
  'given_name_kana',
  'family_name_romaji',
  'given_name_romaji',
  'email',
  'phone',
  'postal_code',
  'prefecture',
  'city',
  'address_line1',
  'address_line2',
  'city_kana',
  'address_line1_kana',
  'address_line2_kana',
  'country',
  'company',
  'department',
  'website',
  'birth_date',
  'gender',
  'bank_name',
  'bank_code',
  'branch_name',
  'branch_code',
  'account_type',
  'account_number',
  'sns_x',
  'sns_youtube',
  'sns_instagram',
  'sns_facebook',
  'sns_tiktok',
  'sns_github',
  'sns_linkedin',
  'sns_note',
];

/** SNS 項目のキー（UI と URL 変換で使う） */
export type SnsFieldKey =
  | 'sns_x'
  | 'sns_youtube'
  | 'sns_instagram'
  | 'sns_facebook'
  | 'sns_tiktok'
  | 'sns_github'
  | 'sns_linkedin'
  | 'sns_note';
export const SNS_FIELD_KEYS: SnsFieldKey[] = [
  'sns_x',
  'sns_youtube',
  'sns_instagram',
  'sns_facebook',
  'sns_tiktok',
  'sns_github',
  'sns_linkedin',
  'sns_note',
];

/** コードが生成する派生項目（要件 2.4）。ユーザーは直接入力しない */
export type DerivedFieldKey =
  | 'full_name'
  | 'full_name_kana'
  | 'full_name_romaji'
  | 'address_full'
  /** 都道府県のカナ。prefecture から 47 件の固定表で生成（例: 東京都 → トウキョウト） */
  | 'prefecture_kana'
  /** 住所カナ一体型。prefecture_kana + city_kana + address_line1_kana + address_line2_kana */
  | 'address_kana_full'
  | 'birth_year'
  | 'birth_month'
  | 'birth_day'
  | 'age'
  /** 口座名義（カナ）。full_name_kana と同じ（銀行フォームは通常カナ名義を要求する） */
  | 'account_holder_kana'
  /** 口座名義（漢字）。full_name と同じ */
  | 'account_holder';

export const DERIVED_FIELD_KEYS: DerivedFieldKey[] = [
  'full_name',
  'full_name_kana',
  'full_name_romaji',
  'address_full',
  'prefecture_kana',
  'address_kana_full',
  'birth_year',
  'birth_month',
  'birth_day',
  'age',
  'account_holder_kana',
  'account_holder',
];

/**
 * ユーザー定義項目（2026-09-22 追加）。固定スキーマにない項目（SNS の ID、社員番号、資格番号など）を
 * ユーザーが自分で追加できる。`id` は `custom_` で始まる一意なキーで、Jev の choice 選択肢として
 * 固定項目と同列に提示される。Jev に送るのは `label` と `description`（項目の意味）だけで、
 * `value` は他の項目と同じく端末の外に出さない。
 */
export interface CustomField {
  /** `custom_` + ランダム 8 文字。Jev の choice キーとしてそのまま使う */
  id: CustomFieldKey;
  /** 表示名。Jev への説明にも使う（例: Twitter ID） */
  label: string;
  /** 任意の補足説明。Jev への説明にのみ使う（英語で書くと判定精度が上がる） */
  description: string;
  /** 入力する値。端末内にのみ保存 */
  value: string;
}

export type CustomFieldKey = `custom_${string}`;

export function isCustomFieldKey(key: string): key is CustomFieldKey {
  return key.startsWith('custom_') && key.length > 'custom_'.length;
}

/** Jev の choice 選択肢として提示する全項目キー（2.3 + 2.4 + ユーザー定義 + none） */
export type ProfileFieldKey = keyof ProfileFields | DerivedFieldKey | CustomFieldKey | 'none';

export interface Profile {
  id: string;
  name: string;
  /** アイコン識別色。8 色プリセットの1つ（16進カラーコード） */
  color: string;
  fields: ProfileFields;
  /** ユーザー定義項目。旧データには存在しないため optional（読み込み時に [] で補う） */
  customFields?: CustomField[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 設定（要件 2.5）
// ---------------------------------------------------------------------------

export interface Settings {
  /**
   * Jev プロキシ Worker の向き先。未設定なら既定のエンドポイントを使う。
   * UI からは変更できない。E2E がモックサーバーを指すためと、
   * 自分で Worker を建てて使いたい利用者のための逃げ道として持つ。
   */
  workerEndpoint?: string;
  /** ショートカット実行に使う直近のプロフィール ID */
  lastProfileId: string | null;
  /** 確信度の採用閾値。既定 0.7 */
  confidenceThreshold: number;
  /** 入力済みフィールドをハイライトするか。既定 true */
  highlightFilled: boolean;
  /** 既に値があるフィールドも上書きするか。既定 false */
  overwriteFilled: boolean;
  /** 入力前にプレビューを表示するか（Should、MVP では未実装UIだが設定値は保持）。既定 false */
  previewBeforeFill: boolean;
  /** 送信内容をコンソールに出力する開発者向け設定。既定 false */
  debugLogging: boolean;
  /** UI ロケール。未設定ならブラウザに従う */
  locale?: 'ja' | 'en';
}

export const DEFAULT_SETTINGS: Settings = {
  workerEndpoint: undefined,
  lastProfileId: null,
  confidenceThreshold: 0.7,
  highlightFilled: true,
  overwriteFilled: false,
  previewBeforeFill: false,
  debugLogging: false,
  locale: undefined,
};

// ---------------------------------------------------------------------------
// 実行結果（要件 2.6）
// ---------------------------------------------------------------------------

/**
 * フィールド単位の結果理由。
 * 付記1・2（カウンタ区分とdetail enum）は以下のとおり実装で確定する:
 *  - FillResult の 4 主要カウンタ（filled / skippedLowConfidence / noMatch / excluded）は要件どおり維持
 *  - それ以外の理由（未設定・選択肢不一致・maxlength超過・既存値非上書き・60件超過）は
 *    `skippedOther` に集約しつつ、フィールド単位の詳細は `FieldOutcome.reason` で個別に判別できるようにする
 */
export type FieldOutcomeReason =
  | 'filled'
  | 'skipped_low_confidence'
  | 'no_match'
  | 'skipped_unset'
  | 'skipped_no_option_match'
  | 'skipped_max_length'
  | 'skipped_existing_value'
  | 'skipped_over_limit'
  | 'skipped_split_mismatch'
  | 'skipped_invalid_response'
  /** 注入したがページ側が値を受け付けなかった（type=number にハイフン入り等） */
  | 'skipped_rejected';

export interface FieldOutcome {
  fieldId: string;
  label: string;
  /** Jev が選んだ項目キー（'none' を含む）。判定自体が行われなかった場合は undefined */
  choice?: ProfileFieldKey;
  /** choice がユーザー定義項目のとき、その表示名（ポップアップの詳細表示用。custom_xxxx を見せない） */
  choiceLabel?: string;
  confidence?: number;
  reason: FieldOutcomeReason;
}

export interface FillResult {
  /** オリジン + パス（クエリは保存しない） */
  url: string;
  profileId: string;
  at: string;
  filled: number;
  skippedLowConfidence: number;
  noMatch: number;
  excluded: number;
  /** 未設定・選択肢不一致・maxlength超過・既存値非上書き・60件超過の合計 */
  skippedOther: number;
  latencyMs: number;
  inputTokens: number;
  error?: string;
  errorKind?: JevErrorKind;
  /**
   * ページ内に存在したが、拡張がまだアクセス権限を持たないクロスオリジン iframe のオリジン
   * （例: `https://connect-js.stripe.com`）。ポップアップが「許可して再実行」を提示するために使う。
   * 実行が成功した場合でも、iframe 内のフォームを取りこぼしている可能性があるときに付く。
   */
  pendingFrameOrigins?: string[];
}

// ---------------------------------------------------------------------------
// フィールド抽出（要件 5.1）
// ---------------------------------------------------------------------------

export interface ExtractedField {
  tag: 'input' | 'select' | 'textarea';
  type?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxlength?: number;
  section?: string;
  /** 項目の意味を表していそうな class 名（例: `zip`）。ページ側の属性で、利用者の値は含まない */
  hints?: string[];
  options?: string[];
  currentValue?: 'empty' | 'filled';
}

/** 抽出順に f0, f1, ... をキーにしたオブジェクト（配列は使わない。5.1.2） */
export type ExtractedFields = Record<string, ExtractedField>;

export interface PageInfo {
  /** クエリ・フラグメントを除いた origin + pathname */
  url: string;
  title: string;
  lang: string;
}

export interface ExtractionResult {
  fields: ExtractedFields;
  page: PageInfo;
  /** password / cc-* / カード関連ラベル等で除外した件数 */
  excludedCount: number;
  /** 60 件上限を超えて切り捨てた件数 */
  overLimitCount: number;
  /**
   * この document 内にある、可視でかつ document と異なるオリジンの iframe のオリジン一覧
   * （重複なし）。background 側でホスト権限の有無を判定し、未許可なら「許可して再実行」を案内する。
   * iframe の URL 自体（パス）は含めない
   */
  crossOriginFrameOrigins: string[];
  /** このフレームが最上位フレームか（background 側で page 情報とトースト表示先の選択に使う） */
  isTopFrame: boolean;
}

// ---------------------------------------------------------------------------
// メッセージング（content <-> background <-> popup）
// ---------------------------------------------------------------------------

export interface ExtractFieldsRequest {
  type: 'EXTRACT_FIELDS';
}
export interface ExtractFieldsResponse extends ExtractionResult {}

/**
 * 注入方法の種別。text は input（text/email/tel/date 等）・textarea・contenteditable の
 * すべてを含む。実際の注入手段（ネイティブ setter か textContent か）は content script が
 * 保持する実 DOM 要素を見て判定する（背景側は tag/type を意識するだけでよい）。
 */
export type FillAssignment =
  | { kind: 'text'; value: string }
  | { kind: 'select'; value: string }
  | { kind: 'radio'; value: string };

export interface ApplyFillRequest {
  type: 'APPLY_FILL';
  assignments: Record<string, FillAssignment>;
  highlight: boolean;
  /** background 側で組み立て済みのローカライズ済みトースト文言（要件 03-uiux 3.9） */
  toastMessage?: string;
}
export interface ApplyFillResponse {
  filled: string[];
  failed: string[];
}

export interface PingRequest {
  type: 'PING';
}
export interface PingResponse {
  ready: true;
}

/** 最上位フレームにだけ送る、結果トーストの表示要求（入力は複数フレームにまたがるため分離） */
export interface ShowToastRequest {
  type: 'SHOW_TOAST';
  message: string;
}
export interface ShowToastResponse {
  shown: boolean;
}

export type ContentRequest = ExtractFieldsRequest | ApplyFillRequest | PingRequest | ShowToastRequest;
export type ContentResponse = ExtractFieldsResponse | ApplyFillResponse | PingResponse | ShowToastResponse;

export interface FillRequestMessage {
  type: 'FILL_REQUEST';
  profileId: string;
}
export interface FillResultMessage {
  type: 'FILL_RESULT';
  result: FillResult;
  details: FieldOutcome[];
}
export interface FillProgressMessage {
  type: 'FILL_PROGRESS';
  stage: 'extracting' | 'judging' | 'applying';
}

/** background の FILL_REQUEST ハンドラが返すレスポンスの形 */
export interface FillOutcomeMessageResponse {
  result: FillResult;
  details: FieldOutcome[];
}

export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
  tab?: OptionsTabId;
}

export type RuntimeRequest = FillRequestMessage | OpenOptionsRequest;

export type OptionsTabId = 'profiles' | 'behavior' | 'privacy';

// ---------------------------------------------------------------------------
// Jev エラー分類（要件 5.5）
// ---------------------------------------------------------------------------

/** プロキシ Worker から受け取る判定結果。組み立てと検証は Worker 側（`workers/src/`） */
export interface ChoiceAnswer {
  type?: string;
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevAnswers {
  model?: string;
  answers: Record<string, ChoiceAnswer | undefined>;
  usage?: { input_tokens: number; output_tokens: number };
}

export type JevErrorKind =
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'invalid_response'
  | 'no_fields'
  | 'unsupported_page'
  /**
   * 入力欄が見つからず、かつ拡張がアクセス権限を持たないクロスオリジン iframe がページ内にある。
   * フォームがその iframe 内にある可能性が高いので、ポップアップで権限の許可を案内する
   */
  | 'frame_permission_needed'
  /** service worker がアイドル終了する等で前回の実行が完了しなかった（レビュー指摘 A-1） */
  | 'incomplete'
  | 'unknown';

export class JevError extends Error {
  constructor(
    public kind: JevErrorKind,
    message: string,
    /** kind = frame_permission_needed のとき、許可を求めるべき iframe のオリジン */
    public frameOrigins: string[] = [],
  ) {
    super(message);
    this.name = 'JevError';
  }
}

// ---------------------------------------------------------------------------
// インポート/エクスポート（要件 4.4）
// ---------------------------------------------------------------------------

export interface ProfileExport {
  version: number;
  exportedAt: string;
  profiles: Profile[];
}

export const PROFILE_EXPORT_VERSION = 1;
