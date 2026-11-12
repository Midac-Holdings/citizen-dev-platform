import type { AppEntry } from '../data/apps';

export type LaunchState =
  | { openable: true; url: string }
  | { openable: false; badge: string; reason: string };

/** アプリを開けるかどうか。準備中は開けない。 */
export function resolveLaunch(app: AppEntry): LaunchState {
  if (app.status !== 'available') {
    return { openable: false, badge: '準備中', reason: '準備中のため開けません' };
  }
  return { openable: true, url: app.path };
}
