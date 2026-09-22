import type { CustomField, ProfileFieldKey } from './types';

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
  prefecture_kana: 'Prefecture reading in katakana（都道府県のカナ・フリガナ）',
  city_kana: 'City, ward, town, village reading in katakana（市区町村のカナ・フリガナ）',
  address_line1_kana: 'Street address, block and house number reading in katakana（町名・番地のカナ・フリガナ）',
  address_line2_kana: 'Building name, floor, room number reading in katakana（建物名・部屋番号のカナ・フリガナ）',
  address_kana_full: 'Full address reading in katakana in a single field（住所のカナ・フリガナ 全体）',
  country: 'Country（国）',
  company: 'Company / organization name（会社名・団体名）',
  department: 'Department / division（部署名）',
  website: 'Website / homepage URL（ホームページ・会社サイトの URL）',
  birth_date: 'Date of birth as a single field（生年月日）',
  birth_year: 'Birth year（生年月日の年）',
  birth_month: 'Birth month（生年月日の月）',
  birth_day: 'Birth day of month（生年月日の日）',
  age: 'Age in years（年齢）',
  gender: 'Gender（性別）',
  bank_name: 'Bank / financial institution name（銀行名・金融機関名）',
  bank_code: 'Bank code, 4 digits（銀行コード・金融機関コード）',
  branch_name: 'Bank branch name（支店名）',
  branch_code: 'Bank branch code / branch number, 3 digits（支店コード・店番）',
  account_type: 'Bank account type: 普通 (ordinary) / 当座 (current) / 貯蓄 (savings)（預金種別・口座種別）',
  account_number: 'Bank account number, usually 7 digits（口座番号）',
  account_holder_kana: 'Bank account holder name in katakana（口座名義・口座名義人 カナ）',
  account_holder: 'Bank account holder name in kanji（口座名義人 漢字）',
  sns_x: 'X (Twitter) account ID / handle or profile URL（X・Twitter のアカウント ID・URL）',
  sns_youtube: 'YouTube channel handle or channel URL（YouTube のチャンネル ID・URL）',
  sns_instagram: 'Instagram account ID or profile URL（Instagram のアカウント ID・URL）',
  sns_facebook: 'Facebook account / page ID or profile URL（Facebook のアカウント ID・URL）',
  sns_tiktok: 'TikTok account ID or profile URL（TikTok のアカウント ID・URL）',
  sns_github: 'GitHub username or profile URL（GitHub のユーザー名・URL）',
  sns_linkedin: 'LinkedIn profile ID or profile URL（LinkedIn のプロフィール ID・URL）',
  sns_note: 'note.com (Japanese blogging platform) account ID or profile URL（note のアカウント ID・URL）',
  none: 'No profile value fits: free-form text, a question, a consent checkbox, a preference, or not personal information',
};

export const PROFILE_FIELD_KEYS_FOR_JEV = Object.keys(PROFILE_FIELD_DESCRIPTIONS) as ProfileFieldKey[];

/**
 * ユーザー定義項目の Jev 向け説明文。label（必須）と description（任意）だけを使い、value は含めない。
 * label が空の項目は Jev に提示しない（判定のしようがないため）。
 */
export function describeCustomField(field: CustomField): string | null {
  const label = field.label.trim();
  if (!label) return null;
  const description = field.description.trim();
  return description ? `User-defined entry "${label}": ${description}` : `User-defined entry "${label}"`;
}

/**
 * 固定項目 + ユーザー定義項目 の説明（Jev の `state.profile`）。`none` は末尾に置く
 * （選択肢の並びを固定項目 → ユーザー定義 → none に保つため）。
 */
export function buildProfileDescriptions(customFields: CustomField[] = []): Record<string, string> {
  const { none, ...fixed } = PROFILE_FIELD_DESCRIPTIONS;
  const out: Record<string, string> = { ...fixed };
  for (const c of customFields) {
    const text = describeCustomField(c);
    if (text) out[c.id] = text;
  }
  out.none = none;
  return out;
}
