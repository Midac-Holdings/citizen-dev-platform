import type { Viewer } from '../viewer/types';

/**
 * 「この利用者にこのアプリのカードを表示するか」の判定。
 *
 * 実際に開けるかどうかは Azure Static Web Apps のアクセス設定（staticwebapp.config.json）が決める。
 * ここはそれと同じ申告（app.manifest.json の access）を使って、カードの表示をそろえるだけ。
 */
export interface AccessPolicy {
  canView(viewer: Viewer, app: { access: readonly string[] }): boolean;
}

export const roleBasedPolicy: AccessPolicy = {
  canView(viewer, app) {
    return app.access.some((role) => viewer.roles.includes(role));
  },
};

export function filterVisibleApps<T extends { access: readonly string[] }>(
  apps: readonly T[],
  viewer: Viewer,
  policy: AccessPolicy = roleBasedPolicy,
): T[] {
  return apps.filter((app) => policy.canView(viewer, app));
}
