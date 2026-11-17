// ⑦ 起動確認：ビルド済みの dist/ を本番と同じセキュリティヘッダー付きで配信し、
// ポータルと各アプリを実際のブラウザで開いて次を確認する。
//   - 画面が表示される（空白ページでない）
//   - JavaScript のエラー・セキュリティ制限（CSP）違反が出ない
//   - 自社サイト以外と通信しない
// 事前に npm run build が必要。
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const config = JSON.parse(readFileSync(join(dist, 'staticwebapp.config.json'), 'utf8'));
const apps = JSON.parse(readFileSync(join(root, 'portal/src/generated/apps.json'), 'utf8'));
const allRoles = [...new Set(['authenticated', ...apps.flatMap((a) => a.access)])];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  for (const [k, v] of Object.entries(config.globalHeaders ?? {})) res.setHeader(k, v);
  // 本番と同じく、ルートごとのヘッダー（許可されたアプリの CSP など）で上書きする
  const route = (config.routes ?? []).find((r) => r.headers && url.pathname.startsWith(r.route.replace(/\*$/, '')));
  for (const [k, v] of Object.entries(route?.headers ?? {})) res.setHeader(k, v);
  if (url.pathname === '/.auth/me') {
    // ログイン済み（全ロール付き）として振る舞う
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ clientPrincipal: { userId: 'smoke', userDetails: 'smoke-test', userRoles: ['anonymous', ...allRoles] } }));
  }
  let file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) return res.writeHead(400).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end('not found');
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const targets = [{ name: 'ポータル', path: '/' }, { name: 'アプリを作る', path: '/create/' }, { name: '管理画面', path: '/admin/' }, ...apps.filter((a) => a.status === 'available').map((a) => ({ name: a.name, path: a.path }))];
const browser = await chromium.launch(process.env.SMOKE_CHROMIUM_PATH ? { executablePath: process.env.SMOKE_CHROMIUM_PATH } : {});
let failed = 0;

for (const t of targets) {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`JavaScriptエラー: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // 基盤の API（/api/...）は起動確認では動かない（下で 503 を返す）。その読み込み失敗は問題にしない
    if (m.text().startsWith('Failed to load resource') && (m.location()?.url ?? '').startsWith(`${origin}/api/`)) return;
    problems.push(`コンソールエラー: ${m.text()}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:')) problems.push(`外部への通信: ${u}`);
  });
  // 外部への通信は実際には送らない
  await page.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  // 基盤の API はここでは動かさない。アプリが「使えないとき」の表示で落ちないことを確かめる
  await page.route((u) => u.href.startsWith(`${origin}/api/`), (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '起動確認では基盤の API を使えません' }) }),
  );

  const res = await page.goto(origin + t.path, { waitUntil: 'networkidle' }).catch((e) => problems.push(`開けません: ${e.message}`));
  if (res && !res.ok()) problems.push(`HTTP ${res.status()}`);
  const text = await page.locator('#root').innerText().catch(() => '');
  if (text.trim().length === 0) problems.push('画面に何も表示されていません');

  if (problems.length) {
    failed++;
    console.log(`::error::起動確認NG：${t.name}（${t.path}）%0A${problems.map((p) => `- ${p}`).join('%0A')}`);
  } else {
    console.log(`✔ ${t.name}（${t.path}）`);
  }
  await page.close();
}

await browser.close();
server.close();
if (failed) process.exit(1);
console.log(`起動確認 OK（${targets.length}画面）`);
