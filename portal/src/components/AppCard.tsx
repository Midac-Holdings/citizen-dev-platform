import type { CSSProperties } from 'react';
import type { AppEntry } from '../data/apps';
import { resolveLaunch } from '../lib/launch';

export function AppCard({ app }: { app: AppEntry }) {
  const launch = resolveLaunch(app);
  const style = { '--accent': app.color } as CSSProperties;

  return (
    <article className="app-card" style={style} aria-labelledby={`app-${app.id}`}>
      <div className="app-card__head">
        <span className="app-card__icon" aria-hidden="true">{app.icon}</span>
        <span className="app-card__category">{app.category}</span>
      </div>
      <h3 id={`app-${app.id}`} className="app-card__name">{app.name}</h3>
      <p className="app-card__desc">{app.description}</p>
      <div className="app-card__foot">
        <span className="badge badge--path">{app.path}</span>
        {launch.openable ? (
          <a className="button" href={launch.url}>
            開く<span className="visually-hidden">（{app.name}）</span>
          </a>
        ) : (
          <button type="button" className="button" disabled title={launch.reason}>
            {launch.badge}<span className="visually-hidden">（{launch.reason}）</span>
          </button>
        )}
      </div>
    </article>
  );
}
