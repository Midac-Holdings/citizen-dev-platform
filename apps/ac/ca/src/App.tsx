import { useMemo, useState } from 'react';
import { decodeBytes, parseCsv, toCsv } from './csv';
import { loadPayments, loadReceivables, SAMPLE_PAYMENTS, SAMPLE_RECEIVABLES } from './data';
import type { Payment, Receivable } from './data';
import { KIND_LABEL, reconcile, resultRows } from './match';

const STORAGE_KEY = 'ac-ca:v1';
type Saved = { receivables: Receivable[]; payments: Payment[]; receivableFile: string; paymentFile: string; fee: number };
const EMPTY: Saved = { receivables: [], payments: [], receivableFile: '', paymentFile: '', fee: 880 };

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
type Tab = 'matched' | 'receivables' | 'payments';

function download(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readFile(file: File): Promise<string[][]> {
  return parseCsv(decodeBytes(new Uint8Array(await file.arrayBuffer())));
}

export default function App() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [messages, setMessages] = useState<{ receivables: string[]; payments: string[] }>({ receivables: [], payments: [] });
  const [tab, setTab] = useState<Tab>('matched');

  const update = (next: Partial<Saved>) => {
    setSaved((prev) => {
      const s = { ...prev, ...next };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        /* 保存できなくても画面では使える */
      }
      return s;
    });
  };

  const onReceivables = async (file: File | undefined) => {
    if (!file) return;
    const { items, errors } = loadReceivables(await readFile(file));
    setMessages((m) => ({ ...m, receivables: errors }));
    if (items.length) update({ receivables: items, receivableFile: file.name });
  };
  const onPayments = async (file: File | undefined) => {
    if (!file) return;
    const { items, errors } = loadPayments(await readFile(file));
    setMessages((m) => ({ ...m, payments: errors }));
    if (items.length) update({ payments: items, paymentFile: file.name });
  };

  const ready = saved.receivables.length > 0 && saved.payments.length > 0;
  const result = useMemo(
    () => (ready ? reconcile(saved.receivables, saved.payments, saved.fee) : null),
    [ready, saved.receivables, saved.payments, saved.fee],
  );
  const matchedReceivables = result ? result.matches.reduce((s, m) => s + m.receivables.length, 0) : 0;
  const needCheck = result ? result.matches.filter((m) => m.kind === 'amountOnly').length : 0;

  return (
    <div className="page">
      <p className="notice">データはこのブラウザ内（localStorage）にだけ保存されます。サーバーや社外には送信しません。</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>💴 入金消込アプリ</h1>
      </header>
      <main className="main">
        <section className="card">
          <h2>① 債権データ（請求の一覧）</h2>
          <p className="muted">CSV（UTF-8 / Shift_JIS）。見出しに「取引先名」「請求金額」が必要です。銀行の名義はカナなので、取引先名が漢字の場合は「取引先カナ」の列を入れてください。「請求番号」「入金予定日」もあると便利です。</p>
          <label>
            債権の CSV ファイル
            <input type="file" accept=".csv,text/csv" onChange={(e) => onReceivables(e.target.files?.[0])} />
          </label>
          {saved.receivableFile && <p className="done">{saved.receivableFile}：{saved.receivables.length}件</p>}
          {messages.receivables.map((m) => <p className="error" key={m}>{m}</p>)}
          <button type="button" className="sub" onClick={() => download('債権サンプル.csv', SAMPLE_RECEIVABLES)}>サンプル CSV をダウンロード</button>
        </section>

        <section className="card">
          <h2>② 入金データ（通帳・入金明細）</h2>
          <p className="muted">CSV（UTF-8 / Shift_JIS）。見出しに「振込依頼人名」「入金額」が必要です。「入金日」もあると便利です。</p>
          <label>
            入金の CSV ファイル
            <input type="file" accept=".csv,text/csv" onChange={(e) => onPayments(e.target.files?.[0])} />
          </label>
          {saved.paymentFile && <p className="done">{saved.paymentFile}：{saved.payments.length}件</p>}
          {messages.payments.map((m) => <p className="error" key={m}>{m}</p>)}
          <button type="button" className="sub" onClick={() => download('入金サンプル.csv', SAMPLE_PAYMENTS)}>サンプル CSV をダウンロード</button>
        </section>

        <section className="card">
          <h2>③ 設定</h2>
          <label>
            振込手数料として認める差額（円まで）
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={saved.fee}
              onChange={(e) => update({ fee: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <p className="muted">入金額が請求金額よりこの金額以内で少ない場合、振込手数料の差引として消し込みます。0 にすると差額を認めません。</p>
          <button type="button" className="sub" onClick={() => { update(EMPTY); setMessages({ receivables: [], payments: [] }); }}>
            データをすべて消す
          </button>
        </section>

        <section className="card wide">
          <h2>④ 消込結果</h2>
          {!result ? (
            <p className="muted">債権と入金の CSV を両方アップすると、自動で消込結果が表示されます。</p>
          ) : (
            <>
              <div className="stats">
                <div><span>消込できた債権</span><strong>{matchedReceivables} / {saved.receivables.length}件</strong></div>
                <div><span>要確認</span><strong>{needCheck}件</strong></div>
                <div><span>未消込の債権</span><strong>{result.unmatchedReceivables.length}件</strong><small>{yen(result.unmatchedReceivables.reduce((s, r) => s + r.amount, 0))}</small></div>
                <div><span>未消込の入金</span><strong>{result.unmatchedPayments.length}件</strong><small>{yen(result.unmatchedPayments.reduce((s, u) => s + u.payment.amount, 0))}</small></div>
              </div>
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'matched'} onClick={() => setTab('matched')}>消込結果（{result.matches.length}）</button>
                <button type="button" role="tab" aria-selected={tab === 'receivables'} onClick={() => setTab('receivables')}>未消込の債権（{result.unmatchedReceivables.length}）</button>
                <button type="button" role="tab" aria-selected={tab === 'payments'} onClick={() => setTab('payments')}>未消込の入金（{result.unmatchedPayments.length}）</button>
              </div>
              <div className="scroll">
                {tab === 'matched' && (
                  <table>
                    <thead><tr><th>状態</th><th>入金日</th><th>振込依頼人名</th><th>入金額</th><th>消し込んだ請求</th><th>差額</th></tr></thead>
                    <tbody>
                      {result.matches.map((m) => (
                        <tr key={m.payment.id} className={m.kind === 'amountOnly' ? 'warn' : ''}>
                          <td>{KIND_LABEL[m.kind]}</td>
                          <td>{m.payment.date}</td>
                          <td>{m.payment.payer}</td>
                          <td className="num">{yen(m.payment.amount)}</td>
                          <td>{m.receivables.map((r) => <div key={r.id}>{r.id} {r.customer} {yen(r.amount)}</div>)}</td>
                          <td className="num">{m.diff ? yen(m.diff) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {tab === 'receivables' && (
                  <table>
                    <thead><tr><th>請求番号</th><th>取引先名</th><th>請求金額</th><th>入金予定日</th></tr></thead>
                    <tbody>
                      {result.unmatchedReceivables.map((r) => (
                        <tr key={r.id}><td>{r.id}</td><td>{r.customer}</td><td className="num">{yen(r.amount)}</td><td>{r.due ?? ''}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {tab === 'payments' && (
                  <table>
                    <thead><tr><th>入金日</th><th>振込依頼人名</th><th>入金額</th><th>同じ名義の未消込の請求</th></tr></thead>
                    <tbody>
                      {result.unmatchedPayments.map(({ payment: p, candidates }) => (
                        <tr key={p.id}>
                          <td>{p.date}</td><td>{p.payer}</td><td className="num">{yen(p.amount)}</td>
                          <td>{candidates.length ? candidates.map((r) => <div key={r.id}>{r.id} {yen(r.amount)}</div>) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <button type="button" onClick={() => download('消込結果.csv', resultRows(result))}>結果を CSV でダウンロード</button>
              <p className="muted">「要確認」は名義が一致せず金額だけが一致したものです。内容を確認してから会計システムへ反映してください。</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
