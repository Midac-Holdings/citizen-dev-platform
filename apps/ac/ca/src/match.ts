// 入金消込のロジック
// 請求ごとに「残高」を持ち、入金を残高に当てていく（一部入金・分割入金・過入金に対応する）。
import type { Payment, Receivable } from './data';
import { namesMatch } from './normalize';

export type MatchKind = 'exact' | 'installment' | 'combined' | 'fee' | 'partial' | 'overpaid' | 'amountOnly';
/** 1件の入金を、どの請求にいくら当てたか。 */
export type Allocation = { receivable: Receivable; applied: number; remaining: number };
export type Match = {
  kind: MatchKind;
  payment: Payment;
  allocations: Allocation[];
  /** 差額。fee：振込手数料（請求側が多い）／partial：消し込んだ後の残高／overpaid：多く入金された額 */
  diff: number;
};
export type OpenReceivable = { receivable: Receivable; balance: number };
export type MatchResult = {
  matches: Match[];
  /** 残高が残っている請求（一部入金のものを含む） */
  unmatchedReceivables: OpenReceivable[];
  unmatchedPayments: { payment: Payment; candidates: OpenReceivable[] }[];
};

export const KIND_LABEL: Record<MatchKind, string> = {
  exact: '消込済（名義・金額一致）',
  installment: '消込済（分割入金で完済）',
  combined: '消込済（複数の請求をまとめて入金）',
  fee: '消込済（振込手数料の差引）',
  partial: '一部入金（残高あり）',
  overpaid: '過入金（多く入金）',
  amountOnly: '要確認（金額のみ一致）',
};

/** 担当者が確認したほうがよい結果（画面で色を付ける）。 */
export const NEEDS_ATTENTION: ReadonlySet<MatchKind> = new Set(['partial', 'overpaid', 'amountOnly']);

/** 差額の欄に出す文字。 */
export function diffLabel(m: Match): string {
  const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
  if (m.kind === 'fee') return `手数料 ${yen(m.diff)}`;
  if (m.kind === 'partial') return `残高 ${yen(m.diff)}`;
  if (m.kind === 'overpaid') return `過入金 ${yen(m.diff)}`;
  return '';
}

const MAX_COMBINE = 6; // まとめ入金として組み合わせる請求の最大件数
const MAX_CANDIDATES = 16; // 組み合わせを探す請求の最大件数（時間がかかりすぎないように）

type Open = { receivable: Receivable; balance: number; paidBefore: boolean };

