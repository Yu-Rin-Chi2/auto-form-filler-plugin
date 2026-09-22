import { describe, expect, it } from 'vitest';
import { findPendingFrameOrigins, mergeFrameExtractions, splitAssignmentsByFrame } from '../../src/background/frames';
import { MAX_FIELDS } from '../../src/shared/constants';
import type { ExtractedField, ExtractionResult } from '../../src/shared/types';

function field(label: string): ExtractedField {
  return { tag: 'input', type: 'text', label };
}

function extraction(overrides: Partial<ExtractionResult>): ExtractionResult {
  return {
    fields: {},
    page: { url: 'https://example.com/signup', title: 'signup', lang: 'ja' },
    excludedCount: 0,
    overLimitCount: 0,
    crossOriginFrameOrigins: [],
    isTopFrame: true,
    ...overrides,
  };
}

describe('mergeFrameExtractions', () => {
  it('最上位フレームを先頭に、フレーム順に通し ID を振り直す', () => {
    const merged = mergeFrameExtractions([
      {
        frameId: 7,
        result: extraction({
          isTopFrame: false,
          page: { url: 'https://frames.example.net/form', title: 'inner', lang: 'ja' },
          fields: { f0: field('姓'), f1: field('名') },
        }),
      },
      { frameId: 0, result: extraction({ fields: { f0: field('検索') } }) },
    ]);

    expect(Object.keys(merged.fields)).toEqual(['f0', 'f1', 'f2']);
    expect(merged.fields.f0?.label).toBe('検索');
    expect(merged.fields.f1?.label).toBe('姓');
    expect(merged.locations).toEqual({
      f0: { frameId: 0, localId: 'f0' },
      f1: { frameId: 7, localId: 'f0' },
      f2: { frameId: 7, localId: 'f1' },
    });
    // page 情報は最上位フレームのもの
    expect(merged.page.url).toBe('https://example.com/signup');
    expect(merged.reachedOrigins).toEqual(['https://example.com', 'https://frames.example.net']);
  });

  it('除外件数・超過件数を合算し、全体で MAX_FIELDS を超えた分は切り捨てて超過件数に加える', () => {
    const many: Record<string, ExtractedField> = {};
    for (let i = 0; i < MAX_FIELDS - 2; i++) many[`f${i}`] = field(`項目${i}`);
    const merged = mergeFrameExtractions([
      { frameId: 0, result: extraction({ fields: many, excludedCount: 1, overLimitCount: 2 }) },
      {
        frameId: 3,
        result: extraction({
          isTopFrame: false,
          fields: { f0: field('a'), f1: field('b'), f2: field('c'), f3: field('d') },
          excludedCount: 2,
        }),
      },
    ]);
    expect(Object.keys(merged.fields)).toHaveLength(MAX_FIELDS);
    expect(merged.excludedCount).toBe(3);
    expect(merged.overLimitCount).toBe(2 + 2);
  });

  it('各フレームで見つかったクロスオリジン iframe のオリジンを重複なく集める', () => {
    const merged = mergeFrameExtractions([
      { frameId: 0, result: extraction({ crossOriginFrameOrigins: ['https://a.test', 'https://b.test'] }) },
      { frameId: 1, result: extraction({ isTopFrame: false, crossOriginFrameOrigins: ['https://b.test'] }) },
    ]);
    expect(merged.crossOriginFrameOrigins).toEqual(['https://a.test', 'https://b.test']);
  });
});

describe('splitAssignmentsByFrame', () => {
  it('通し ID の割り当てをフレームごとの局所 ID に戻す', () => {
    const byFrame = splitAssignmentsByFrame(
      {
        f0: { kind: 'text', value: '検索語' },
        f1: { kind: 'text', value: '山田' },
        f2: { kind: 'select', value: '東京都' },
        f9: { kind: 'text', value: '対応表にない' },
      },
      {
        f0: { frameId: 0, localId: 'f0' },
        f1: { frameId: 7, localId: 'f0' },
        f2: { frameId: 7, localId: 'f1' },
      },
    );
    expect(byFrame.get(0)).toEqual({ f0: { kind: 'text', value: '検索語' } });
    expect(byFrame.get(7)).toEqual({
      f0: { kind: 'text', value: '山田' },
      f1: { kind: 'select', value: '東京都' },
    });
    expect(byFrame.size).toBe(2);
  });
});

describe('findPendingFrameOrigins', () => {
  it('到達済み・許可済みのオリジンを除いた、未許可の iframe オリジンだけを返す', () => {
    const pending = findPendingFrameOrigins(
      {
        crossOriginFrameOrigins: ['https://connect-js.stripe.com', 'https://same.test', 'https://granted.test'],
        reachedOrigins: ['https://example.com', 'https://same.test'],
      },
      ['https://granted.test'],
    );
    expect(pending).toEqual(['https://connect-js.stripe.com']);
  });
});
