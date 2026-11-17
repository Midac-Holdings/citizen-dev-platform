import generated from '../generated/admin-apps.json';
import { STATUS_LABEL, csvFileName, toCsv, totalHours, type AdminApp } from './csv';

const allApps = generated as AdminApp[];

function download(apps: AdminApp[]) {
  const blob = new Blob([toCsv(apps)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFileName(new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPage({ apps = allApps, onDownload = download }: { apps?: AdminApp[]; onDownload?: (apps: AdminApp[]) => void }) {
  const missing = apps.filter((a) => !a.request).length;
  return (
    <div className="page">
      <header className="hero">
        <div className="hero__inner">
          <a className="hero__back" href="/">← アプリ一覧に戻る</a>
          <h1 className="hero__title">管理画面</h1>
          <p className="hero__lead">公開されている市民アプリと、その申請内容（①〜⑤）の一覧です。</p>
        </div>
      </header>

      <main className="main create">
        <section className="create-card" aria-label="集計">
          <div className="stats">
            <div className="stat">
              <span className="stat__num">{apps.length}</span>
              <span className="stat__label">アプリ数</span>
            </div>
            <div className="stat">
              <span className="stat__num">{totalHours(apps)}</span>
              <span className="stat__label">削減が期待される時間（時間/月・公開中の合計）</span>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={() => onDownload(apps)}>
              CSV をダウンロード
            </button>
          </div>
          <p className="hint">
            CSV は Excel でそのまま開けます。対象は main にマージ済みのアプリです（申請中の PR は含みません）。
            {missing > 0 && ` 申請内容が記録されていないアプリ（この仕組みより前に作ったもの）が ${missing} 件あります。`}
          </p>
        </section>

        <section className="create-card" aria-label="アプリ一覧">
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>① アプリ名</th>
                  <th>② 機能概要</th>
                  <th>③ 利用可能ユーザー</th>
                  <th>④ 削減される既存業務</th>
                  <th>⑤ 時間/月</th>
                  <th>URL</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.request?.summary ?? '—'}</td>
                    <td>{a.request?.access ?? '—'}</td>
                    <td>{a.request?.currentWork ?? '—'}</td>
                    <td className="num">{a.request?.hoursPerMonth ?? '—'}</td>
                    <td><code>{a.path}</code></td>
                    <td>{STATUS_LABEL[a.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
