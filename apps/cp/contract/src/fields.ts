// 契約書から読み取る項目（AI 読み取り API に渡す）
export const FIELDS = [
  { key: 'haishutsu_jigyosha', label: '排出事業者', hint: '産業廃棄物の処理を委託する側（委託者・甲）の会社名と住所' },
  { key: 'unpan_jigyosha', label: '運搬事業者', hint: '収集運搬を受託する会社名と住所（許可番号があれば併記）' },
  { key: 'haishutsu_jigyojo', label: '排出事業場', hint: '廃棄物が発生する事業場・工場の名称と所在地' },
  { key: 'shobun_jigyojo', label: '処分事業場', hint: '中間処理・最終処分を行う事業場の名称と所在地' },
  { key: 'seikyusaki', label: '請求先', hint: '処理料金の請求先（請求書の送付先）の会社名・部署・住所' },
] as const;

export type FieldKey = (typeof FIELDS)[number]['key'];
export type Values = Record<FieldKey, string>;

export const emptyValues = (): Values =>
  Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Values;

/** 読み取れなかった（契約書に記載がない）項目の表示 */
export const NOT_FOUND = '記載なし';

/** 台帳・Excel に出すときの値。空欄なら「記載なし」にする */
export const displayValue = (v: string): string => (v.trim() ? v : NOT_FOUND);
