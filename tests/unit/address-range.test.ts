/**
 * 住所欄の分割の度合いへの対応（要件 5.3 手順 4a）。
 * フォームごとに住所の分け方が違っても、各欄に「隣の欄が受け持たない部分」が入ることを確認する。
 */
import { describe, expect, it } from 'vitest';
import { resolveFill, type AnswerLike } from '../../src/background/resolve/resolve';
import { createEmptyProfileFields } from '../../src/shared/profile-schema';
import type { ExtractedField, ProfileFields } from '../../src/shared/types';

const PROFILE: ProfileFields = {
  ...createEmptyProfileFields(),
  postal_code: '220-0012',
  prefecture: '神奈川県',
  city: '横浜市西区',
  address_line1: 'みなとみらい1-1-1',
  address_line2: 'ランドマークタワー10階',
  city_kana: 'ヨコハマシニシク',
  address_line1_kana: 'ミナトミライ1-1-1',
  address_line2_kana: 'ランドマークタワー10カイ',
};

const SETTINGS = { confidenceThreshold: 0.7, overwriteFilled: false };

const text = (label: string): ExtractedField => ({ tag: 'input', type: 'text', label, currentValue: 'empty' });
const prefSelect = (): ExtractedField => ({
  tag: 'select',
  label: '都道府県',
  options: ['', '東京都', '神奈川県', '静岡県'],
  currentValue: 'empty',
});

function run(spec: [ExtractedField, AnswerLike][]) {
  const fields: Record<string, ExtractedField> = {};
  const answers: Record<string, AnswerLike> = {};
  spec.forEach(([f, a], i) => {
    fields[`f${i}`] = f;
    answers[`f${i}`] = a;
  });
  const { assignments, outcomes } = resolveFill({ fields, answers, profileFields: PROFILE, settings: SETTINGS });
  return {
    values: spec.map((_, i) => assignments[`f${i}`]?.value),
    reasons: outcomes.map((o) => o.reason),
  };
}

const sure = (choice: string): AnswerLike => ({ choice, confidence: 0.95 });

describe('住所の分割パターン', () => {
  it('1 欄だけなら従来どおり（full は全体、広げない）', () => {
    expect(run([[text('住所'), sure('address_full')]]).values).toEqual([
      '神奈川県横浜市西区みなとみらい1-1-1ランドマークタワー10階',
    ]);
  });

  it('市区町村だけを尋ねる 1 欄は広げない', () => {
    expect(run([[text('お住まいの市区町村'), sure('city')]]).values).toEqual(['横浜市西区']);
  });

  it('都道府県 + 1 欄 → 市区町村〜建物名', () => {
    expect(run([[prefSelect(), sure('prefecture')], [text('住所'), sure('address_full')]]).values).toEqual([
      '神奈川県',
      '横浜市西区みなとみらい1-1-1 ランドマークタワー10階',
    ]);
    // Jev が line1 と答えても、抜けている市区町村を引き受ける
    expect(run([[prefSelect(), sure('prefecture')], [text('住所'), sure('address_line1')]]).values[1]).toBe(
      '横浜市西区みなとみらい1-1-1 ランドマークタワー10階',
    );
  });

  it('都道府県 + 市区 + 1 欄 → 3 つ目は番地〜建物名（Jev が full / line1 / line2 のどれでも同じ）', () => {
    for (const choice of ['address_full', 'address_line1', 'address_line2']) {
      const { values } = run([
        [prefSelect(), sure('prefecture')],
        [text('市区郡'), sure('city')],
        [text('町名・番地'), sure(choice)],
      ]);
      expect(values).toEqual(['神奈川県', '横浜市西区', 'みなとみらい1-1-1 ランドマークタワー10階']);
    }
  });

  it('4 分割ならそれぞれの部分だけ', () => {
    expect(
      run([
        [prefSelect(), sure('prefecture')],
        [text('市区町村'), sure('city')],
        [text('番地'), sure('address_line1')],
        [text('建物名'), sure('address_line2')],
      ]).values,
    ).toEqual(['神奈川県', '横浜市西区', 'みなとみらい1-1-1', 'ランドマークタワー10階']);
  });

  it('住所1 + 住所2 → 都道府県〜番地 / 建物名', () => {
    for (const choice of ['address_full', 'address_line1']) {
      expect(run([[text('住所1'), sure(choice)], [text('住所2'), sure('address_line2')]]).values).toEqual([
        '神奈川県横浜市西区みなとみらい1-1-1',
        'ランドマークタワー10階',
      ]);
    }
  });

  it('郵便番号が挟まってもまとまりは途切れない', () => {
    expect(
      run([
        [text('郵便番号'), sure('postal_code')],
        [prefSelect(), sure('prefecture')],
        [text('市区'), sure('city')],
        [text('番地'), sure('address_line1')],
      ]).values,
    ).toEqual(['220-0012', '神奈川県', '横浜市西区', 'みなとみらい1-1-1 ランドマークタワー10階']);
  });

  it('住所以外の欄が挟まるとまとまりは切れる', () => {
    expect(
      run([
        [prefSelect(), sure('prefecture')],
        [text('会社名'), sure('company')],
        [text('番地'), sure('address_line1')],
      ]).values[2],
    ).toBe('みなとみらい1-1-1');
  });

  it('都道府県 + 市区町村で終わるフォームは市区町村を広げない', () => {
    expect(run([[prefSelect(), sure('prefecture')], [text('市区町村'), sure('city')]]).values).toEqual([
      '神奈川県',
      '横浜市西区',
    ]);
  });

  it('一体型の欄が続く場合（住所 + 住所の確認等）はそれぞれ全体を入れる', () => {
    const full = '神奈川県横浜市西区みなとみらい1-1-1ランドマークタワー10階';
    expect(run([[text('住所'), sure('address_full')], [text('住所（確認）'), sure('address_full')]]).values).toEqual([
      full,
      full,
    ]);
  });

  it('位置が DOM 順で並ばない判定には手を出さない', () => {
    expect(run([[text('番地'), sure('address_line1')], [text('市区町村'), sure('city')]]).values).toEqual([
      'みなとみらい1-1-1',
      '横浜市西区',
    ]);
  });

  it('カナも同様（区切りなし）で、漢字の欄と交互に並んでもよい', () => {
    expect(
      run([
        [text('市区町村'), sure('city')],
        [text('市区町村カナ'), sure('city_kana')],
        [text('番地'), sure('address_line1')],
        [text('番地カナ'), sure('address_line1_kana')],
      ]).values,
    ).toEqual([
      '横浜市西区',
      'ヨコハマシニシク',
      'みなとみらい1-1-1 ランドマークタワー10階',
      'ミナトミライ1-1-1ランドマークタワー10カイ',
    ]);
  });

  it('広げた値が maxlength に収まらなければ、その欄自身の部分だけ', () => {
    const { values } = run([
      [text('市区'), sure('city')],
      [{ ...text('番地'), maxlength: 12 }, sure('address_line1')],
    ]);
    expect(values[1]).toBe('みなとみらい1-1-1');
  });
});

