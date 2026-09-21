import type { ProfileField } from '../profile-fields';

/** 拡張の content script がフォームから抽出する想定のフィールド情報 */
export interface FieldFixture {
  tag: 'input' | 'select' | 'textarea';
  type?: string;
  name?: string;
  autocomplete?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** 直近の見出し */
  section?: string;
  /** select の選択肢（先頭数件のみ。実装でも全件は送らない想定） */
  options?: string[];
  maxlength?: number;
  /** 正解 */
  expected: ProfileField;
}

export interface FormFixture {
  id: string;
  title: string;
  url: string;
  lang: 'ja' | 'en';
  fields: FieldFixture[];
  /** ガードレール Noul が発火すべきか（省略時は false） */
  expectPayment?: boolean;
  expectLogin?: boolean;
}

const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '…', '東京都', '神奈川県', '…', '沖縄県'];
const YEARS = ['1950', '1951', '…', '2005', '2006'];
const MONTHS = ['1', '2', '3', '…', '12'];
const DAYS = ['1', '2', '3', '…', '31'];

export const FORMS: FormFixture[] = [
  {
    id: 'ec-signup',
    title: '会員登録 | サンプルショップ',
    url: 'https://shop.example.jp/signup',
    lang: 'ja',
    fields: [
      { tag: 'input', type: 'text', name: 'last_name', autocomplete: 'family-name', label: '姓', placeholder: '山田', required: true, section: 'お客様情報', expected: 'family_name' },
      { tag: 'input', type: 'text', name: 'first_name', autocomplete: 'given-name', label: '名', placeholder: '太郎', required: true, section: 'お客様情報', expected: 'given_name' },
      { tag: 'input', type: 'text', name: 'last_name_kana', label: 'セイ', placeholder: 'ヤマダ', required: true, section: 'お客様情報', expected: 'family_name_kana' },
      { tag: 'input', type: 'text', name: 'first_name_kana', label: 'メイ', placeholder: 'タロウ', required: true, section: 'お客様情報', expected: 'given_name_kana' },
      { tag: 'input', type: 'email', name: 'email', autocomplete: 'email', label: 'メールアドレス', placeholder: 'example@example.com', required: true, section: 'お客様情報', expected: 'email' },
      { tag: 'input', type: 'email', name: 'email_confirm', label: 'メールアドレス（確認用）', required: true, section: 'お客様情報', expected: 'email' },
      { tag: 'input', type: 'tel', name: 'tel', autocomplete: 'tel', label: '電話番号', placeholder: '09012345678', required: true, section: 'お客様情報', expected: 'phone' },
      { tag: 'input', type: 'text', name: 'zip', autocomplete: 'postal-code', label: '郵便番号', placeholder: '1000001', required: true, section: 'お届け先', expected: 'postal_code' },
      { tag: 'select', name: 'pref', autocomplete: 'address-level1', label: '都道府県', required: true, section: 'お届け先', options: PREFS, expected: 'prefecture' },
      { tag: 'input', type: 'text', name: 'city', autocomplete: 'address-level2', label: '市区町村', placeholder: '千代田区', required: true, section: 'お届け先', expected: 'city' },
      { tag: 'input', type: 'text', name: 'address1', autocomplete: 'address-line1', label: '番地', placeholder: '千代田1-1-1', required: true, section: 'お届け先', expected: 'address_line1' },
      { tag: 'input', type: 'text', name: 'address2', autocomplete: 'address-line2', label: '建物名・部屋番号', placeholder: 'サンプルマンション101', section: 'お届け先', expected: 'address_line2' },
      { tag: 'select', name: 'birth_year', autocomplete: 'bday-year', label: '生年月日', section: 'お客様情報', options: YEARS, expected: 'birth_year' },
      { tag: 'select', name: 'birth_month', autocomplete: 'bday-month', label: '月', section: 'お客様情報', options: MONTHS, expected: 'birth_month' },
      { tag: 'select', name: 'birth_day', autocomplete: 'bday-day', label: '日', section: 'お客様情報', options: DAYS, expected: 'birth_day' },
      { tag: 'input', type: 'radio', name: 'gender', label: '性別', section: 'お客様情報', options: ['男性', '女性', '回答しない'], expected: 'gender' },
      { tag: 'input', type: 'checkbox', name: 'mailmag', label: 'メールマガジンを受け取る', section: 'お客様情報', expected: 'none' },
    ],
  },
  {
    id: 'contact-cf7',
    title: 'お問い合わせ | 株式会社サンプル',
    url: 'https://www.example.co.jp/contact/',
    lang: 'ja',
    fields: [
      { tag: 'input', type: 'text', name: 'your-name', label: 'お名前', placeholder: '山田 太郎', required: true, expected: 'full_name' },
      { tag: 'input', type: 'text', name: 'your-kana', label: 'フリガナ', placeholder: 'ヤマダ タロウ', required: true, expected: 'full_name_kana' },
      { tag: 'input', type: 'text', name: 'your-company', label: '会社名', expected: 'company' },
      { tag: 'input', type: 'text', name: 'your-department', label: '部署名', expected: 'department' },
      { tag: 'input', type: 'email', name: 'your-email', label: 'メールアドレス', required: true, expected: 'email' },
      { tag: 'input', type: 'tel', name: 'your-tel', label: '電話番号', expected: 'phone' },
      { tag: 'select', name: 'your-subject', label: 'お問い合わせ種別', options: ['製品について', '採用について', 'その他'], required: true, expected: 'none' },
      { tag: 'textarea', name: 'your-message', label: 'お問い合わせ内容', required: true, expected: 'none' },
      { tag: 'input', type: 'checkbox', name: 'acceptance', label: 'プライバシーポリシーに同意する', required: true, expected: 'none' },
    ],
  },
  {
    id: 'google-forms',
    title: 'セミナー参加申込フォーム',
    url: 'https://docs.google.com/forms/d/e/xxxx/viewform',
    lang: 'ja',
    fields: [
      { tag: 'input', type: 'text', name: 'entry.1041234567', label: '氏名（漢字）', required: true, expected: 'full_name' },
      { tag: 'input', type: 'text', name: 'entry.1049876543', label: '氏名（カナ）', required: true, expected: 'full_name_kana' },
      { tag: 'input', type: 'text', name: 'entry.1052223344', label: '年齢', expected: 'age' },
      { tag: 'input', type: 'text', name: 'entry.1055556677', label: 'メールアドレス', required: true, expected: 'email' },
      { tag: 'input', type: 'text', name: 'entry.1058889900', label: '電話番号（ハイフンなし）', expected: 'phone' },
      { tag: 'input', type: 'text', name: 'entry.1061112233', label: 'ご住所', expected: 'address_full' },
      { tag: 'input', type: 'text', name: 'entry.1064445566', label: '参加希望日', expected: 'none' },
      { tag: 'textarea', name: 'entry.1067778899', label: 'ご質問・ご要望があればご記入ください', expected: 'none' },
    ],
  },
  {
    id: 'job-apply',
    title: '応募フォーム | 採用情報',
    url: 'https://recruit.example.com/apply',
    lang: 'ja',
    fields: [
      { tag: 'input', type: 'text', name: 'family_name', label: '姓（漢字）', required: true, section: '基本情報', expected: 'family_name' },
      { tag: 'input', type: 'text', name: 'first_name', label: '名（漢字）', required: true, section: '基本情報', expected: 'given_name' },
      { tag: 'input', type: 'text', name: 'family_name_kana', label: '姓（ふりがな）', required: true, section: '基本情報', expected: 'family_name_kana' },
      { tag: 'input', type: 'text', name: 'first_name_kana', label: '名（ふりがな）', required: true, section: '基本情報', expected: 'given_name_kana' },
      { tag: 'input', type: 'date', name: 'birthday', label: '生年月日', required: true, section: '基本情報', expected: 'birth_date' },
      { tag: 'input', type: 'text', name: 'postal', label: '郵便番号', section: '現住所', expected: 'postal_code' },
      { tag: 'input', type: 'text', name: 'address', label: '住所', section: '現住所', expected: 'address_full' },
      { tag: 'input', type: 'email', name: 'email', label: 'メールアドレス', required: true, section: '連絡先', expected: 'email' },
      { tag: 'input', type: 'tel', name: 'phone', label: '携帯電話番号', required: true, section: '連絡先', expected: 'phone' },
      { tag: 'select', name: 'education', label: '最終学歴', options: ['高校卒', '専門学校卒', '大学卒', '大学院卒'], section: '経歴', expected: 'none' },
      { tag: 'select', name: 'position', label: '希望職種', options: ['エンジニア', 'デザイナー', '営業'], section: '経歴', expected: 'none' },
      { tag: 'textarea', name: 'pr', label: '自己PR', section: '経歴', expected: 'none' },
    ],
  },
  {
    id: 'hotel-booking',
    title: 'ご予約 | サンプルホテル',
    url: 'https://hotel.example.jp/reserve',
    lang: 'ja',
    fields: [
      { tag: 'input', type: 'text', name: 'guest_last', label: '代表者氏名（姓）', required: true, section: '代表者情報', expected: 'family_name' },
      { tag: 'input', type: 'text', name: 'guest_first', label: '代表者氏名（名）', required: true, section: '代表者情報', expected: 'given_name' },
      { tag: 'input', type: 'text', name: 'guest_last_romaji', label: '姓（ローマ字）', placeholder: 'YAMADA', section: '代表者情報', expected: 'family_name_romaji' },
      { tag: 'input', type: 'text', name: 'guest_first_romaji', label: '名（ローマ字）', placeholder: 'TARO', section: '代表者情報', expected: 'given_name_romaji' },
      { tag: 'input', type: 'tel', name: 'tel1', label: '電話番号', maxlength: 4, required: true, section: '代表者情報', expected: 'phone' },
      { tag: 'input', type: 'tel', name: 'tel2', label: '', maxlength: 4, section: '代表者情報', expected: 'phone' },
      { tag: 'input', type: 'tel', name: 'tel3', label: '', maxlength: 4, section: '代表者情報', expected: 'phone' },
      { tag: 'input', type: 'text', name: 'zip1', label: '郵便番号', maxlength: 3, section: '代表者情報', expected: 'postal_code' },
      { tag: 'input', type: 'text', name: 'zip2', label: '', maxlength: 4, section: '代表者情報', expected: 'postal_code' },
      { tag: 'input', type: 'date', name: 'checkin', label: 'チェックイン日', required: true, section: 'ご宿泊内容', expected: 'none' },
      { tag: 'select', name: 'guests', label: 'ご利用人数', options: ['1', '2', '3', '4'], section: 'ご宿泊内容', expected: 'none' },
      { tag: 'textarea', name: 'request', label: 'ご要望', section: 'ご宿泊内容', expected: 'none' },
    ],
  },
  {
    id: 'municipal-event',
    title: '○○市 健康講座 申込',
    url: 'https://www.city.example.lg.jp/event/apply.html',
    lang: 'ja',
    fields: [
      { tag: 'input', type: 'text', name: 'shimei', label: '氏名', required: true, expected: 'full_name' },
      { tag: 'input', type: 'text', name: 'furigana', label: 'ふりがな', required: true, expected: 'full_name_kana' },
      { tag: 'input', type: 'text', name: 'yubin', label: '郵便番号', expected: 'postal_code' },
      { tag: 'input', type: 'text', name: 'jusho', label: '住所', required: true, expected: 'address_full' },
      { tag: 'input', type: 'text', name: 'denwa', label: '電話番号', required: true, expected: 'phone' },
      { tag: 'input', type: 'text', name: 'mail', label: 'メールアドレス', expected: 'email' },
      { tag: 'select', name: 'nenrei', label: '年齢', options: ['20代', '30代', '40代', '50代', '60代以上'], expected: 'age' },
      { tag: 'select', name: 'ninzu', label: '参加人数', options: ['1名', '2名', '3名'], expected: 'none' },
    ],
  },
  {
    // 対照群: 英語フォーム。CJK 起因の精度低下がどの程度かを見る
    id: 'en-checkout',
    title: 'Checkout | Example Store',
    url: 'https://store.example.com/checkout',
    lang: 'en',
    fields: [
      { tag: 'input', type: 'text', name: 'firstName', autocomplete: 'given-name', label: 'First name', required: true, section: 'Shipping address', expected: 'given_name' },
      { tag: 'input', type: 'text', name: 'lastName', autocomplete: 'family-name', label: 'Last name', required: true, section: 'Shipping address', expected: 'family_name' },
      { tag: 'input', type: 'email', name: 'email', autocomplete: 'email', label: 'Email', required: true, section: 'Contact', expected: 'email' },
      { tag: 'input', type: 'tel', name: 'phone', autocomplete: 'tel', label: 'Phone', section: 'Contact', expected: 'phone' },
      { tag: 'select', name: 'country', autocomplete: 'country', label: 'Country / Region', options: ['United States', 'Japan', 'United Kingdom'], required: true, section: 'Shipping address', expected: 'country' },
      { tag: 'input', type: 'text', name: 'zip', autocomplete: 'postal-code', label: 'ZIP / Postal code', required: true, section: 'Shipping address', expected: 'postal_code' },
      { tag: 'input', type: 'text', name: 'city', autocomplete: 'address-level2', label: 'City', required: true, section: 'Shipping address', expected: 'city' },
      { tag: 'input', type: 'text', name: 'address1', autocomplete: 'address-line1', label: 'Street address', required: true, section: 'Shipping address', expected: 'address_line1' },
      { tag: 'input', type: 'text', name: 'address2', autocomplete: 'address-line2', label: 'Apartment, suite, etc. (optional)', section: 'Shipping address', expected: 'address_line2' },
      { tag: 'input', type: 'text', name: 'company', autocomplete: 'organization', label: 'Company (optional)', section: 'Shipping address', expected: 'company' },
      { tag: 'input', type: 'date', name: 'dob', autocomplete: 'bday', label: 'Date of birth', section: 'Account', expected: 'birth_date' },
      { tag: 'textarea', name: 'notes', label: 'Order notes (optional)', section: 'Account', expected: 'none' },
    ],
  },
  {
    // ガードレール検証: ログイン画面。password は観測段階で除外されるので Jev には渡らない
    id: 'login',
    title: 'ログイン | サンプルショップ',
    url: 'https://shop.example.jp/login',
    lang: 'ja',
    expectLogin: true,
    fields: [
      { tag: 'input', type: 'email', name: 'login_id', autocomplete: 'username', label: 'メールアドレス', required: true, expected: 'email' },
      { tag: 'input', type: 'checkbox', name: 'remember', label: 'ログイン状態を保持する', expected: 'none' },
    ],
  },
  {
    // ガードレール検証: カード入力画面。カード情報はプロフィールに持たないので全部 none
    id: 'payment',
    title: 'お支払い情報の入力 | サンプルショップ',
    url: 'https://shop.example.jp/checkout/payment',
    lang: 'ja',
    expectPayment: true,
    fields: [
      { tag: 'input', type: 'text', name: 'card_name', autocomplete: 'cc-name', label: 'カード名義（ローマ字）', placeholder: 'TARO YAMADA', required: true, section: 'クレジットカード情報', expected: 'none' },
      { tag: 'input', type: 'text', name: 'card_number', autocomplete: 'cc-number', label: 'カード番号', placeholder: '1234 5678 9012 3456', required: true, section: 'クレジットカード情報', expected: 'none' },
      { tag: 'select', name: 'exp_month', autocomplete: 'cc-exp-month', label: '有効期限（月）', options: MONTHS, required: true, section: 'クレジットカード情報', expected: 'none' },
      { tag: 'select', name: 'exp_year', autocomplete: 'cc-exp-year', label: '有効期限（年）', options: ['2026', '2027', '2028', '…'], required: true, section: 'クレジットカード情報', expected: 'none' },
      { tag: 'input', type: 'text', name: 'cvv', autocomplete: 'cc-csc', label: 'セキュリティコード', maxlength: 4, required: true, section: 'クレジットカード情報', expected: 'none' },
      { tag: 'input', type: 'text', name: 'billing_zip', autocomplete: 'postal-code', label: '請求先郵便番号', section: '請求先', expected: 'postal_code' },
    ],
  },
];
