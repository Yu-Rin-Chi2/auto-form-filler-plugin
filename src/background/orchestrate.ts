/**
 * 自動入力のオーケストレーション（要件 4.1 のシーケンス）。
 * content script へのメッセージング・Jev 呼び出し・storage 更新を行う、拡張の司令塔。
 */
import { PROFILE_FIELD_KEYS_FOR_JEV } from '../shared/profile-fields';
import { resolveLocale, t } from '../shared/i18n';
import { getProfiles, getSettings, saveLastResult, saveSettings } from '../shared/storage';
import type {
  ApplyFillRequest,
  ApplyFillResponse,
  ExtractFieldsResponse,
  FieldOutcome,
  FillResult,
  PingRequest,
  Profile,
} from '../shared/types';
import { JevError } from '../shared/types';
import { buildJevRequest } from './jev/build-request';
import { callJevWithValidation, resolveProviderConfig } from './jev/client';
import type { ChoiceAnswer } from './jev/validate-response';
import { aggregateFillResult } from './resolve/aggregate';
import { resolveFill } from './resolve/resolve';

const UNSUPPORTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
  'chrome-search://',
  'https://chrome.google.com/webstore',
];

export function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !UNSUPPORTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    throw new JevError('unsupported_page', 'アクティブなタブが見つかりません');
  }
  return tab;
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    const ping: PingRequest = { type: 'PING' };
    await chrome.tabs.sendMessage(tabId, ping);
    return;
  } catch {
    // 未注入。以下で注入する
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    // chrome:// 等、注入できないページ（要件 5.5）
    throw new JevError('unsupported_page', 'このページでは使えません');
  }
}

export interface FillOutcome {
  result: FillResult;
  details: FieldOutcome[];
}

function buildToastMessage(outcomes: FieldOutcome[], locale: ReturnType<typeof resolveLocale>): string {
  const filled = outcomes.filter((o) => o.reason === 'filled').length;
  const skippedLowConfidence = outcomes.filter((o) => o.reason === 'skipped_low_confidence').length;
  const noMatch = outcomes.filter((o) => o.reason === 'no_match').length;
  const other = outcomes.length - filled - skippedLowConfidence - noMatch;
  const lines = [`✓ ${t(locale, 'popup.summaryFilled', { n: filled })}`];
  if (skippedLowConfidence > 0) lines.push(t(locale, 'popup.summarySkipped', { n: skippedLowConfidence }));
  if (noMatch > 0 || other > 0) {
    lines.push(t(locale, 'popup.summaryOther', { noMatch, excluded: 0, other }));
  }
  return lines.join('\n');
}

/** 実行開始直後に lastResult へ保存する「実行中」マーカー（要件 4.1、レビュー指摘 A-1） */
function buildInProgressResult(profileId: string): FillResult {
  return {
    url: '',
    profileId,
    at: new Date().toISOString(),
    filled: 0,
    skippedLowConfidence: 0,
    noMatch: 0,
    excluded: 0,
    skippedOther: 0,
    latencyMs: 0,
    inputTokens: 0,
    error: '前回の実行が完了しませんでした',
    errorKind: 'incomplete',
  };
}