describe('住所の確信度判定', () => {
  it('1 位の確信度が低くても、住所のいずれかである確率の合計が閾値以上なら入れる（実サイトで報告された事例）', () => {
    const { values, reasons } = run([
      [prefSelect(), sure('prefecture')],
      [text('静岡市'), sure('city')],
      [
        text('駿河区南町11番1号 静銀・あいち銀静岡駅南ビル6階'),
        {
          choice: 'address_full',
          confidence: 0.46,
          probabilities: { address_full: 0.48, address_line1: 0.22, address_line2: 0.25, none: 0.05 },
        },
      ],
    ]);
    expect(reasons[2]).toBe('filled');
    expect(values[2]).toBe('みなとみらい1-1-1 ランドマークタワー10階');
  });

  it('住所である確率の合計も低ければスキップ', () => {
    const { reasons } = run([
      [prefSelect(), sure('prefecture')],
      [text('市区'), sure('city')],
      [text('備考'), { choice: 'address_line1', confidence: 0.4, probabilities: { address_line1: 0.4, none: 0.6 } }],
    ]);
    expect(reasons[2]).toBe('skipped_low_confidence');
  });

  it('スキップされた欄も範囲の手がかりには使う（番地が落ちても建物名欄が番地を重複して入れない）', () => {
    const { values, reasons } = run([
      [text('市区'), sure('city')],
      [text('番地'), { choice: 'address_line1', confidence: 0.4, probabilities: { address_line1: 0.4, none: 0.6 } }],
      [text('建物名'), sure('address_line2')],
    ]);
    expect(reasons[1]).toBe('skipped_low_confidence');
    expect(values[2]).toBe('ランドマークタワー10階');
  });

  it('1 欄だけの住所は確率の合計で救済しない', () => {
    const { reasons } = run([
      [
        text('建物'),
        { choice: 'address_line2', confidence: 0.4, probabilities: { address_line2: 0.4, address_full: 0.35, none: 0.25 } },
      ],
    ]);
    expect(reasons[0]).toBe('skipped_low_confidence');
  });
});
