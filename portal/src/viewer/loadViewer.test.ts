import { describe, expect, it } from 'vitest';
import { loadViewerFromSwa } from './loadViewer';

const respond = (body: unknown, ok = true) =>
  (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;

describe('loadViewerFromSwa', () => {
  it('/.auth/me のロールを利用者に変換する（anonymous は除く）', async () => {
    const state = await loadViewerFromSwa(
      respond({ clientPrincipal: { userId: 'u1', userDetails: 'taro@example.com', userRoles: ['anonymous', 'authenticated', 'general_affairs'] } }),
    );
    expect(state).toEqual({
      mode: 'swa',
      viewer: { id: 'u1', displayName: 'taro@example.com', roles: ['authenticated', 'general_affairs'], source: 'swa' },
    });
  });

  it('App Service の /.auth/me（配列）も読める。ロールはアプリ ロールの roles', async () => {
    const state = await loadViewerFromSwa(
      respond([
        {
          user_id: 'taro@example.com',
          user_claims: [
            { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'oid-1' },
            { typ: 'preferred_username', val: 'taro@example.com' },
            { typ: 'roles', val: 'cp_contract' },
            { typ: 'roles', val: 'Bad-Role' },
          ],
        },
      ]),
    );
    expect(state).toEqual({
      mode: 'swa',
      viewer: { id: 'oid-1', displayName: 'taro@example.com', roles: ['authenticated', 'cp_contract'], source: 'swa' },
    });
  });

  it('未ログイン・取得失敗はエラー', async () => {
    expect((await loadViewerFromSwa(respond({ clientPrincipal: null }))).mode).toBe('error');
    expect((await loadViewerFromSwa(respond({}, false))).mode).toBe('error');
  });
});
