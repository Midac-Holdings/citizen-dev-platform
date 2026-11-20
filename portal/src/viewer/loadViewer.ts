import type { Viewer } from './types';

export type ViewerState =
  | { mode: 'swa'; viewer: Viewer }
  | { mode: 'demo' }
  | { mode: 'error'; message: string };

interface ClientPrincipal {
  userId: string;
  userDetails: string;
  userRoles: string[];
}

interface AppServiceIdentity {
  user_id?: string;
  user_claims?: { typ: string; val: string }[];
}

const ROLE_CLAIMS = ['roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];

/** App Service の認証（Easy Auth）の /.auth/me（配列）を、Static Web Apps と同じ形にする */
export function fromAppService(list: AppServiceIdentity[]): ClientPrincipal | null {
  const me = list[0];
  if (!me) return null;
  const claims = me.user_claims ?? [];
  const claim = (...types: string[]) => types.map((t) => claims.find((c) => c.typ === t)?.val).find(Boolean);
  const userId = claim('http://schemas.microsoft.com/identity/claims/objectidentifier', 'oid') ?? me.user_id;
  if (!userId) return null;
  const roles = claims.filter((c) => ROLE_CLAIMS.includes(c.typ) && /^[a-z0-9_]+$/.test(c.val)).map((c) => c.val);
  return {
    userId,
    userDetails: claim('preferred_username', 'name') ?? me.user_id ?? userId,
    userRoles: ['anonymous', 'authenticated', ...new Set(roles)],
  };
}

/** ログイン情報を取得する（Azure Static Web Apps と App Service の両方に対応）。 */
export async function loadViewerFromSwa(fetchFn: typeof fetch = fetch): Promise<ViewerState> {
  try {
    const res = await fetchFn('/.auth/me');
    if (res.status === 401) return { mode: 'error', message: 'ログインしていません。ページを再読み込みしてください。' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { clientPrincipal: ClientPrincipal | null } | AppServiceIdentity[];
    const clientPrincipal = Array.isArray(data) ? fromAppService(data) : data.clientPrincipal;
    if (!clientPrincipal) return { mode: 'error', message: 'ログインしていません。ページを再読み込みしてください。' };
    return {
      mode: 'swa',
      viewer: {
        id: clientPrincipal.userId,
        displayName: clientPrincipal.userDetails,
        roles: clientPrincipal.userRoles.filter((r) => r !== 'anonymous'),
        source: 'swa',
      },
    };
  } catch {
    return { mode: 'error', message: 'ログイン情報を取得できませんでした。' };
  }
}
