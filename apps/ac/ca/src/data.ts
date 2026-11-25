// CSV の行を債権・入金のデータにする（見出しの名前の違いを吸収する）
import { parseAmount } from './normalize';

export type Receivable = { id: string; customer: string; kana?: string; amount: number; due?: string };
export type Payment = { id: string; date: string; payer: string; amount: number };
export type LoadResult<T> = { items: T[]; errors: string[] };

const RECEIVABLE_COLUMNS = {
  id: ['請求番号', '請求No', '請求書番号', '伝票番号', '債権番号', '番号', 'No'],
  customer: ['取引先名', '取引先', '得意先名', '得意先', '顧客名', '請求先', '会社名'],
  kana: ['取引先カナ', '得意先カナ', 'フリガナ', 'カナ', '振込名義'],
  amount: ['請求金額', '請求残高', '債権金額', '残高', '金額'],
  due: ['入金予定日', '支払期日', '期日', '請求日'],
};
const PAYMENT_COLUMNS = {
  date: ['入金日', '振込日', '取引日', '日付'],
  payer: ['振込依頼人名', '振込依頼人', '依頼人名', '入金名義', '振込人', '名義', '摘要'],
  amount: ['入金額', '入金金額', 'お預り金額', '預入金額', '金額'],
};

const clean = (h: string) => h.normalize('NFKC').replace(/[\s()（）]/g, '');

/** 見出し行から、項目ごとの列番号を探す。完全一致を優先し、なければ部分一致。 */
export function findColumns<K extends string>(header: string[], columns: Record<K, string[]>): Record<K, number> {
  const hs = header.map(clean);
  const used = new Set<number>();
  const out = {} as Record<K, number>;
  for (const key of Object.keys(columns) as K[]) {
    const names = columns[key].map(clean);
    let idx = -1;
    for (const n of names) {
      idx = hs.findIndex((h, i) => !used.has(i) && h === n);
      if (idx >= 0) break;
    }
    if (idx < 0) {
      for (const n of names) {
        idx = hs.findIndex((h, i) => !used.has(i) && h.includes(n));
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) used.add(idx);
    out[key] = idx;
  }
  return out;
}

const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');

export function loadReceivables(rows: string[][]): LoadResult<Receivable> {
  if (rows.length === 0) return { items: [], errors: ['データがありません'] };
  const col = findColumns(rows[0], RECEIVABLE_COLUMNS);
  const missing = [col.customer < 0 && '取引先名', col.amount < 0 && '請求金額'].filter(Boolean);
  if (missing.length) return { items: [], errors: [`見出しに「${missing.join('」「')}」の列が見つかりません`] };
  const items: Receivable[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const amount = parseAmount(cell(row, col.amount));
    const customer = cell(row, col.customer);
    if (!customer || Number.isNaN(amount)) {
      errors.push(`${line}行目：取引先名または金額が読めないため、飛ばしました`);
      return;
    }
    items.push({
      id: cell(row, col.id) || `債権${line}行目`,
      customer,
      kana: cell(row, col.kana) || undefined,
      amount,
      due: cell(row, col.due) || undefined,
    });
  });
  return { items, errors };
}

export function loadPayments(rows: string[][]): LoadResult<Payment> {
  if (rows.length === 0) return { items: [], errors: ['データがありません'] };
  const col = findColumns(rows[0], PAYMENT_COLUMNS);
  const missing = [col.payer < 0 && '振込依頼人名', col.amount < 0 && '入金額'].filter(Boolean);
  if (missing.length) return { items: [], errors: [`見出しに「${missing.join('」「')}」の列が見つかりません`] };
  const items: Payment[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const amount = parseAmount(cell(row, col.amount));
    const payer = cell(row, col.payer);
    if (!payer || Number.isNaN(amount)) {
      errors.push(`${line}行目：振込依頼人名または金額が読めないため、飛ばしました`);
      return;
    }
    items.push({ id: `入金${line}行目`, date: cell(row, col.date), payer, amount });
  });
  return { items, errors };
}

export const SAMPLE_RECEIVABLES = [
  ['請求番号', '取引先名', '取引先カナ', '請求金額', '入金予定日'],
  ['INV-001', '株式会社さくら商事', 'サクラシヨウジ', '110,000', '2026/11/30'],
  ['INV-002', '株式会社さくら商事', 'サクラシヨウジ', '55,000', '2026/11/30'],
  ['INV-003', '有限会社みどり運輸', 'ミドリウンユ', '33,000', '2026/11/30'],
  ['INV-004', '青空工業株式会社', 'アオゾラコウギヨウ', '220,000', '2026/11/30'],
  ['INV-005', '東西サービス合同会社', 'トウザイサービス', '44,000', '2026/11/30'],
];
export const SAMPLE_PAYMENTS = [
  ['入金日', '振込依頼人名', '入金額'],
  ['2026/11/25', 'ｶ)ｻｸﾗｼﾖｳｼﾞ', '165,000'],
  ['2026/11/26', 'ﾕ)ﾐﾄﾞﾘｳﾝﾕ', '32,560'],
  ['2026/11/27', 'ｱｵｿﾞﾗｺｳｷﾞﾖｳ(ｶ', '220,000'],
  ['2026/11/28', 'ﾄｳｻﾞｲ ﾎﾝﾃﾝ', '44,000'],
  ['2026/11/28', 'ﾐﾅﾐﾔﾏ(ｶ', '10,000'],
];
