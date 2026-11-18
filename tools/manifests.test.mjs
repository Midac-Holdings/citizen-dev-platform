import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverApps, loadApps, toAdminApps, toPortalApps, toSwaConfig, validateApp } from './manifests.mjs';

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
    [{ access: ['bm-members'] }, 'アンダースコア'],
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
    entry({ name: '総務管理', status: 'preparing', access: ['general_affairs'] }, { app: 'admin', hasPackage: false }),
  ];

  it('ポータル台帳にパスとロールを載せる', () => {
    expect(toPortalApps(apps)).toMatchObject([
      { id: 'bm-equipment', path: '/bm/equipment/', access: ['authenticated'] },
      { id: 'bm-admin', path: '/bm/admin/', access: ['general_affairs'], status: 'preparing' },
    ]);
  });

  it('アプリごとのロール制限を、全体のログイン必須より先に置く', () => {
    const { routes, responseOverrides } = toSwaConfig(apps);
    const paths = routes.map((r) => r.route);
    expect(paths.indexOf('/bm/admin/*')).toBeLessThan(paths.indexOf('/*'));
    expect(routes.find((r) => r.route === '/bm/admin/*').allowedRoles).toEqual(['general_affairs']);
    expect(routes.at(-1)).toEqual({ route: '/*', allowedRoles: ['authenticated'] });
    expect(responseOverrides[401].redirect).toMatch(/^\/\.auth\/login\/aad/);
  });

  it('ログインは Microsoft のみ（GitHub等は無効）', () => {
    const { routes } = toSwaConfig(apps);
    expect(routes).toContainEqual({ route: '/.auth/login/github', statusCode: 404 });
  });
});

describe('申請内容（request）と管理画面', () => {
  const request = { summary: '予約・取消ができる', access: '全社員', currentWork: 'Excel への手入力', hoursPerMonth: 10 };

  it('request は任意。書く場合は ②〜⑤ がそろっていて、⑤ は 0 より大きい数', () => {
    expect(validateApp(entry({ request }))).toEqual([]);
    expect(validateApp(entry({ request: { ...request, hoursPerMonth: 0 } })).join()).toContain('hoursPerMonth');
    expect(validateApp(entry({ request: { ...request, currentWork: '' } })).join()).toContain('currentWork');
    expect(validateApp(entry({ request: 'x' })).join()).toContain('オブジェクト');
  });

  it('管理画面用の台帳には申請内容・フォルダ・担当部署が入り、ポータル用には入らない', () => {
    const apps = [entry({ request })];
    expect(toAdminApps(apps)[0]).toMatchObject({ id: 'bm-equipment', folder: 'apps/bm/equipment/', owner: '総務G', request });
    expect(toPortalApps(apps)[0].request).toBeUndefined();
    expect(toAdminApps([entry()])[0].request).toBeNull();
  });

  it('管理画面とそのプログラムは portal_admin だけ。ログイン必須の全体ルールより前に置く', () => {
    const { routes } = toSwaConfig([entry()]);
    const paths = routes.map((r) => r.route);
    expect(routes.find((r) => r.route === '/admin*').allowedRoles).toEqual(['portal_admin']);
    expect(routes.find((r) => r.route === '/assets/admin-*').allowedRoles).toEqual(['portal_admin']);
    expect(paths.indexOf('/admin*')).toBeLessThan(paths.indexOf('/*'));
  });
});

describe('読むサイト（readFrom）の宣言', () => {
  it('公開サイトのホスト名だけ書ける', async () => {
    const { toReadAllowlist } = await import('./manifests.mjs');
    expect(validateApp(entry({ readFrom: ['www.midac.jp', 'www.mhlw.go.jp'] }))).toEqual([]);
    for (const bad of ['https://www.midac.jp/news/', '10.0.0.1', 'localhost', 'server.local', 'WWW.MIDAC.JP', 'intranet']) {
      expect(validateApp(entry({ readFrom: [bad] })).join()).toContain('readFrom');
    }
    expect(validateApp(entry({ readFrom: 'www.midac.jp' })).join()).toContain('配列');
    expect(toReadAllowlist([entry({ readFrom: ['www.midac.jp'] }), entry({}, { app: 'admin' })])).toEqual({ 'bm-equipment': ['www.midac.jp'] });
  });
});
