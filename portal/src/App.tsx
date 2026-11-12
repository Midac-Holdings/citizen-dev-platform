import { useEffect, useMemo, useState } from 'react';
import { APP_CATEGORIES, portalApps, type AppEntry } from './data/apps';
import { filterVisibleApps } from './access/policy';
import { demoViewers } from './viewer/demoViewers';
import type { ViewerState } from './viewer/loadViewer';
import { filterApps, type CategoryFilter } from './lib/filterApps';
import { DemoNotice } from './components/DemoNotice';
import { ViewerSwitcher } from './components/ViewerSwitcher';
import { SearchControls } from './components/SearchControls';
import { AppCard } from './components/AppCard';

interface Props {
  apps?: readonly AppEntry[];
  loadViewer: () => Promise<ViewerState>;
}

export default function App({ apps = portalApps, loadViewer }: Props) {
  const [state, setState] = useState<ViewerState | null>(null);
  const [demoViewerId, setDemoViewerId] = useState(demoViewers[0].id);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  useEffect(() => {
    let alive = true;
    loadViewer().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [loadViewer]);

  const viewer =
    state?.mode === 'swa'
      ? state.viewer
      : state?.mode === 'demo'
        ? (demoViewers.find((v) => v.id === demoViewerId) ?? demoViewers[0])
        : null;

  const visibleApps = useMemo(() => (viewer ? filterVisibleApps(apps, viewer) : []), [apps, viewer]);
  const categories = APP_CATEGORIES.filter((c) => visibleApps.some((app) => app.category === c));
  // 利用者を切り替えて選択中カテゴリが無くなった場合は「すべて」に戻す
  const activeCategory = category !== 'all' && !categories.includes(category) ? 'all' : category;
  const shownApps = filterApps(visibleApps, { query, category: activeCategory });

  return (
    <div className="page">
      {state && state.mode !== 'error' && <DemoNotice mode={state.mode} />}
      <header className="hero">
        <div className="hero__inner">
          <p className="hero__eyebrow">Midac Holdings</p>
          <h1 className="hero__title">Midac市民アプリポータル</h1>
          <p className="hero__lead">社内のアプリをまとめて探せる入口です。</p>
          {state?.mode === 'demo' && (
            <ViewerSwitcher viewers={demoViewers} currentId={demoViewerId} onChange={setDemoViewerId} />
          )}
          {state?.mode === 'swa' && (
            <p className="signed-in">
              ログイン中：<strong>{state.viewer.displayName}</strong>
              <a className="signed-in__logout" href="/.auth/logout">ログアウト</a>
            </p>
          )}
        </div>
      </header>

      <main className="main">
        {state === null && <p className="empty">読み込み中…</p>}
        {state?.mode === 'error' && (
          <p className="empty" role="alert">{state.message}</p>
        )}
        {viewer && (
          <>
            <SearchControls
              query={query}
              onQueryChange={setQuery}
              categories={categories}
              category={activeCategory}
              onCategoryChange={setCategory}
            />
            <p className="result-count" aria-live="polite">
              {viewer.displayName}として表示中：{shownApps.length}件
            </p>
            {shownApps.length > 0 ? (
              <ul className="app-grid" aria-label="アプリ一覧">
                {shownApps.map((app) => (
                  <li key={app.id}>
                    <AppCard app={app} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">条件に合うアプリが見つかりません。</p>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        市民開発基盤APP。アプリの公開は、GitHubでの承認（プルリクエスト）を経て自動で行われます。
      </footer>
    </div>
  );
}
