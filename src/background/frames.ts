/**
 * 複数フレーム（最上位ページ + iframe）にまたがる抽出結果の統合と、入力割り当ての分配。
 *
 * content script はフレームごとに独立して動き、各フレーム内で `f0, f1, ...` の局所 ID を振る。
 * Jev には 1 リクエストにまとめて送るため、ここで全フレーム通しの ID（同じく `f0, f1, ...`）に
 * 振り直し、Jev の回答を各フレームの局所 ID へ戻すための対応表を持つ。
 *
 * このモジュールは chrome API に触れない純粋関数のみ（vitest で単体テストする）。
 */
import { MAX_FIELDS } from '../shared/constants';
import type { ExtractedFields, ExtractionResult, FillAssignment, PageInfo } from '../shared/types';

export interface FrameExtraction {
  frameId: number;
  result: ExtractionResult;
}

export interface FieldLocation {
  frameId: number;
  localId: string;
}

export interface MergedExtraction {
  /** 全フレーム通しの ID をキーにしたフィールド */
  fields: ExtractedFields;
  /** 最上位フレームのページ情報（Jev に送る URL・タイトルはこれ） */
  page: PageInfo;
  excludedCount: number;
  overLimitCount: number;
  /** 通し ID → どのフレームのどの局所 ID か */
  locations: Record<string, FieldLocation>;
  /** 全フレームで見つかった、別オリジンの可視 iframe のオリジン（重複なし） */
  crossOriginFrameOrigins: string[];
  /** 実際に content script が動いた（= アクセスできた）フレームのオリジン */
  reachedOrigins: string[];
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * フレームごとの抽出結果を、最上位フレーム → 出現順 の順で 1 つにまとめる。
 * 全体で MAX_FIELDS を超えた分は overLimitCount に加算して切り捨てる。
 */
export function mergeFrameExtractions(extractions: FrameExtraction[]): MergedExtraction {
  const ordered = [...extractions].sort((a, b) => {
    if (a.result.isTopFrame !== b.result.isTopFrame) return a.result.isTopFrame ? -1 : 1;
    return a.frameId - b.frameId;
  });

  const top = ordered.find((e) => e.result.isTopFrame) ?? ordered[0];
  if (!top) {
    throw new Error('mergeFrameExtractions: 抽出結果がありません');
  }

  const fields: ExtractedFields = {};
  const locations: Record<string, FieldLocation> = {};
  let excludedCount = 0;
  let overLimitCount = 0;
  let index = 0;
  const crossOrigin = new Set<string>();
  const reached = new Set<string>();

  for (const { frameId, result } of ordered) {
    excludedCount += result.excludedCount;
    overLimitCount += result.overLimitCount;
    for (const o of result.crossOriginFrameOrigins ?? []) crossOrigin.add(o);
    const origin = originOf(result.page.url);
    if (origin) reached.add(origin);

    for (const [localId, field] of Object.entries(result.fields)) {
      if (index >= MAX_FIELDS) {
        overLimitCount++;
        continue;
      }
      const id = `f${index}`;
      index++;
      fields[id] = field;
      locations[id] = { frameId, localId };
    }
  }

  return {
    fields,
    page: top.result.page,
    excludedCount,
    overLimitCount,
    locations,
    crossOriginFrameOrigins: Array.from(crossOrigin),
    reachedOrigins: Array.from(reached),
  };
}

/**
 * 通し ID で表された入力割り当てを、フレームごと・局所 ID の割り当てに分ける。
 * 対応表にない ID は無視する（起こり得ないが防御的に）。
 */
export function splitAssignmentsByFrame(
  assignments: Record<string, FillAssignment>,
  locations: Record<string, FieldLocation>,
): Map<number, Record<string, FillAssignment>> {
  const byFrame = new Map<number, Record<string, FillAssignment>>();
  for (const [id, assignment] of Object.entries(assignments)) {
    const loc = locations[id];
    if (!loc) continue;
    let bucket = byFrame.get(loc.frameId);
    if (!bucket) {
      bucket = {};
      byFrame.set(loc.frameId, bucket);
    }
    bucket[loc.localId] = assignment;
  }
  return byFrame;
}

/**
 * ページ内に見つかったクロスオリジン iframe のうち、content script が到達できなかった
 * （= まだホスト権限がない）オリジンを返す。
 * `permittedOrigins` は chrome.permissions で許可済みと判定されたオリジン。
 */
export function findPendingFrameOrigins(
  merged: Pick<MergedExtraction, 'crossOriginFrameOrigins' | 'reachedOrigins'>,
  permittedOrigins: Iterable<string>,
): string[] {
  const permitted = new Set(permittedOrigins);
  const reached = new Set(merged.reachedOrigins);
  return merged.crossOriginFrameOrigins.filter((o) => !reached.has(o) && !permitted.has(o));
}
