import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverApps, loadApps, toPortalApps, toSwaConfig, validateApp } from './manifests.mjs';

const good = {
  name: '備品申請',
  description: '備品を申請します',
  category: '申請・手続き',
  owner: '総務G',
  status: 'available',
  access: ['authenticated'],
};
const entry = (patch = {}, extra = {}) => ({
  dept: 'bm', app: 'equipment', manifest: { ...good, ...patch }, parseError: null, hasPackage: true, ...extra,
});

function makeAppsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'apps-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('validateApp', () => {
  it('正しい申告はエラーなし', () => {
    expect(validateApp(entry())).toEqual([]);
  });

  it.each([
    [{ name: '' }, '"name"'],
    [{ category: 'その他' }, '"category"'],
    [{ status: 'public' }, '"status"'],
    [{ access: [] }, '"access"'],
    [{ access: ['anonymous'] }, 'anonymous'],
    [{ access: ['BM Admin'] }, 'BM Admin'],
  ])('%o はエラー', (patch, word) => {
    expect(validateApp(entry(patch)).join()).toContain(word);
  });

  it('部署コード・アプリ名の形式をチェックする', () => {
    expect(validateApp(entry({}, { dept: 'BM' })).join()).toContain('部署コード');
    expect(validateApp(entry({}, { dept: 'portal' })).join()).toContain('部署コード');
    expect(validateApp(entry({}, { app: 'Meeting_Room' })).join()).toContain('アプリ名');
  });

  it('公開するアプリには package.json が必要、準備中は不要', () => {
    expect(validateApp(entry({}, { hasPackage: false })).join()).toContain('package.json');
    expect(validateApp(entry({ status: 'preparing' }, { hasPackage: false }))).toEqual([]);
  });
});

describe('discoverApps / loadApps', () => {
  it('テンプレート（_始まり）は対象外、申告ファイルの不備はエラーにする', () => {
    const dir = makeAppsDir({
      '_template/app.manifest.json': good,
      'bm/equipment/app.manifest.json': good,
      'bm/equipment/package.json': '{}',
      'hr/broken/app.manifest.json': '{ not json',
    });
    expect(discoverApps(dir).map((a) => `${a.dept}/${a.app}`)).toEqual(['bm/equipment', 'hr/broken']);
    expect(() => loadApps(dir)).toThrow(/apps\/hr\/broken/);
  });
});

describe('toPortalApps / toSwaConfig', () => {
  const apps = [
    entry(),
    entry({ name: '総務管理', status: 'preparing', access: ['general-affairs'] }, { app: 'admin', hasPackage: false }),
  ];

  it('ポータル台帳にパスとロールを載せる', () => {
    expect(toPortalApps(apps)).toMatchObject([
      { id: 'bm-equipment', path: '/bm/equipment/', access: ['authenticated'] },
      { id: 'bm-admin', path: '/bm/admin/', access: ['general-affairs'], status: 'preparing' },
    ]);
  });

  it('アプリごとのロール制限を、全体のログイン必須より先に置く', () => {
    const { routes, responseOverrides } = toSwaConfig(apps);
    const paths = routes.map((r) => r.route);
    expect(paths.indexOf('/bm/admin/*')).toBeLessThan(paths.indexOf('/*'));
    expect(routes.find((r) => r.route === '/bm/admin/*').allowedRoles).toEqual(['general-affairs']);
    expect(routes.at(-1)).toEqual({ route: '/*', allowedRoles: ['authenticated'] });
    expect(responseOverrides[401].redirect).toMatch(/^\/\.auth\/login\/aad/);
  });

  it('ログインは Microsoft のみ（GitHub等は無効）', () => {
    const { routes } = toSwaConfig(apps);
    expect(routes).toContainEqual({ route: '/.auth/login/github', statusCode: 404 });
  });
});
