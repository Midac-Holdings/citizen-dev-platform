// 入金消込のロジック
import type { Payment, Receivable } from './data';
import { namesMatch } from './normalize';

export type MatchKind = 'exact' | 'combined' | 'fee' | 'amountOnly';
export type Match = { kind: MatchKind; payment: Payment; receivables: Receivable[]; diff: number };
export type MatchResult = {
  matches: Match[];
  unmatchedReceivables: Receivable[];
  unmatchedPayments: { payment: Payment; candidates: Receivable[] }[];
};

export const KIND_LABEL: Record<MatchKind, string> = {
  exact: '消込済（名義・金額一致）',
  combined: '消込済（複数の請求をまとめて入金）',
  fee: '消込済（振込手数料の差引）',
  amountOnly: '要確認（金額のみ一致）',
};

const MAX_COMBINE = 6; // まとめ入金として組み合わせる請求の最大件数
const MAX_CANDIDATES = 16; // 組み合わせを探す請求の最大件数（時間がかかりすぎないように）

/** candidates の中から、合計が target - tol 〜 target となる組み合わせを探す（件数の少ない順・期日の早い順）。 */
function findSubset(candidates: Receivable[], minTotal: number, maxTotal: number): Receivable[] | null {
  const list = candidates.slice(0, MAX_CANDIDATES);
  for (let size = 2; size <= Math.min(MAX_COMBINE, list.length); size++) {
    const pick: Receivable[] = [];
    const walk = (start: number, sum: number): Receivable[] | null => {
      if (pick.length === size) return sum >= minTotal && sum <= maxTotal ? [...pick] : null;
      for (let i = start; i < list.length; i++) {
        if (sum + list[i].amount > maxTotal && list[i].amount > 0) continue;
        pick.push(list[i]);
        const found = walk(i + 1, sum + list[i].amount);
        pick.pop();
        if (found) return found;
      }
      return null;
    };
    const found = walk(0, 0);
    if (found) return found;
  }
  return null;
}

const byDue = (a: Receivable, b: Receivable) => (a.due ?? '').localeCompare(b.due ?? '');

/**
 * 入金を債権に消し込む。
 * 1. 名義が一致する債権のうち、金額が一致する1件
 * 2. 名義が一致する債権の組み合わせで、合計が一致するもの（まとめ入金）
 * 3. 名義が一致し、差額が振込手数料の範囲内（1件 → 組み合わせの順）
 * 4. 名義は一致しないが、金額が一致する債権・入金がそれぞれ1件だけ（要確認）
 */
export function reconcile(receivables: Receivable[], payments: Payment[], feeTolerance = 880): MatchResult {
  const open = new Set(receivables);
  const matches: Match[] = [];
  const left: Payment[] = [];
  const tol = Math.max(0, feeTolerance);
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date));

  for (const p of sortedPayments) {
    const same = [...open].filter((r) => namesMatch(p.payer, r.customer, r.kana)).sort(byDue);
    const take = (kind: MatchKind, rs: Receivable[]) => {
      rs.forEach((r) => open.delete(r));
      matches.push({ kind, payment: p, receivables: rs, diff: rs.reduce((s, r) => s + r.amount, 0) - p.amount });
    };
    const exact = same.find((r) => r.amount === p.amount);
    if (exact) {
      take('exact', [exact]);
      continue;
    }
    const combo = findSubset(same, p.amount, p.amount);
    if (combo) {
      take('combined', combo);
      continue;
    }
    if (tol > 0) {
      const fee = same.find((r) => r.amount > p.amount && r.amount - p.amount <= tol);
      if (fee) {
        take('fee', [fee]);
        continue;
      }
      const feeCombo = findSubset(same, p.amount + 1, p.amount + tol);
      if (feeCombo) {
        take('fee', feeCombo);
        continue;
      }
    }
    left.push(p);
  }

  // 金額だけで一致：その金額の未消込の債権と入金が、それぞれ1件だけのとき
  const unmatchedPayments: MatchResult['unmatchedPayments'] = [];
  for (const p of left) {
    const sameAmountPayments = left.filter((q) => q.amount === p.amount);
    const sameAmountReceivables = [...open].filter((r) => r.amount === p.amount);
    if (sameAmountPayments.length === 1 && sameAmountReceivables.length === 1) {
      open.delete(sameAmountReceivables[0]);
      matches.push({ kind: 'amountOnly', payment: p, receivables: sameAmountReceivables, diff: 0 });
    } else {
      unmatchedPayments.push({ payment: p, candidates: [] });
    }
  }
  for (const u of unmatchedPayments) {
    u.candidates = [...open].filter((r) => namesMatch(u.payment.payer, r.customer, r.kana)).sort(byDue);
  }

  return {
    matches,
    unmatchedReceivables: receivables.filter((r) => open.has(r)),
    unmatchedPayments,
  };
}

/** 結果を CSV 用の行にする（債権1件につき1行）。 */
export function resultRows(result: MatchResult): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['状態', '請求番号', '取引先名', '請求金額', '入金日', '振込依頼人名', '入金額', '差額（請求−入金）'],
  ];
  for (const m of result.matches) {
    m.receivables.forEach((r, i) =>
      rows.push([KIND_LABEL[m.kind], r.id, r.customer, r.amount, m.payment.date, m.payment.payer, i === 0 ? m.payment.amount : '', i === 0 ? m.diff : '']),
    );
  }
  for (const r of result.unmatchedReceivables) rows.push(['未消込の債権', r.id, r.customer, r.amount, '', '', '', '']);
  for (const { payment: p } of result.unmatchedPayments) rows.push(['未消込の入金', '', '', '', p.date, p.payer, p.amount, '']);
  return rows;
}
