import type { ProfileFieldKey } from './types';

/**
 * Jev に送るプロフィール項目の説明（英語）。
 * `poc/profile-fields.ts` を移植。値は一切含めない（項目名 + 説明文のみ、要件 P1）。
 *
 * poc 版との差分: 要件 2.4 は派生項目として `full_name_romaji`
 * （given_name_romaji + family_name_romaji の英語語順）を定義しているが、
 * poc/profile-fields.ts には含まれていなかった（PoC フィクスチャで検証していなかったため）。
 * 要件定義を正として本実装では追加する。
 */
export const PROFILE_FIELD_DESCRIPTIONS: Record<ProfileFieldKey, string> = {
  family_name: 'Family name / surname in kanji（姓・苗字）',
  given_name: 'Given name / first name in kanji（名）',
  full_name: 'Full name in a single field, family name then given name（氏名・お名前）',
  family_name_kana: 'Family name reading in katakana or hiragana（セイ・姓のフリガナ・ふりがな）',
  given_name_kana: 'Given name reading in katakana or hiragana（メイ・名のフリガナ・ふりがな）',
  full_name_kana: 'Full name reading in a single field（フリガナ・ふりがな）',
  family_name_romaji: 'Family name in Latin letters（姓・ローマ字）',
  given_name_romaji: 'Given name in Latin letters（名・ローマ字）',
  full_name_romaji: 'Full name in Latin letters in a single field, given name then family name（氏名のローマ字表記）',
  email: 'Email address（メールアドレス）; also for confirmation re-entry fields',
  phone: 'Phone number（電話番号）; also for each part of a split phone number',
  postal_code: 'Postal / ZIP code（郵便番号）; also for each part of a split postal code',
  prefecture: 'Prefecture / state（都道府県）',
  city: 'City, ward, town, village（市区町村）',
  address_line1: 'Street address, block and house number（町名・番地）',
  address_line2: 'Building name, floor, room number（建物名・部屋番号）',
  address_full: 'Full address in a single field（住所 全体）',
  country: 'Country（国）',
  company: 'Company / organization name（会社名・団体名）',
  department: 'Department / division（部署名）',
  birth_date: 'Date of birth as a single field（生年月日）',
  birth_year: 'Birth year（生年月日の年）',
  birth_month: 'Birth month（生年月日の月）',
  birth_day: 'Birth day of month（生年月日の日）',
  age: 'Age in years（年齢）',
  gender: 'Gender（性別）',
  none: 'No profile value fits: free-form text, a question, a consent checkbox, a preference, or not personal information',
};

export const PROFILE_FIELD_KEYS_FOR_JEV = Object.keys(PROFILE_FIELD_DESCRIPTIONS) as ProfileFieldKey[];
