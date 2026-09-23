/**
 * Worker が受け取るデータの型。
 *
 * **ここに「利用者の個人情報の値」を入れる場所を作らないこと**（要件 P1）。
 * 拡張側の `CustomField` は `value` を持つが、この Worker の `JevCustomField` は持たない。
 * 型の上で渡せないようにすることが P1 の構造的な保証になっている。
 */

export interface JevPageInfo {
  url: string;
  title: string;
  lang: string;
}

/** フォーム項目の「見た目」の情報のみ。`currentValue` は空か埋まっているかのフラグで、値ではない */
export interface JevField {
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxlength?: number;
  section?: string;
  options?: string[];
  currentValue?: 'empty' | 'filled';
}

export type JevFields = Record<string, JevField>;

/** ユーザー定義項目のうち Jev に提示してよい部分。`value` は**意図的に持たない** */
export interface JevCustomField {
  id: string;
  label: string;
  description?: string;
}
