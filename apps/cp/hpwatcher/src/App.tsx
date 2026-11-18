import { useCallback, useState } from 'react';
import { fetchNews, NEWS_URL, type NewsItem } from './news';
import { clearRead, loadRead, markRead, saveRead, unreadIds, type ReadState } from './storage';

type Props = { fetchFn?: typeof fetch; now?: () => Date };

const systemNow = () => new Date();

const fmtDate = (d: string) => d.replace(/-/g, '/');
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function App({ fetchFn, now = systemNow }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [readState, setReadState] = useState<ReadState | null>(() => loadRead());
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetchNews(fetchFn ?? fetch);
      const ids = r.items.map((i) => i.id);
      const current = loadRead();
      if (current) {
        setUnread(unreadIds(ids, current));
        setReadState(current);
      } else {
        // 初めて使うとき：今ある記事を既読にして、次回から新着を表示する
        const first = markRead(ids, null, now());
        saveRead(first);
        setReadState(first);
        setUnread(new Set());
      }
      setItems(r.items);
      setFetchedAt(r.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み取りに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [fetchFn, now]);

  const commit = (ids: string[]) => {
    const next = markRead(ids, readState, now());
    saveRead(next);
    setReadState(next);
    setUnread((prev) => {
      const s = new Set(prev);
      ids.forEach((id) => s.delete(id));
      return s;
    });
  };

  const reset = () => {
    if (!window.confirm('既読の記録を消しますか？（次に確認したときは、初めてと同じ扱いになります）')) return;
    clearRead();
    setReadState(null);
    setUnread(new Set());
  };

  const shown = onlyUnread ? items.filter((i) => unread.has(i.id)) : items;

  return (
    <div className="page">
      <p className="notice">既読の記録はこのブラウザ内（localStorage）にだけ保存されます。</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📰 MidacHP 新着ウォッチャー</h1>
        <p className="lead">当社HPの「新着情報」を一覧にし、まだ見ていない記事に「新着」を付けます。</p>
      </header>
      <main className="main">
        <section className="card summary" aria-live="polite">
          <div className="count">
            {loading && items.length === 0 ? (
              <span>読み込み中…</span>
            ) : !fetchedAt ? (
              <span>「新着を確認」を押すと、当社HPの新着情報を読み込みます。</span>
            ) : (
              <>
                <span className="num">{unread.size}</span>
                <span>件の新着（未読）</span>
              </>
            )}
          </div>
          <p className="muted small">
            {fetchedAt && <>取得：{fmtTime(fetchedAt)}</>}
            {readState && <> ／ 前回の既読：{fmtTime(readState.checkedAt)}</>}
          </p>
          <div className="actions">
            <button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? '読み込み中…' : '新着を確認'}
            </button>
            <button type="button" className="secondary" onClick={() => commit([...unread])} disabled={unread.size === 0}>
              すべて既読にする
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
            未読だけ表示
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="card">
          <h2>新着情報</h2>
          {fetchedAt && shown.length === 0 && !loading && (
            <p className="muted">{onlyUnread ? '未読の記事はありません。' : '記事がありません。'}</p>
          )}
          <ul className="news">
            {shown.map((n) => {
              const isNew = unread.has(n.id);
              return (
                <li key={n.id} className={isNew ? 'unread' : undefined}>
                  <div className="meta">
                    <span>{fmtDate(n.date)}</span>
                    {n.category && <span className="cat">{n.category}</span>}
                    {isNew && <span className="badge">新着</span>}
                  </div>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" onClick={() => isNew && commit([n.id])}>
                    {n.title}
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="muted small">
            元のページ：
            <a href={NEWS_URL} target="_blank" rel="noopener noreferrer">
              当社HP 新着情報
            </a>
          </p>
        </section>

        <section className="card">
          <h2>使い方・ご注意</h2>
          <ul className="muted small help">
            <li>「新着を確認」を押すと、当社HPの新着情報を読み込みます。</li>
            <li>初めて確認したときは、今ある記事をすべて既読にします。次から、増えた記事に「新着」が付きます。</li>
            <li>記事を開くか「すべて既読にする」を押すと、既読になります。</li>
            <li>新着時のメール通知は、まだ利用できません（準備中）。</li>
            <li>別のパソコンやスマートフォンでは、既読の記録は共有されません。</li>
          </ul>
          <button type="button" className="link" onClick={reset}>
            既読の記録を消す
          </button>
        </section>
      </main>
    </div>
  );
}
