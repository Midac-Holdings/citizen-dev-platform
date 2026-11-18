import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkUrl, handleRead, isPrivateAddress, resetReadProxyState } from './readProxy.js';

const principal = (roles = ['anonymous', 'authenticated']) =>
  Buffer.from(JSON.stringify({ userId: 'u1', userDetails: 'taro@example.com', userRoles: roles })).toString('base64');
const allowlist = { 'cp-wnw': ['www.midac.jp'] };
const publicDns = vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]);
const page = (body = '<ul class="u-listNews"></ul>', { status = 200, type = 'text/html; charset=UTF-8', location } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': type, ...(location ? { location } : {}) }),
  text: async () => body,
});
const call = (over = {}) =>
  handleRead({ appId: 'cp-wnw', url: 'https://www.midac.jp/news/', principalHeader: principal(), allowlist, fetchFn: async () => page(), lookupFn: publicDns, now: 0, ...over });

afterEach(() => resetReadProxyState());

describe('① 社内・クラウド内部へのアクセスの禁止', () => {
  it.each(['10.0.0.1', '172.16.5.4', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])(
    '%s は内部アドレス',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it('公開アドレスは許可', () => {
    expect(isPrivateAddress('203.0.113.10')).toBe(false);
    expect(isPrivateAddress('2001:db8::1')).toBe(false);
  });

  it('宣言していないサイト・http・IP 直書き・ログイン情報付き・別ポートは拒否', () => {
    const hosts = ['www.midac.jp'];
    expect(checkUrl('https://www.midac.jp/news/', hosts)).toBeNull();
    expect(checkUrl('https://evil.example.com/', hosts)).toContain('宣言されていません');
    expect(checkUrl('http://www.midac.jp/', hosts)).toContain('https');
    expect(checkUrl('https://169.254.169.254/metadata', ['169.254.169.254'])).toContain('IP');
    expect(checkUrl('https://user:pw@www.midac.jp/', hosts)).toContain('ログイン情報');
    expect(checkUrl('https://www.midac.jp:8443/', hosts)).toContain('ポート');
  });

  it('宣言したサイトでも、名前が内部アドレスを指していれば拒否（読みに行かない）', async () => {
    const fetchFn = vi.fn();
    const r = await call({ lookupFn: async () => [{ address: '10.1.2.3', family: 4 }], fetchFn });
    expect(r.status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('リダイレクト先も確認し、宣言外のサイトへは行かない', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(page('', { status: 302, location: 'https://evil.example.com/x' }));
    const r = await call({ fetchFn });
    expect(r.status).toBe(403);
    expect(r.jsonBody.error).toContain('evil.example.com');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('宣言したサイト内のリダイレクトは追う', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(page('', { status: 301, location: '/news/index.html' })).mockResolvedValueOnce(page('ok'));
    const r = await call({ fetchFn });
    expect(r.status).toBe(200);
    expect(r.jsonBody.finalUrl).toBe('https://www.midac.jp/news/index.html');
  });
});

describe('② ログインと回数制限', () => {
  it('ログインしていなければ 401', async () => {
    expect((await call({ principalHeader: null })).status).toBe(401);
    expect((await call({ principalHeader: principal(['anonymous']) })).status).toBe(401);
  });

  it('readFrom を宣言していないアプリは 404', async () => {
    expect((await call({ appId: 'bm-equipment' })).status).toBe(404);
  });

  it('1人あたり1分に60回まで', async () => {
    for (let i = 0; i < 60; i++) expect((await call({ url: `https://www.midac.jp/news/?p=${i}` })).status).toBe(200);
    expect((await call({ url: 'https://www.midac.jp/news/?p=x' })).status).toBe(429);
    expect((await call({ url: 'https://www.midac.jp/news/?p=y', now: 60000 })).status).toBe(200);
  });
});

describe('読み取りの結果と③記録', () => {
  it('読むだけ（GET）で、本文・種類・最終 URL を返し、5分間は使い回す', async () => {
    const fetchFn = vi.fn(async () => page('<html>新着</html>'));
    const r = await call({ fetchFn });
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(fetchFn.mock.calls[0][1].body).toBeUndefined();
    expect(r.jsonBody).toMatchObject({ status: 200, body: '<html>新着</html>', finalUrl: 'https://www.midac.jp/news/', cached: false });
    expect((await call({ fetchFn, now: 4 * 60000 })).jsonBody.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('文字のページ以外（画像・PDF など）は 415', async () => {
    expect((await call({ fetchFn: async () => page('x', { type: 'application/pdf' }) })).status).toBe(415);
  });

  it('記録には、アプリ・サイト・利用者を残し、内容は残さない', async () => {
    const log = vi.fn();
    await call({ fetchFn: async () => page('<html>社外秘ではない本文</html>'), log });
    const line = log.mock.calls[0][0];
    expect(line).toContain('app=cp-wnw');
    expect(line).toContain('host=www.midac.jp');
    expect(line).toContain('user=taro@example.com');
    expect(line).not.toContain('本文');
  });
});
