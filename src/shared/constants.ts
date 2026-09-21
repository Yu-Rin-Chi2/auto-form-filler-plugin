/**
 * content / background の両方から参照される定数。
 * MAX_FIELDS はかつて `src/content/extract.ts` と `src/background/jev/build-request.ts` に
 * それぞれ別定義（値は同じ 60）されていたが、値のズレを防ぐためここに一本化する（レビュー指摘 A-3）。
 */

/** フィールド抽出・Jev リクエストに含める上限件数（要件 5.1.4）。超過分は切り捨ててカウントする */
export const MAX_FIELDS = 60;
