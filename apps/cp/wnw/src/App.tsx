import { useEffect, useMemo, useState } from 'react';
import {
  fetchNews,
  fetchSubscription,
  findNew,
  formatDate,
  loadSeen,
  mergeSeen,
  saveSeen,
  setSubscription,
  type NewsResult,
  type Subscription,
} from './news';

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const ALL = 'すべて';

export default function App() {
  const [news, setNews] = useState<Load<NewsResult>>({ state: 'loading' });
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [firstVisit, setFirstVisit] = useState(false);
  const [category, setCategory] = useState(ALL);
  const [onlyNew, setOnlyNew] = useState(false);

  const load = () => {
    setNews({ state: 'loading' });
    fetchNews()
      .then((data) => {
        const seen = loadSeen();
        setFirstVisit(seen === null);
        setNewIds(findNew(data.items, seen));
        saveSeen(mergeSeen(data.items, seen)); // 次に開いたときは、今回の記事は「新着」にならない
        setNews({ state: 'ok', data });
      })
      .catch((e: Error) => setNews({ state: 'error', message: e.message }));
  };
  useEffect(load, []);

  const items = news.state === 'ok' ? news.data.items : [];
  const categories = useMemo(() => [ALL, ...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const shown = items.filter((i) => (category === ALL || i.category === category) && (!onlyNew || newIds.has(i.id)));

  return (
    <div className="page">
      <p className="notice">既読の記録はこのブラウザ内にだけ保存します。メール通知の登録（あなたのメールアドレス）は社内のサーバーに保存します。</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📰 What'sNew ウォッチャー</h1>
        <p className="lead">会社HPの「新着情報」をまとめて確認できます。</p>
      </header>
      <main className="main">
        <MailCard />

        <section className="card">
          <div className="row">
            <h2>新着情報</h2>
            <button className="secondary small" onClick={load} disabled={news.state === 'loading'}>
              再読み込み
            </button>
          </div>

          {news.state === 'loading' && <p className="muted">会社HPを確認しています…</p>}
          {news.state === 'error' && (
            <p className="error" role="alert">
              {news.message}
            </p>
          )}
          {news.state === 'ok' && (
            <>
              <p className="muted small-text">
                {firstVisit
                  ? '初めて開いたため、次回からは前回以降に増えた記事に「NEW」が付きます。'
                  : newIds.size > 0
                    ? `前回から ${newIds.size} 件の新着があります。`
                    : '前回から新しい記事はありません。'}
                （{new Date(news.data.fetchedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })} 時点）
              </p>
              <div className="filters" role="group" aria-label="種類で絞り込む">
                {categories.map((c) => (
                  <button key={c} className={`chip-btn${c === category ? ' active' : ''}`} aria-pressed={c === category} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
                {newIds.size > 0 && (
                  <label className="check">
                    <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
                    NEW だけ
                  </label>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="empty">該当する記事はありません</p>
              ) : (
                <ul className="news">
                  {shown.map((i) => (
                    <li key={i.id} className={newIds.has(i.id) ? 'is-new' : undefined}>
                      <div className="meta">
                        {newIds.has(i.id) && <span className="new">NEW</span>}
                        <time dateTime={i.date}>{formatDate(i.date)}</time>
                        {i.category && <span className="chip">{i.category}</span>}
                      </div>
                      <a href={i.url} target="_blank" rel="noopener noreferrer">
                        {i.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <a className="source" href={news.data.source} target="_blank" rel="noopener noreferrer">
                会社HPの新着情報一覧を開く ↗
              </a>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function MailCard() {
  const [sub, setSub] = useState<Load<Subscription>>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchSubscription()
      .then((data) => setSub({ state: 'ok', data }))
      .catch((e: Error) => setSub({ state: 'error', message: e.message }));
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await setSubscription(on);
      setSub({ state: 'ok', data });
      setMessage({ ok: true, text: on ? '登録しました。新着があるとメールでお知らせします。' : '解除しました。メールは届かなくなります。' });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mail">
      <h2>✉️ 新着をメールで受け取る</h2>
      <p className="muted small-text">会社HPに新しい記事が載ると、30分ほどでメールでお知らせします。</p>
      {sub.state === 'loading' && <p className="muted">登録状況を確認しています…</p>}
      {sub.state === 'error' && <p className="error">{sub.message}</p>}
      {sub.state === 'ok' && !sub.data.available && <p className="muted">{sub.data.reason}</p>}
      {sub.state === 'ok' && sub.data.available && (
        <>
          <p className="status">
            {sub.data.subscribed ? '受け取る（登録済み）' : '受け取らない'}
            <span className="addr">送り先：{sub.data.email}</span>
          </p>
          {sub.data.subscribed ? (
            <button className="secondary" onClick={() => toggle(false)} disabled={busy}>
              メールの受け取りをやめる
            </button>
          ) : (
            <button onClick={() => toggle(true)} disabled={busy}>
              メールで受け取る
            </button>
          )}
        </>
      )}
      {message && (
        <p className={message.ok ? 'done' : 'error'} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
