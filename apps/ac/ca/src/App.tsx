import { useMemo, useState } from 'react';
import { decodeBytes, parseCsv, toCsv } from './csv';
import { loadPayments, loadReceivables } from './data';
import type { Payment, Receivable } from './data';
import { invoiceRows, reconcile, resultRows } from './match';

const STORAGE_KEY = 'ac-ca:v1';
type Saved = { receivables: Receivable[]; payments: Payment[]; receivableFile: string; paymentFile: string; fee: number; started: boolean };
const EMPTY: Saved = { receivables: [], payments: [], receivableFile: '', paymentFile: '', fee: 880, started: false };

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
  // ファイル欄を作り直すための番号（全データ削除のあと、同じファイルを選び直しても読み込めるようにする）
  const [inputKey, setInputKey] = useState(0);

  const clearAll = () => {
    if (!window.confirm('アップしたデータと設定をすべて削除します。よろしいですか？')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 削除できなくても画面は初期状態に戻す */
    }
    setSaved(EMPTY);
    setMessages({ receivables: [], payments: [] });
    setTab('matched');
    setInputKey((k) => k + 1);
  };

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
    if (items.length) update({ receivables: items, receivableFile: file.name, started: false });
  };
  const onPayments = async (file: File | undefined) => {
    if (!file) return;
    const { items, errors } = loadPayments(await readFile(file));
    setMessages((m) => ({ ...m, payments: errors }));
    if (items.length) update({ payments: items, paymentFile: file.name, started: false });
  };

  const ready = saved.receivables.length > 0 && saved.payments.length > 0;
  const result = useMemo(
    () => (ready && saved.started ? reconcile(saved.receivables, saved.payments, saved.fee) : null),
    [ready, saved.started, saved.receivables, saved.payments, saved.fee],
  );
  const start = () => {
    update({ started: true });
    setTab('matched');
  };
  const rows = useMemo(() => (result ? invoiceRows(result, saved.receivables) : []), [result, saved.receivables]);
  const cleared = rows.filter((x) => x.remaining === 0);
  const partial = rows.filter((x) => x.remaining > 0);
  const unpaid = result ? result.unmatchedReceivables.filter((u) => u.balance === u.receivable.amount) : [];
  const needCheck = rows.filter((x) => x.attention).length;

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
            <input key={`r${inputKey}`} type="file" accept=".csv,text/csv" onChange={(e) => onReceivables(e.target.files?.[0])} />
          </label>
          {saved.receivableFile && <p className="done">{saved.receivableFile}：{saved.receivables.length}件</p>}
          {messages.receivables.map((m) => <p className="error" key={m}>{m}</p>)}
        </section>

        <section className="card">
          <h2>② 入金データ（通帳・入金明細）</h2>
          <p className="muted">CSV（UTF-8 / Shift_JIS）。見出しに「振込依頼人名」「入金額」が必要です。「入金日」もあると便利です。</p>
          <label>
            入金の CSV ファイル
            <input key={`p${inputKey}`} type="file" accept=".csv,text/csv" onChange={(e) => onPayments(e.target.files?.[0])} />
          </label>
          {saved.paymentFile && <p className="done">{saved.paymentFile}：{saved.payments.length}件</p>}
          {messages.payments.map((m) => <p className="error" key={m}>{m}</p>)}
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
              onChange={(e) => update({ fee: Math.max(0, Number(e.target.value) || 0), started: false })}
            />
          </label>
          <p className="muted">入金額が請求金額よりこの金額以内で少ない場合、振込手数料の差引として消し込みます。0 にすると差額を認めません。</p>
          <button type="button" className="danger" onClick={clearAll}>
            全データ削除
          </button>
        </section>

        <section className="startbar wide">
          <button type="button" className="start" onClick={start} disabled={!ready}>
            ▶ 消込開始
          </button>
          {!result && (
            <p className="muted">
              {ready
                ? '「消込開始」を押すと、債権と入金を突き合わせて結果を表示します。'
                : '①債権と②入金の CSV を両方アップすると、「消込開始」を押せるようになります。'}
            </p>
          )}
        </section>

        {result && (
          <section className="card wide">
            <h2>④ 消込結果</h2>
            <>
              <div className="stats">
                <div><span>消込完了の請求書</span><strong>{cleared.length}件</strong><small>{needCheck ? `うち確認が必要 ${cleared.filter((x) => x.attention).length}件` : `全${saved.receivables.length}件中`}</small></div>
                <div><span>一部入金の請求書</span><strong>{partial.length}件</strong><small>残高 {yen(partial.reduce((s, x) => s + x.remaining, 0))}</small></div>
                <div><span>未入金の請求書</span><strong>{unpaid.length}件</strong><small>{yen(unpaid.reduce((s, u) => s + u.balance, 0))}</small></div>
                <div><span>未消込の入金</span><strong>{result.unmatchedPayments.length}件</strong><small>{yen(result.unmatchedPayments.reduce((s, u) => s + u.payment.amount, 0))}</small></div>
              </div>
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'matched'} onClick={() => setTab('matched')}>消込結果（請求書 {rows.length}件）</button>
                <button type="button" role="tab" aria-selected={tab === 'receivables'} onClick={() => setTab('receivables')}>残高のある請求書（{result.unmatchedReceivables.length}件）</button>
                <button type="button" role="tab" aria-selected={tab === 'payments'} onClick={() => setTab('payments')}>未消込の入金（{result.unmatchedPayments.length}件）</button>
              </div>
              <div className="scroll">
                {tab === 'matched' && (
                  <table>
                    <thead><tr><th>状態</th><th>請求番号</th><th>取引先名</th><th>請求金額</th><th>入金（入金日・振込依頼人名・入金額）</th><th>消込額</th><th>差額・残高</th></tr></thead>
                    <tbody>
                      {rows.map((x) => (
                        <tr key={x.receivable.id} className={x.attention ? 'warn' : ''}>
                          <td>{x.label}</td>
                          <td>{x.receivable.id}</td>
                          <td>{x.receivable.customer}</td>
                          <td className="num">{yen(x.receivable.amount)}</td>
                          <td>{x.payments.map(({ payment: p }) => <div key={p.id}>{p.date} {p.payer} {yen(p.amount)}</div>)}</td>
                          <td className="num">{yen(x.applied)}</td>
                          <td className="num">{x.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {tab === 'receivables' && (
                  <table>
                    <thead><tr><th>請求番号</th><th>取引先名</th><th>請求金額</th><th>残高</th><th>入金予定日</th></tr></thead>
                    <tbody>
                      {result.unmatchedReceivables.map(({ receivable: r, balance }) => (
                        <tr key={r.id} className={balance < r.amount ? 'warn' : ''}>
                          <td>{r.id}</td><td>{r.customer}</td><td className="num">{yen(r.amount)}</td><td className="num">{yen(balance)}</td><td>{r.due ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {tab === 'payments' && (
                  <table>
                    <thead><tr><th>入金日</th><th>振込依頼人名</th><th>入金額</th><th>同じ名義の残高のある請求</th></tr></thead>
                    <tbody>
                      {result.unmatchedPayments.map(({ payment: p, candidates }) => (
                        <tr key={p.id}>
                          <td>{p.date}</td><td>{p.payer}</td><td className="num">{yen(p.amount)}</td>
                          <td>{candidates.length ? candidates.map((c) => <div key={c.receivable.id}>{c.receivable.id} 残高 {yen(c.balance)}</div>) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <p className="muted">表は請求書1件につき1行です（分割入金は、1行に複数の入金が入ります）。色の付いた行は確認が必要です。「一部入金」は残高を取引先に確認、「過入金」は多い分を仮受金にして返金か次回充当かを確認、「要確認」は名義が違い金額だけが一致したものです。内容を確認してから会計システムへ反映してください。</p>
              <div className="center">
                <button type="button" className="download" onClick={() => download('消込結果.csv', resultRows(result, saved.receivables))}>
                  ⬇ 消込結果を CSV でダウンロード
                </button>
              </div>
            </>
          </section>
        )}
      </main>
    </div>
  );
}
