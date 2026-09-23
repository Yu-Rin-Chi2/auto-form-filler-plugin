/**
 * SNS アカウント項目: ID / URL の相互変換と、URL 欄・ID 欄への出し分け。
 */
import { describe, expect, it } from 'vitest';
import { resolveFill } from '../../src/background/resolve/resolve';
import { snsHandle, snsProfileUrl, wantsUrl } from '../../src/shared/derive';
import { PROFILE_FIELD_DESCRIPTIONS } from '../../workers/src/profile-fields';
import { createEmptyProfileFields } from '../../src/shared/profile-schema';
import { SNS_FIELD_KEYS } from '../../src/shared/types';
import type { ExtractedField, ProfileFields } from '../../src/shared/types';

function fields(overrides: Partial<ProfileFields> = {}): ProfileFields {
  return { ...createEmptyProfileFields(), ...overrides };
}
function extracted(label: string, overrides: Partial<ExtractedField> = {}): ExtractedField {
  return { tag: 'input', type: 'text', label, currentValue: 'empty', ...overrides };
}
const SETTINGS = { confidenceThreshold: 0.7, overwriteFilled: false };

describe('snsHandle / snsProfileUrl', () => {
  it('@ の有無・前後空白を吸収してハンドルを取り出す', () => {
    expect(snsHandle('@yamada_taro')).toBe('yamada_taro');
    expect(snsHandle(' yamada_taro ')).toBe('yamada_taro');
    expect(snsHandle('https://x.com/yamada_taro')).toBe('yamada_taro');
    expect(snsHandle('https://www.youtube.com/@yamada_ch')).toBe('yamada_ch');
    expect(snsHandle('https://www.linkedin.com/in/yamada-taro/')).toBe('yamada-taro');
    expect(snsHandle('')).toBe('');
  });

  it('サービスごとのプロフィール URL を組み立てる（@ の慣習を含む）', () => {
    expect(snsProfileUrl('sns_x', '@yamada')).toBe('https://x.com/yamada');
    expect(snsProfileUrl('sns_youtube', 'yamada_ch')).toBe('https://www.youtube.com/@yamada_ch');
    expect(snsProfileUrl('sns_instagram', 'yamada')).toBe('https://www.instagram.com/yamada');
    expect(snsProfileUrl('sns_facebook', 'yamada.taro')).toBe('https://www.facebook.com/yamada.taro');
    expect(snsProfileUrl('sns_tiktok', '@yamada')).toBe('https://www.tiktok.com/@yamada');
    expect(snsProfileUrl('sns_github', 'yamada')).toBe('https://github.com/yamada');
    expect(snsProfileUrl('sns_linkedin', 'yamada-taro')).toBe('https://www.linkedin.com/in/yamada-taro');
    expect(snsProfileUrl('sns_note', 'yamada_note')).toBe('https://note.com/yamada_note');
  });

  it('保存値がすでに URL ならそのまま返す', () => {
    expect(snsProfileUrl('sns_x', 'https://twitter.com/yamada')).toBe('https://twitter.com/yamada');
  });
});

describe('wantsUrl', () => {
  it('type=url、ラベル / placeholder / name に URL・http・リンクがあれば URL 欄', () => {
    expect(wantsUrl({ type: 'url' })).toBe(true);
    expect(wantsUrl({ label: 'X の URL' })).toBe(true);
    expect(wantsUrl({ label: 'GitHub', placeholder: 'https://github.com/...' })).toBe(true);
    expect(wantsUrl({ label: 'ポートフォリオ', name: 'portfolio_link' })).toBe(true);
    expect(wantsUrl({ label: 'Instagram のアカウント名' })).toBe(false);
    expect(wantsUrl({ label: 'X（Twitter）ID', placeholder: '@example' })).toBe(false);
  });
});

describe('resolveFill: SNS の出し分け', () => {
  const profileFields = fields({ sns_x: '@yamada', sns_github: 'https://github.com/yamada', sns_instagram: '' });

  it('URL 欄には URL、ID 欄には保存値をそのまま入れる', () => {
    const { assignments, outcomes } = resolveFill({
      fields: {
        f0: extracted('X の URL', { type: 'url' }),
        f1: extracted('X（Twitter）ID'),
        f2: extracted('GitHub ユーザー名'),
        f3: extracted('Instagram'),
      },
      answers: {
        f0: { choice: 'sns_x', confidence: 0.9 },
        f1: { choice: 'sns_x', confidence: 0.9 },
        f2: { choice: 'sns_github', confidence: 0.9 },
        f3: { choice: 'sns_instagram', confidence: 0.9 },
      },
      profileFields,
      settings: SETTINGS,
    });
    expect(assignments.f0).toEqual({ kind: 'text', value: 'https://x.com/yamada' });
    expect(assignments.f1).toEqual({ kind: 'text', value: '@yamada' });
    // URL で保存していても、ID 欄には保存値のまま（勝手に切り出さない）
    expect(assignments.f2).toEqual({ kind: 'text', value: 'https://github.com/yamada' });
    expect(outcomes[3]?.reason).toBe('skipped_unset');
  });
});

describe('スキーマ', () => {
  it('SNS の全キーに既定値と Jev 向け説明がある', () => {
    const empty = createEmptyProfileFields();
    for (const k of SNS_FIELD_KEYS) {
      expect(empty[k]).toBe('');
      expect(PROFILE_FIELD_DESCRIPTIONS[k]).toBeTruthy();
    }
  });
});
