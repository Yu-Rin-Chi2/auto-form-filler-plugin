/**
 * 拡張全体で共有する型定義。
 * content / background / popup / options のどこからも import してよい。
 * DOM や chrome.* への依存はここには置かない（型のみ）。
 */

// ---------------------------------------------------------------------------
// プロフィール（要件 2.2 / 2.3）
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female' | 'other' | 'no_answer' | '';

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
  country: string;
  company: string;
  department: string;
  /** ISO 8601 (YYYY-MM-DD)。未設定は空文字 */
  birth_date: string;
  gender: Gender;
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
  'country',
  'company',
  'department',
  'birth_date',
  'gender',
];

/** コードが生成する派生項目（要件 2.4）。ユーザーは直接入力しない */
export type DerivedFieldKey =
  | 'full_name'
  | 'full_name_kana'
  | 'full_name_romaji'
  | 'address_full'
  | 'birth_year'
  | 'birth_month'
  | 'birth_day'
  | 'age';

export const DERIVED_FIELD_KEYS: DerivedFieldKey[] = [
  'full_name',
  'full_name_kana',
  'full_name_romaji',
  'address_full',
  'birth_year',
  'birth_month',
  'birth_day',
  'age',
];

/** Jev の choice 選択肢として提示する全項目キー（2.3 + 2.4 + none） */
export type ProfileFieldKey = keyof ProfileFields | DerivedFieldKey | 'none';

export interface Profile {
  id: string;
  name: string;
  /** アイコン識別色。8 色プリセットの1つ（16進カラーコード） */
  color: string;
  fields: ProfileFields;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 設定（要件 2.5）
// ---------------------------------------------------------------------------

export type JevProvider = 'openrouter' | 'typesafe';

export interface Settings {
  provider: JevProvider;
  /** ユーザー自身の API キー。chrome.storage.local のみに保存 */
  apiKey: string;
  /** 既定モデルからの上書き */
  model?: string;
  /** プロバイダの既定 baseUrl からの上書き（詳細設定） */
  baseUrl?: string;
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
  provider: 'openrouter',
  apiKey: '',
  model: undefined,
  baseUrl: undefined,
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
  | 'skipped_invalid_response';

export interface FieldOutcome {
  fieldId: string;
  label: string;
  /** Jev が選んだ項目キー（'none' を含む）。判定自体が行われなかった場合は undefined */
  choice?: ProfileFieldKey;
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

export type ContentRequest = ExtractFieldsRequest | ApplyFillRequest | PingRequest;
export type ContentResponse = ExtractFieldsResponse | ApplyFillResponse | PingResponse;

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

export interface TestConnectionRequest {
  type: 'TEST_CONNECTION';
  provider: JevProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}
export interface TestConnectionResponse {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  errorKind?: JevErrorKind;
}

export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
  tab?: OptionsTabId;
}

export type RuntimeRequest =
  | FillRequestMessage
  | TestConnectionRequest
  | OpenOptionsRequest;

export type OptionsTabId = 'profiles' | 'api' | 'behavior' | 'privacy';

// ---------------------------------------------------------------------------
// Jev エラー分類（要件 5.5）
// ---------------------------------------------------------------------------

export type JevErrorKind =
  | 'no_api_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'invalid_response'
  | 'no_fields'
  | 'unsupported_page'
  /** service worker がアイドル終了する等で前回の実行が完了しなかった（レビュー指摘 A-1） */
  | 'incomplete'
  | 'unknown';

export class JevError extends Error {
  constructor(
    public kind: JevErrorKind,
    message: string,
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
