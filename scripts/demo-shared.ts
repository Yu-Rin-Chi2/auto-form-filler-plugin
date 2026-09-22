/**
 * 掲載用スクリーンショット（store-screenshots.ts）とデモ GIF（record-demo-gif.ts）で共有する、
 * デモプロフィール・モック Jev の応答・ポップアップ画像の合成処理。
 */
import { PNG } from 'pngjs';
import { buildChoiceAnswer } from '../e2e/fixtures-data';
import type { JevHandler } from '../e2e/mock-server';
import { createEmptyProfileFields } from '../src/shared/profile-schema';
import type { Profile } from '../src/shared/types';

/** デモフォームの name 属性 → プロフィール項目。モック Jev はこの表どおりに回答する */
const ANSWER_BY_NAME: Record<string, string> = {
  last_name: 'family_name',
  first_name: 'given_name',
  last_name_kana: 'family_name_kana',
  first_name_kana: 'given_name_kana',
  email: 'email',
  tel: 'phone',
  birth_year: 'birth_year',
  birth_month: 'birth_month',
  birth_day: 'birth_day',
  gender: 'gender',
  zip: 'postal_code',
  pref: 'prefecture',
  city: 'city',
  address1: 'address_line1',
  address2: 'address_line2',
};

export const demoHandler: JevHandler = (rawBody) => {
  const body = rawBody as {
    questions?: Record<string, unknown>;
    state?: { fields?: Record<string, { name?: string }> };
  };
  const answers: Record<string, unknown> = {};
  for (const id of Object.keys(body.questions ?? {})) {
    const name = body.state?.fields?.[id]?.name ?? '';
    answers[id] = buildChoiceAnswer(ANSWER_BY_NAME[name] ?? 'none');
  }
  return {
    status: 200,
    body: { model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 4000, output_tokens: 50 } },
  };
};

/** 掲載用のダミープロフィール（実在しない値） */
export function buildDemoProfile(): Profile {
  const now = new Date().toISOString();
  return {
    id: 'profile-demo',
    name: '個人',
    color: '#2563EB',
    createdAt: now,
    updatedAt: now,
    fields: {
      ...createEmptyProfileFields(),
      family_name: '山田',
      given_name: '太郎',
      family_name_kana: 'ヤマダ',
      given_name_kana: 'タロウ',
      family_name_romaji: 'YAMADA',
      given_name_romaji: 'TARO',
      email: 'taro.yamada@example.com',
      phone: '090-1234-5678',
      postal_code: '150-0002',
      prefecture: '東京都',
      city: '渋谷区',
      address_line1: '渋谷1-2-3',
      address_line2: 'サンプルビル 5F',
      country: '日本',
      company: '株式会社サンプル',
      department: '開発部',
      birth_date: '1990-04-15',
      gender: 'male',
    },
  };
}

export const POPUP_MARGIN = 12;

/** ポップアップ画像を背景画像の右上に、影付きで合成する */
export function composePopup(background: Buffer, popup: Buffer): PNG {
  const bg = PNG.sync.read(background);
  const fg = PNG.sync.read(popup);
  const x0 = bg.width - fg.width - POPUP_MARGIN;
  const y0 = POPUP_MARGIN;

  // 影（外側 12px を距離に応じて暗くする）
  const shadow = 12;
  for (let y = y0 - shadow; y < y0 + fg.height + shadow; y++) {
    for (let x = x0 - shadow; x < x0 + fg.width + shadow; x++) {
      if (x < 0 || y < 0 || x >= bg.width || y >= bg.height) continue;
      const dx = Math.max(0, x0 - x, x - (x0 + fg.width - 1));
      const dy = Math.max(0, y0 - y, y - (y0 + fg.height - 1));
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0 || d > shadow) continue;
      const alpha = 0.28 * (1 - d / shadow) ** 2;
      const idx = (bg.width * y + x) << 2;
      for (let c = 0; c < 3; c++) bg.data[idx + c] = Math.round(bg.data[idx + c] * (1 - alpha));
    }
  }

  // 本体 + 1px の枠線
  for (let y = 0; y < fg.height; y++) {
    for (let x = 0; x < fg.width; x++) {
      const bx = x0 + x;
      const by = y0 + y;
      if (bx >= bg.width || by >= bg.height) continue;
      const bi = (bg.width * by + bx) << 2;
      const fi = (fg.width * y + x) << 2;
      const edge = x === 0 || y === 0 || x === fg.width - 1 || y === fg.height - 1;
      bg.data[bi] = edge ? 0xd1 : fg.data[fi];
      bg.data[bi + 1] = edge ? 0xd5 : fg.data[fi + 1];
      bg.data[bi + 2] = edge ? 0xdb : fg.data[fi + 2];
      bg.data[bi + 3] = 255;
    }
  }
  return bg;
}
