import { describe, expect, it } from 'vitest';
import { loadViewerFromSwa } from './loadViewer';

const respond = (body: unknown, ok = true) =>
  (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;

describe('loadViewerFromSwa', () => {
  it('/.auth/me のロールを利用者に変換する（anonymous は除く）', async () => {
    const state = await loadViewerFromSwa(
      respond({ clientPrincipal: { userId: 'u1', userDetails: 'taro@example.com', userRoles: ['anonymous', 'authenticated', 'general-affairs'] } }),
    );
    expect(state).toEqual({
      mode: 'swa',
      viewer: { id: 'u1', displayName: 'taro@example.com', roles: ['authenticated', 'general-affairs'], source: 'swa' },
    });
  });

  it('未ログイン・取得失敗はエラー', async () => {
    expect((await loadViewerFromSwa(respond({ clientPrincipal: null }))).mode).toBe('error');
    expect((await loadViewerFromSwa(respond({}, false))).mode).toBe('error');
  });
});
