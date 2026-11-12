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

/** Azure Static Web Apps のログイン情報を取得する。 */
export async function loadViewerFromSwa(fetchFn: typeof fetch = fetch): Promise<ViewerState> {
  try {
    const res = await fetchFn('/.auth/me');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { clientPrincipal } = (await res.json()) as { clientPrincipal: ClientPrincipal | null };
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
