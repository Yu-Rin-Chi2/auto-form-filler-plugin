/**
 * FieldOutcome[] を FillResult の集計カウンタに変換する（要件 2.6 + 付記1 対応）。
 * filled / skippedLowConfidence / noMatch / excluded は要件どおりの主要カウンタとして維持し、
 * それ以外（未設定・選択肢不一致・maxlength超過・既存値非上書き・分割不一致・回答不正）は
 * `skippedOther` に集約する。フィールド単位の内訳は FieldOutcome.reason で個別に判別できる。
 */
import type { FieldOutcome, FillResult, JevErrorKind } from '../../shared/types';

export interface AggregateMeta {
  url: string;
  profileId: string;
  excludedCount: number;
  latencyMs: number;
  inputTokens: number;
  error?: string;
  errorKind?: JevErrorKind;
  at?: string;
  /** 60 件上限を超えて Jev に送らなかった件数（付記1: skippedOther に合算する） */
  overLimitCount?: number;
}

export function aggregateFillResult(outcomes: FieldOutcome[], meta: AggregateMeta): FillResult {
  let filled = 0;
  let skippedLowConfidence = 0;
  let noMatch = 0;
  let skippedOther = 0;

  for (const o of outcomes) {
    switch (o.reason) {
      case 'filled':
        filled++;
        break;
      case 'skipped_low_confidence':
        skippedLowConfidence++;
        break;
      case 'no_match':
        noMatch++;
        break;
      default:
        skippedOther++;
        break;
    }
  }

  return {
    url: meta.url,
    profileId: meta.profileId,
    at: meta.at ?? new Date().toISOString(),
    filled,
    skippedLowConfidence,
    noMatch,
    excluded: meta.excludedCount,
    skippedOther: skippedOther + (meta.overLimitCount ?? 0),
    latencyMs: meta.latencyMs,
    inputTokens: meta.inputTokens,
    error: meta.error,
    errorKind: meta.errorKind,
  };
}
