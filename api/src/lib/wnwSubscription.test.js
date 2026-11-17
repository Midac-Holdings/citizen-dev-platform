import { describe, expect, it, vi } from 'vitest';
import { handleSubscription, readConfig } from './wnwSubscription.js';

const ENV = {
  WNW_TABLE_ENDPOINT: 'https://acct.table.core.windows.net/',
  WNW_TABLE_SAS: '?sv=2024&sig=abc',
};

const principal = (userDetails, roles = ['anonymous', 'authenticated']) =>
  Buffer.from(JSON.stringify({ identityProvider: 'aad', userId: 'u1', userDetails, userRoles: roles })).toString('base64');

const res = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });

describe('readConfig', () => {
  it('エンドポイントと SAS がそろって初めて有効', () => {
    expect(readConfig({}).configured).toBe(false);
    expect(readConfig({ WNW_TABLE_ENDPOINT: 'https://evil.example.com', WNW_TABLE_SAS: 'x' }).configured).toBe(false);
    const c = readConfig(ENV);
    expect(c).toMatchObject({ configured: true, endpoint: 'https://acct.table.core.windows.net', sas: 'sv=2024&sig=abc', table: 'WnwWatcher', domains: ['midac.jp'] });
    expect(readConfig({ ...ENV, WNW_ALLOWED_DOMAINS: 'midac.jp, Example.co.jp' }).domains).toEqual(['midac.jp', 'example.co.jp']);
  });
});

describe('handleSubscription', () => {
  it('ログインしていなければ 401', async () => {
    const r = await handleSubscription({ method: 'GET', principalHeader: null, env: ENV });
    expect(r.status).toBe(401);
  });

  it('設定前は「準備中」を返し、登録はできない', async () => {
    const fetchFn = vi.fn();
    const g = await handleSubscription({ method: 'GET', principalHeader: principal('Taro@midac.jp'), env: {}, fetchFn });
    expect(g.jsonBody).toMatchObject({ available: false, subscribed: false, email: 'taro@midac.jp' });
    const p = await handleSubscription({ method: 'PUT', principalHeader: principal('taro@midac.jp'), env: {}, fetchFn });
    expect(p.status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('会社以外のアドレスは登録できない', async () => {
    const fetchFn = vi.fn();
    const g = await handleSubscription({ method: 'GET', principalHeader: principal('someone@gmail.com'), env: ENV, fetchFn });
    expect(g.jsonBody).toMatchObject({ available: false, reason: expect.stringContaining('会社のメールアドレス') });
    const p = await handleSubscription({ method: 'PUT', principalHeader: principal('someone@gmail.com'), env: ENV, fetchFn });
    expect(p.status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('確認：行がなければ未登録、あれば登録済み', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200, '{}'));
    const a = await handleSubscription({ method: 'GET', principalHeader: principal('taro@midac.jp'), env: ENV, fetchFn });
    expect(a.jsonBody).toEqual({ email: 'taro@midac.jp', available: true, subscribed: false });
    const b = await handleSubscription({ method: 'GET', principalHeader: principal('taro@midac.jp'), env: ENV, fetchFn });
    expect(b.jsonBody.subscribed).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://acct.table.core.windows.net/WnwWatcher(PartitionKey='subscriber',RowKey='taro%40midac.jp')?sv=2024&sig=abc");
    expect(init.method).toBe('GET');
  });

  it('登録：本人のアドレスで追加または置き換え（PUT）する', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(204));
    const now = new Date('2026-11-17T01:00:00Z');
    const r = await handleSubscription({ method: 'PUT', principalHeader: principal('Taro@Midac.jp'), env: ENV, fetchFn, now });
    expect(r.jsonBody).toEqual({ email: 'taro@midac.jp', available: true, subscribed: true });
    const [, init] = fetchFn.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ PartitionKey: 'subscriber', RowKey: 'taro@midac.jp', Email: 'taro@midac.jp', SubscribedAt: '2026-11-17T01:00:00.000Z' });
  });

  it('解除：行がなくても成功扱い', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(404));
    const r = await handleSubscription({ method: 'DELETE', principalHeader: principal('taro@midac.jp'), env: ENV, fetchFn });
    expect(r.jsonBody.subscribed).toBe(false);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: expect.objectContaining({ 'If-Match': '*' }) });
  });

  it('保存先のエラーは 502 で日本語のメッセージを返す', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(403, 'AuthenticationFailed'));
    const r = await handleSubscription({ method: 'PUT', principalHeader: principal('taro@midac.jp'), env: ENV, fetchFn });
    expect(r.status).toBe(502);
    expect(r.jsonBody.error).toBe('登録に失敗しました（HTTP 403）');
  });
});