/** 要件 4.1: プロフィール選択 → 「入力」実行の一連の処理（内部実装。失敗すると例外を投げる） */
async function runFillInner(profileId: string): Promise<FillOutcome> {
  const settings = await getSettings();
  const profiles = await getProfiles();
  const profile = profiles.find((p) => p.id === profileId) as Profile | undefined;

  if (!settings.apiKey) {
    throw new JevError('no_api_key', 'API キーが設定されていません');
  }
  if (!profile) {
    throw new JevError('unknown', 'プロフィールが見つかりません');
  }

  // 処理開始時点で「実行中」を lastResult に保存する。service worker がこの後アイドル終了等で
  // 途中で落ちても、ポップアップ再表示時に「前回の実行が完了しませんでした」と分かるようにする
  // （レビュー指摘 A-1）。以降のすべての経路（成功・失敗）でこの関数を抜けるまでに必ず
  // 上書きされるため、正常終了時にユーザーに見えることはない。
  await saveLastResult(buildInProgressResult(profileId), []);

  const tab = await getActiveTab();
  const tabId = tab.id as number;

  // tab.url は activeTab の権限上、ユーザー操作（ツールバーアイコンのクリック等）を
  // 経由した場合のみ取得できる。chrome の公式ドキュメントでは commands API のショートカット
  // 実行でも activeTab は付与される仕様だが、取得できている場合のみここで早期判定し、
  // 取得できない場合は注入自体の成否（ensureContentScriptInjected）をフォールバックとして使う。
  if (tab.url !== undefined && !isSupportedUrl(tab.url)) {
    throw new JevError('unsupported_page', 'このページでは使えません');
  }

  await ensureContentScriptInjected(tabId);

  const extraction = (await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FIELDS' })) as ExtractFieldsResponse;

  if (!isSupportedUrl(extraction.page.url)) {
    throw new JevError('unsupported_page', 'このページでは使えません');
  }
  if (Object.keys(extraction.fields).length === 0) {
    throw new JevError('no_fields', '入力できるフォームが見つかりません');
  }

  const cfg = resolveProviderConfig(settings);
  const built = buildJevRequest(extraction.page, extraction.fields, cfg.model);
  if (!built.request) {
    throw new JevError('no_fields', '入力できるフォームが見つかりません');
  }

  const { response, latencyMs } = await callJevWithValidation(
    built.request,
    cfg,
    built.fieldIds,
    PROFILE_FIELD_KEYS_FOR_JEV,
    { debugLogging: settings.debugLogging },
  );

  const answers: Record<string, ChoiceAnswer | undefined> = {};
  for (const id of built.fieldIds) {
    answers[id] = response.answers[id];
  }

  const { assignments, outcomes } = resolveFill({
    fields: extraction.fields,
    answers,
    profileFields: profile.fields,
    settings: { confidenceThreshold: settings.confidenceThreshold, overwriteFilled: settings.overwriteFilled },
  });

  const locale = resolveLocale(settings.locale);
  const toastMessage = buildToastMessage(outcomes, locale);

  const applyRequest: ApplyFillRequest = {
    type: 'APPLY_FILL',
    assignments,
    highlight: settings.highlightFilled,
    toastMessage,
  };
  await chrome.tabs.sendMessage<ApplyFillRequest, ApplyFillResponse>(tabId, applyRequest);

  const result = aggregateFillResult(outcomes, {
    url: extraction.page.url,
    profileId,
    excludedCount: extraction.excludedCount,
    overLimitCount: extraction.overLimitCount,
    latencyMs,
    inputTokens: response.usage?.input_tokens ?? 0,
  });

  await saveLastResult(result, outcomes);
  await saveSettings({ ...settings, lastProfileId: profileId });

  return { result, details: outcomes };
}

/** Jev のエラーを FillResult 形式に変換する（要件 5.5） */
function errorToFillResult(error: unknown, profileId: string, url: string): FillResult {
  const jevError = error instanceof JevError ? error : new JevError('unknown', String(error));
  return {
    url,
    profileId,
    at: new Date().toISOString(),
    filled: 0,
    skippedLowConfidence: 0,
    noMatch: 0,
    excluded: 0,
    skippedOther: 0,
    latencyMs: 0,
    inputTokens: 0,
    error: jevError.message,
    errorKind: jevError.kind,
  };
}

/**
 * 要件 4.1 の公開エントリポイント。失敗しても例外を投げず、エラー情報を持つ FillResult を返す。
 * ポップアップ / ショートカットのどちらからでも同じ形で結果を扱えるようにするため。
 * エラー時も lastResult に保存する（ポップアップを再度開いたときに状態が矛盾しないように）。
 */
export async function runFill(profileId: string): Promise<FillOutcome> {
  try {
    return await runFillInner(profileId);
  } catch (error) {
    let url = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      url = tab?.url ?? '';
    } catch {
      // タブ情報が取れない場合は空文字のままにする
    }
    const result = errorToFillResult(error, profileId, url);
    await saveLastResult(result, []);
    return { result, details: [] };
  }
}