/** candidates の中から、残高の合計が minTotal 〜 maxTotal となる組み合わせを探す（件数の少ない順・期日の早い順）。 */
function findSubset(candidates: Open[], minTotal: number, maxTotal: number): Open[] | null {
  const list = candidates.slice(0, MAX_CANDIDATES);
  for (let size = 2; size <= Math.min(MAX_COMBINE, list.length); size++) {
    const pick: Open[] = [];
    const walk = (start: number, sum: number): Open[] | null => {
      if (pick.length === size) return sum >= minTotal && sum <= maxTotal ? [...pick] : null;
      for (let i = start; i < list.length; i++) {
        if (sum + list[i].balance > maxTotal && list[i].balance > 0) continue;
        pick.push(list[i]);
        const found = walk(i + 1, sum + list[i].balance);
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

const byDue = (a: Open, b: Open) => (a.receivable.due ?? '').localeCompare(b.receivable.due ?? '');

/**
 * 入金を債権に消し込む（入金日の早い順に処理する）。
 * 1. 名義が一致する請求のうち、残高と金額が一致する1件（前に一部入金があれば「分割入金で完済」）
 * 2. 名義が一致する請求の組み合わせで、残高の合計が一致するもの（まとめ入金）
 * 3. 名義が一致し、差額が振込手数料の範囲内（1件 → 組み合わせの順）
 * 4. 名義が一致し、入金が残高の合計より少ない → 期日の早い請求から当てる（一部入金。残りは残高として残す）
 * 5. 名義が一致し、入金が残高の合計より多い → すべて消し込み、超えた分を過入金とする
 * 6. 名義は一致しないが、金額が一致する請求・入金がそれぞれ1件だけ（要確認）
 */
export function reconcile(receivables: Receivable[], payments: Payment[], feeTolerance = 880): MatchResult {
  const opens: Open[] = receivables.map((r) => ({ receivable: r, balance: r.amount, paidBefore: false }));
  const isOpen = (o: Open) => o.balance > 0;
  const matches: Match[] = [];
  const left: Payment[] = [];
  const tol = Math.max(0, feeTolerance);
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date));

  for (const p of sortedPayments) {
    const same = opens.filter((o) => isOpen(o) && namesMatch(p.payer, o.receivable.customer, o.receivable.kana)).sort(byDue);
    /** 指定した額を請求に当てる。 */
    const apply = (kind: MatchKind, parts: [Open, number][], diff: number) => {
      const allocations = parts.map(([o, amount]) => {
        o.balance -= amount;
        o.paidBefore = true;
        return { receivable: o.receivable, applied: amount, remaining: o.balance };
      });
      matches.push({ kind, payment: p, allocations, diff });
    };
    /** 請求の残高をすべて消す。 */
    const clear = (kind: MatchKind, os: Open[]) => {
      const total = os.reduce((s, o) => s + o.balance, 0);
      apply(kind, os.map((o) => [o, o.balance]), total - p.amount);
    };

    const exact = same.find((o) => o.balance === p.amount);
    if (exact) {
      clear(exact.paidBefore ? 'installment' : 'exact', [exact]);
      continue;
    }
    const combo = findSubset(same, p.amount, p.amount);
    if (combo) {
      clear('combined', combo);
      continue;
    }
    if (tol > 0) {
      const fee = same.find((o) => o.balance > p.amount && o.balance - p.amount <= tol);
      if (fee) {
        clear('fee', [fee]);
        continue;
      }
      const feeCombo = findSubset(same, p.amount + 1, p.amount + tol);
      if (feeCombo) {
        clear('fee', feeCombo);
        continue;
      }
    }
    const total = same.reduce((s, o) => s + o.balance, 0);
    if (same.length && p.amount < total) {
      // 一部入金：期日の早い請求から順に当てる
      let rest = p.amount;
      const parts: [Open, number][] = [];
      for (const o of same) {
        if (rest <= 0) break;
        const amount = Math.min(rest, o.balance);
        parts.push([o, amount]);
        rest -= amount;
      }
      const [lastOpen, lastAmount] = parts[parts.length - 1];
      apply('partial', parts, lastOpen.balance - lastAmount);
      continue;
    }
    if (same.length && p.amount > total) {
      // 過入金：残高をすべて消し込み、超えた分は仮受金などで処理してもらう
      apply('overpaid', same.map((o) => [o, o.balance]), p.amount - total);
      continue;
    }
    left.push(p);
  }

  // 金額だけで一致：その金額の未消込の請求と入金が、それぞれ1件だけのとき
  const unmatched: Payment[] = [];
  for (const p of left) {
    const sameAmountPayments = left.filter((q) => q.amount === p.amount);
    const sameAmountOpens = opens.filter((o) => isOpen(o) && o.balance === p.amount);
    if (sameAmountPayments.length === 1 && sameAmountOpens.length === 1) {
      const o = sameAmountOpens[0];
      o.balance = 0;
      matches.push({ kind: 'amountOnly', payment: p, allocations: [{ receivable: o.receivable, applied: p.amount, remaining: 0 }], diff: 0 });
    } else {
      unmatched.push(p);
    }
  }

  const toOpen = (o: Open): OpenReceivable => ({ receivable: o.receivable, balance: o.balance });
  return {
    matches,
    unmatchedReceivables: opens.filter(isOpen).map(toOpen),
    unmatchedPayments: unmatched.map((p) => ({
      payment: p,
      candidates: opens
        .filter((o) => isOpen(o) && namesMatch(p.payer, o.receivable.customer, o.receivable.kana))
        .sort(byDue)
        .map(toOpen),
    })),
  };
}

/** 請求書1件ごとの消込結果（表と CSV に使う）。 */
export type InvoiceRow = {
  receivable: Receivable;
  payments: { payment: Payment; applied: number }[];
  applied: number;
  remaining: number;
  label: string;
  attention: boolean;
  /** 差額の欄に出す文字（手数料・過入金・残高） */
  note: string;
  diffKind: '' | '振込手数料' | '過入金' | '残高';
  diff: number;
};

/** 消込結果を請求書ごとにまとめる（入金のあった請求書だけ。並びは債権 CSV の順）。 */
export function invoiceRows(result: MatchResult, receivables: Receivable[]): InvoiceRow[] {
  const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
  const byReceivable = new Map<Receivable, { match: Match; allocation: Allocation; index: number }[]>();
  for (const m of result.matches) {
    m.allocations.forEach((a, index) => {
      const list = byReceivable.get(a.receivable) ?? [];
      list.push({ match: m, allocation: a, index });
      byReceivable.set(a.receivable, list);
    });
  }
  const rows: InvoiceRow[] = [];
  for (const r of receivables) {
    const list = byReceivable.get(r);
    if (!list) continue;
    const last = list[list.length - 1];
    const remaining = last.allocation.remaining;
    const applied = list.reduce((s, x) => s + x.allocation.applied, 0);
    const kind = last.match.kind;
    let label: string;
    let diffKind: InvoiceRow['diffKind'] = '';
    let diff = 0;
    if (remaining > 0) {
      label = KIND_LABEL.partial;
      diffKind = '残高';
      diff = remaining;
    } else if (list.length > 1) {
      label = KIND_LABEL.installment;
    } else if (kind === 'partial') {
      // 一部入金の入金で、この請求書は残高まで消し込めた（期日の早い順に当てた）
      label = '消込済（期日の早い順に充当）';
    } else {
      label = KIND_LABEL[kind];
      const isFirst = last.index === 0;
      const isLast = last.index === last.match.allocations.length - 1;
      if (kind === 'fee' && isFirst) {
        diffKind = '振込手数料';
        diff = last.match.diff;
      } else if (kind === 'overpaid' && isLast) {
        diffKind = '過入金';
        diff = last.match.diff;
      }
    }
    const attention = remaining > 0 || list.some((x) => NEEDS_ATTENTION.has(x.match.kind) && x.match.kind !== 'partial');
    const note = diffKind === '振込手数料' ? `手数料 ${yen(diff)}` : diffKind ? `${diffKind} ${yen(diff)}` : '';
    rows.push({
      receivable: r,
      payments: list.map((x) => ({ payment: x.match.payment, applied: x.allocation.applied })),
      applied,
      remaining,
      label,
      attention,
      note,
      diffKind,
      diff,
    });
  }
  return rows;
}

/** 結果を CSV 用の行にする（請求書1件につき1行。複数の入金は「 / 」でつなぐ）。 */
export function resultRows(result: MatchResult, receivables: Receivable[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['状態', '請求番号', '取引先名', '請求金額', '入金日', '振込依頼人名', '入金額', '消込額', '残高', '差額の内容', '差額'],
  ];
  const balance = new Map(result.unmatchedReceivables.map((u) => [u.receivable, u.balance]));
  const done = new Map(invoiceRows(result, receivables).map((row) => [row.receivable, row]));
  for (const r of receivables) {
    const row = done.get(r);
    if (row) {
      const join = (f: (x: InvoiceRow['payments'][number]) => string | number) => row.payments.map(f).join(' / ');
      rows.push([
        row.label,
        r.id,
        r.customer,
        r.amount,
        join((x) => x.payment.date),
        join((x) => x.payment.payer),
        join((x) => x.payment.amount),
        row.applied,
        row.remaining,
        row.diffKind,
        row.diffKind ? row.diff : '',
      ]);
    } else {
      rows.push(['未入金', r.id, r.customer, r.amount, '', '', '', 0, balance.get(r) ?? r.amount, '', '']);
    }
  }
  for (const { payment: p } of result.unmatchedPayments) {
    rows.push(['未消込の入金', '', '', '', p.date, p.payer, p.amount, '', '', '', '']);
  }
  return rows;
}
