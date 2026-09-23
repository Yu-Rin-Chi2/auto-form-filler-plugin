/**
 * 自動入力のオーケストレーション（要件 4.1 のシーケンス）。
 * content script へのメッセージング・Jev 呼び出し・storage 更新を行う、拡張の司令塔。
 */
import { resolveLocale, t } from '../shared/i18n';
import { getProfiles, getSettings, saveLastResult, saveSettings } from '../shared/storage';
import type {
  ApplyFillRequest,
  ApplyFillResponse,
  ChoiceAnswer,
  ExtractFieldsResponse,
  FieldOutcome,
  FillResult,
  Profile,
  ShowToastRequest,
} from '../shared/types';
import { JevError } from '../shared/types';
import { findPendingFrameOrigins, mergeFrameExtractions, splitAssignmentsByFrame, type FrameExtraction } from './frames';
import { callJev, toCustomFieldPayload } from './jev/client';
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

/**
 * content script をタブの全フレームに注入し、注入できたフレーム ID の一覧を返す。
 *
 * - content script は二重注入に耐える（window 上のフラグで idempotent）ため、毎回そのまま注入する
 * - `allFrames: true` は、拡張がアクセスできるフレーム（最上位 + 同一オリジン iframe +
 *   ユーザーがホスト権限を許可したクロスオリジン iframe）にだけ注入される。権限のない
 *   クロスオリジン iframe は対象外になるが、そのオリジンは抽出結果の crossOriginFrameOrigins
 *   から分かるので、後段で「許可して再実行」を案内する
 * - 万一 allFrames で失敗した場合は最上位フレームのみで再試行する
 */
async function injectContentScript(tabId: number): Promise<number[]> {
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    const frameIds = Array.from(new Set(results.map((r) => r.frameId)));
    if (frameIds.length > 0) return frameIds;
  } catch {
    // 下の最上位フレームのみの注入にフォールバックする
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return [0];
  } catch {
    // chrome:// 等、注入できないページ（要件 5.5）
    throw new JevError('unsupported_page', 'このページでは使えません');
  }
}

/** 各フレームからフィールドを抽出する。途中で消えたフレーム（ナビゲーション等）は無視する */
async function extractFromFrames(tabId: number, frameIds: number[]): Promise<FrameExtraction[]> {
  const extractions: FrameExtraction[] = [];
  for (const frameId of frameIds) {
    try {
      const result = (await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FIELDS' }, { frameId })) as
        | ExtractFieldsResponse
        | undefined;
      if (result && result.fields) extractions.push({ frameId, result });
    } catch {
      // このフレームには到達できなかった（すでに破棄された等）。他のフレームは続行する
    }
  }
  return extractions;
}

/** 指定オリジンのうち、chrome.permissions で既にホスト権限を持っているものを返す */
async function filterPermittedOrigins(origins: string[]): Promise<string[]> {
  const permitted: string[] = [];
  for (const origin of origins) {
    try {
      if (await chrome.permissions.contains({ origins: [`${origin}/*`] })) permitted.push(origin);
    } catch {
      // permissions API が使えない場合は未許可として扱う
    }
  }
  return permitted;
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

  const frameIds = await injectContentScript(tabId);
  const extractions = await extractFromFrames(tabId, frameIds);
  if (extractions.length === 0) {
    throw new JevError('unsupported_page', 'このページでは使えません');
  }
  const extraction = mergeFrameExtractions(extractions);
  const topFrameId = extractions.find((e) => e.result.isTopFrame)?.frameId ?? 0;

  if (!isSupportedUrl(extraction.page.url)) {
    throw new JevError('unsupported_page', 'このページでは使えません');
  }

  // 拡張が到達できなかったクロスオリジン iframe（フォームがその中にある可能性がある）
  const permitted = await filterPermittedOrigins(extraction.crossOriginFrameOrigins);
  const pendingFrameOrigins = findPendingFrameOrigins(extraction, permitted);

  if (Object.keys(extraction.fields).length === 0) {
    if (pendingFrameOrigins.length > 0) {
      throw new JevError(
        'frame_permission_needed',
        'フォームは別サイトの iframe 内にあります。アクセスを許可すると入力できます',
        pendingFrameOrigins,
      );
    }
    throw new JevError('no_fields', '入力できるフォームが見つかりません');
  }

  const fieldIds = Object.keys(extraction.fields);

  // 送るのはフォーム項目の見た目の情報と、ユーザー定義項目の項目名・説明だけ。
  // プロフィールの値は型の上で渡せない（要件 P1）
  const { response, latencyMs } = await callJev(
    {
      page: extraction.page,
      fields: extraction.fields,
      customFields: toCustomFieldPayload(profile.customFields ?? []),
    },
    settings.workerEndpoint,
    { debugLogging: settings.debugLogging },
  );

  const answers: Record<string, ChoiceAnswer | undefined> = {};
  for (const id of fieldIds) {
    answers[id] = response.answers[id];
  }

  const { assignments, outcomes } = resolveFill({
    fields: extraction.fields,
    answers,
    profileFields: profile.fields,
    customFields: profile.customFields ?? [],
    settings: { confidenceThreshold: settings.confidenceThreshold, overwriteFilled: settings.overwriteFilled },
  });

  // 入力はフレームごとに分けて送る（各フレームの content script は自分の局所 ID しか知らない）
  for (const [frameId, frameAssignments] of splitAssignmentsByFrame(assignments, extraction.locations)) {
    const applyRequest: ApplyFillRequest = {
      type: 'APPLY_FILL',
      assignments: frameAssignments,
      highlight: settings.highlightFilled,
    };
    try {
      await chrome.tabs.sendMessage<ApplyFillRequest, ApplyFillResponse>(tabId, applyRequest, { frameId });
    } catch {
      // フレームが消えていた場合。他のフレームの入力は続行する
    }
  }

  // 結果トーストは集計した 1 件だけを最上位フレームに表示する
  const locale = resolveLocale(settings.locale);
  if (outcomes.some((o) => o.reason === 'filled')) {
    const toast: ShowToastRequest = { type: 'SHOW_TOAST', message: buildToastMessage(outcomes, locale) };
    try {
      await chrome.tabs.sendMessage(tabId, toast, { frameId: topFrameId });
    } catch {
      // トーストが出せなくても入力結果には影響しない
    }
  }

  const result = aggregateFillResult(outcomes, {
    url: extraction.page.url,
    profileId,
    excludedCount: extraction.excludedCount,
    overLimitCount: extraction.overLimitCount,
    latencyMs,
    inputTokens: response.usage?.input_tokens ?? 0,
  });
  if (pendingFrameOrigins.length > 0) result.pendingFrameOrigins = pendingFrameOrigins;

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
    ...(jevError.frameOrigins.length > 0 ? { pendingFrameOrigins: jevError.frameOrigins } : {}),
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
