import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toSwaConfig } from '../tools/manifests.mjs';
import { createHandler } from './app.mjs';
import { principalFromEasyAuth } from './principal.mjs';
import { matches } from './routes.mjs';

const manifest = (access) => ({ name: 'x', description: 'x', category: '管理', owner: 'x', status: 'available', access });
const apps = [
  { dept: 'cp', app: 'hpwatcher', manifest: { ...manifest(['authenticated']), readFrom: ['www.midac.jp'] } },
  { dept: 'cp', app: 'contract', manifest: manifest(['cp_contract']) },
];
const config = toSwaConfig(apps, { 'cp-contract': ['ai-document'] });

/** Easy Auth が付けるヘッダー（テスト用） */
const easyAuth = (roles = [], extra = {}) => ({
  'x-ms-client-principal': Buffer.from(
    JSON.stringify({
      auth_typ: 'aad',
      role_typ: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
      claims: [
        { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'oid-1' },
        { typ: 'preferred_username', val: 'taro@midac.example' },
        ...roles.map((r) => ({ typ: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role', val: r })),
      ],
    }),
  ).toString('base64'),
  ...extra,
});

describe('ログイン情報の変換（Easy Auth → Static Web Apps の形）', () => {
  it('アプリ ロールを userRoles にする', () => {
    const p = principalFromEasyAuth(easyAuth(['cp_contract', 'Bad Role']), { trust: true });
    expect(p).toEqual({ identityProvider: 'aad', userId: 'oid-1', userDetails: 'taro@midac.example', userRoles: ['anonymous', 'authenticated', 'cp_contract'] });
  });

  it('認証が無効なとき（偽装できるとき）は信用しない', () => {
    expect(principalFromEasyAuth(easyAuth(['portal_admin']), { trust: false })).toBeNull();
    expect(principalFromEasyAuth({ 'x-ms-client-principal': 'not-base64-json' }, { trust: true })).toBeNull();
  });
});

describe('ルールの当てはめ', () => {
  it('末尾の * はその下すべて。スラッシュなしにも当てはまる', () => {
    expect(matches('/cp/contract/*', '/cp/contract/')).toBe(true);
    expect(matches('/cp/contract/*', '/cp/contract/assets/a.js')).toBe(true);
    expect(matches('/cp/contract/*', '/cp/contract')).toBe(true);
    expect(matches('/cp/contract/*', '/cp/contractor/')).toBe(false);
    expect(matches('/admin*', '/admin/')).toBe(true);
  });
});

describe('Web サーバー', () => {
  let base = '';
  let server;
  const calls = [];

  beforeAll(async () => {
    const dist = mkdtempSync(join(tmpdir(), 'dist-'));
    writeFileSync(join(dist, 'index.html'), '<h1>portal</h1>');
    writeFileSync(join(dist, '403.html'), '<h1>403</h1>');
    writeFileSync(join(dist, '404.html'), '<h1>404</h1>');
    mkdirSync(join(dist, 'cp', 'contract'), { recursive: true });
    writeFileSync(join(dist, 'cp', 'contract', 'index.html'), '<h1>contract</h1>');
    writeFileSync(join(dist, 'secret.txt'), 'x');
    const handler = createHandler({
      distDir: dist,
      config,
      trustPrincipal: true,
      api: {
        tasukuriExtract: async () => ({ status: 200, jsonBody: { tasks: [] } }),
        read: async ({ appId, url }) => ({ status: 200, jsonBody: { appId, url } }),
        aiExtract: async ({ appId, principalHeader, body }) => {
          calls.push({ appId, principalHeader, body });
          return { status: 200, jsonBody: { values: {}, note: '' } };
        },
      },
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' });

  it('ログインしていなければ、ログイン画面へ移動する（API は 401）', async () => {
    const r = await get('/cp/contract/');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/.auth/login/aad?post_login_redirect_uri=%2Fcp%2Fcontract%2F');
    expect((await get('/api/read/cp-hpwatcher?url=x')).status).toBe(401);
  });

  it('ログインしていればポータルが開け、CSP が付く', async () => {
    const r = await get('/', easyAuth());
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('portal');
    expect(r.headers.get('content-security-policy')).toContain("connect-src 'self'");
  });

  it('ロール限定のアプリは、ロールがなければ 403、あれば開ける', async () => {
    const no = await get('/cp/contract/', easyAuth());
    expect(no.status).toBe(403);
    expect(await no.text()).toContain('403');
    const yes = await get('/cp/contract/', easyAuth(['cp_contract']));
    expect(yes.status).toBe(200);
    expect(await yes.text()).toContain('contract');
    expect((await get('/cp/contract', easyAuth(['cp_contract']))).status).toBe(301);
  });

  it('管理画面は portal_admin だけ', async () => {
    expect((await get('/admin/', easyAuth())).status).toBe(403);
  });

  it('dist/ の外のファイルは読めない。ないページは 404', async () => {
    expect((await get('/%2e%2e/%2e%2e/etc/passwd', easyAuth())).status).toBe(404);
    expect((await get('/nothing/', easyAuth())).status).toBe(404);
  });

  it('API にログイン情報（Static Web Apps と同じ形）を渡す', async () => {
    const r = await fetch(`${base}/api/ai/cp-contract/extract`, {
      method: 'POST',
      headers: { ...easyAuth(['cp_contract']), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: [] }),
    });
    expect(r.status).toBe(200);
    const p = JSON.parse(Buffer.from(calls[0].principalHeader, 'base64').toString('utf8'));
    expect(p.userRoles).toContain('cp_contract');
    expect(calls[0].appId).toBe('cp-contract');
    const bad = await fetch(`${base}/api/ai/cp-contract/extract`, { method: 'POST', headers: easyAuth(['cp_contract']), body: 'not json' });
    expect(bad.status).toBe(400);
  });

  it('読み取り API に appId と URL を渡す', async () => {
    const r = await get(`/api/read/cp-hpwatcher?url=${encodeURIComponent('https://www.midac.jp/news/')}`, easyAuth());
    expect(await r.json()).toEqual({ appId: 'cp-hpwatcher', url: 'https://www.midac.jp/news/' });
  });
});
