import { useCallback, useState } from 'react';
import { loadNews, type NewsItem } from './news';
import { clearSeen, loadSeen, mergeSeen, newIds, saveSeen } from './seen';

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: NewsItem[]; fresh: Set<string>; firstTime: boolean; lastVisit: string | null; fetchedAt: string };

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
};
const fmtDate = (ymd: string) => ymd.replace(/-/g, '.');

type Props = { fetchFn?: typeof fetch; now?: () => Date };

export default function App({ fetchFn, now = () => new Date() }: Props) {
  const [view, setView] = useState<View>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const { items, fetchedAt } = await loadNews(fetchFn ?? ((...a) => fetch(...a)));
      const seen = loadSeen();
      const ids = items.map((i) => i.id);
      const fresh = newIds(ids, seen);
      saveSeen(mergeSeen(ids, seen, now()));
      setView({ kind: 'ready', items, fresh, firstTime: !seen, lastVisit: seen?.lastVisit ?? null, fetchedAt });
    } catch (e) {
      setView({ kind: 'error', message: e instanceof Error ? e.message : '読み取りに失敗しました' });
    }
  }, [fetchFn, now]);

  const reset = () => {
    if (!window.confirm('既読の記録を消しますか？（次に読み込んだときは初回と同じ扱いになります）')) return;
    clearSeen();
    if (view.kind === 'ready') setView({ ...view, fresh: new Set(), firstTime: true, lastVisit: null });
  };

  return (
    <div className="page">
      <p className="notice">既読の記録はこのブラウザ内にだけ保存されます（別のパソコン・スマホとは共有されません）</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📰 会社HP What'sNewウォッチャー</h1>
      </header>
      <main className="main single">
        <section className="card">
          <div className="toolbar">
            <h2>新着情報</h2>
            <button type="button" onClick={() => void refresh()} disabled={view.kind === 'loading'}>
              {view.kind === 'loading' ? '読み込み中…' : view.kind === 'idle' ? '新着情報を読み込む' : '最新を読み込む'}
            </button>
          </div>

          {view.kind === 'idle' && <IdleHint />}
          {view.kind === 'loading' && <p className="muted">会社HPの新着情報を読み込んでいます…</p>}
          {view.kind === 'error' && (
            <p className="error" role="alert">
              {view.message}
            </p>
          )}
          {view.kind === 'ready' && (
            <>
              <p className="summary" aria-live="polite">
                {view.firstTime
                  ? '初めて開いたので、今ある記事をすべて既読にしました。次からは増えた記事に「NEW」が付きます。'
                  : view.fresh.size > 0
                    ? `前回（${fmt(view.lastVisit!)}）のあとに増えた記事が ${view.fresh.size} 件あります。`
                    : `前回（${fmt(view.lastVisit!)}）のあとに増えた記事はありません。`}
              </p>
              <ul className="news">
                {view.items.map((item) => (
                  <li key={item.id} className={view.fresh.has(item.id) ? 'is-new' : undefined}>
                    <div className="meta">
                      {view.fresh.has(item.id) && <span className="badge">NEW</span>}
                      <time dateTime={item.date}>{fmtDate(item.date)}</time>
                      {item.category && <span className="cat">{item.category}</span>}
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="foot">
                <p className="muted">読み込んだ時刻：{fmt(view.fetchedAt)}（会社HPの新着情報ページより）</p>
                <button type="button" className="secondary" onClick={reset}>
                  既読をリセット
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

// 読み込む前の案内。会社HPへは、ボタンを押したときだけ読みに行く（自動で繰り返し読みに行かない）
function IdleHint() {
  const seen = loadSeen();
  return (
    <p className="muted">
      {seen
        ? `前回見たのは ${fmt(seen.lastVisit)} です。ボタンを押すと、そのあとに増えた記事に「NEW」が付きます。`
        : 'ボタンを押すと、会社HPの新着情報を読み込みます。'}
    </p>
  );
}
