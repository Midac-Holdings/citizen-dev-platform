import { useState, type FormEvent } from 'react';
import { KINDS, loadRequests, saveRequests, validate, type EquipmentRequest, type Kind } from './requests';

export default function App() {
  const [requests, setRequests] = useState<EquipmentRequest[]>(loadRequests);
  const [kind, setKind] = useState<Kind>(KINDS[0]);
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    const message = validate({ item, quantity: qty });
    setError(message);
    setDone(false);
    if (message) return;
    const next: EquipmentRequest[] = [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toLocaleDateString('ja-JP'),
        kind,
        item: item.trim(),
        quantity: qty,
        reason: reason.trim(),
      },
      ...requests,
    ];
    setRequests(next);
    saveRequests(next);
    setItem('');
    setQuantity('1');
    setReason('');
    setDone(true);
  }

  return (
    <div className="page">
      <p className="notice" role="note">デモ：申請内容はこのブラウザ内にだけ保存されます（総務Gには届きません）</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📦 備品申請</h1>
      </header>

      <main className="main">
        <form className="card" onSubmit={submit} noValidate>
          <h2>新しく申請する</h2>
          <label>
            種類
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            品名
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="例：ボールペン（黒）" />
          </label>
          <label>
            数量
            <input type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>
            理由（任意）
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：在庫切れのため" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {done && <p className="done" role="status">申請しました</p>}
          <button type="submit">申請する</button>
        </form>

        <section className="card">
          <h2>申請履歴</h2>
          {requests.length === 0 ? (
            <p className="muted">まだ申請はありません。</p>
          ) : (
            <table aria-label="申請履歴">
              <thead>
                <tr>
                  <th>申請日</th>
                  <th>種類</th>
                  <th>品名</th>
                  <th>数量</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.createdAt}</td>
                    <td>{r.kind}</td>
                    <td>{r.item}</td>
                    <td>{r.quantity}</td>
                    <td>申請中</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
