// App Service（F1）で、ポータル・市民アプリ（dist/）と基盤の API（api/src/lib）をまとめて動かす Web サーバー。
// - ログインは App Service の認証（Easy Auth・ミダックのテナント限定）。ロールは Entra のアプリ ロール
// - どのパスを誰が使えるか・CSP などのヘッダーは、Static Web Apps 用に自動生成した設定をそのまま使う
// - 外部のライブラリは使わない（Node.js の標準機能だけ）
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { authorize } from './routes.mjs';
import { principalFromEasyAuth, toSwaHeader } from './principal.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export const MAX_BODY_BYTES = 12 * 1024 * 1024; // AI 読み取り（8MB の PDF を Base64 にしたもの）が入る大きさ

function send(res, status, headers, body = '') {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, headers, obj) {
  send(res, status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('送るデータが大きすぎます'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** dist/ の中のファイルを探す（dist/ の外は見ない） */
async function resolveFile(distDir, path) {
  let rel;
  try {
    rel = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  const full = normalize(join(distDir, rel));
  if (full !== distDir && !full.startsWith(distDir.endsWith(sep) ? distDir : distDir + sep)) return null;
  try {
    const s = await stat(full);
    if (s.isFile()) return { file: full };
    if (s.isDirectory()) {
      if (!path.endsWith('/')) return { redirect: `${path}/` };
      const index = join(full, 'index.html');
      if ((await stat(index).catch(() => null))?.isFile()) return { file: index };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * リクエストを処理する関数を作る。
 * api: { tasukuriExtract, read, aiExtract }（api/src/lib の処理。テストでは差し替える）
 */
export function createHandler({ distDir, config, api, trustPrincipal, log = () => {} }) {
  const root = normalize(distDir);

  async function sendPage(res, status, page, headers) {
    try {
      const body = await readFile(join(root, page));
      send(res, status, { ...headers, 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }, body);
    } catch {
      send(res, status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }, String(status));
    }
  }

  async function handleApi(req, res, url, principal, headers) {
    const principalHeader = toSwaHeader(principal);
    const reply = (r) => sendJson(res, r.status ?? 200, headers, r.jsonBody ?? {});
    const jsonBody = async () => {
      try {
        return JSON.parse(await readBody(req));
      } catch (e) {
        if (e.status === 413) throw e;
        throw Object.assign(new Error('JSON を送ってください'), { status: 400 });
      }
    };
    let m;
    if (req.method === 'POST' && url.pathname === '/api/cp-tasukuri/extract') {
      return reply(await api.tasukuriExtract({ principalHeader, body: await jsonBody() }));
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/read\/([a-z0-9-]+)$/))) {
      return reply(await api.read({ appId: m[1], url: url.searchParams.get('url'), principalHeader }));
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/ai\/([a-z0-9-]+)\/extract$/))) {
      return reply(await api.aiExtract({ appId: m[1], principalHeader, body: await jsonBody() }));
    }
    return sendJson(res, 404, headers, { error: '見つかりません' });
  }

  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const principal = principalFromEasyAuth(req.headers, { trust: trustPrincipal });
    const isApi = path.startsWith('/api/');
    const decision = authorize(config, path, principal);
    const headers = decision.headers;
    try {
      if (decision.action === 'status') {
        return isApi ? sendJson(res, decision.status, headers, { error: String(decision.status) }) : sendPage(res, decision.status, '404.html', headers);
      }
      if (decision.action === 'login') {
        if (isApi || req.method !== 'GET') return sendJson(res, 401, headers, { error: 'ログインが必要です' });
        const back = encodeURIComponent(path + url.search);
        return send(res, 302, { ...headers, Location: `/.auth/login/aad?post_login_redirect_uri=${back}`, 'Cache-Control': 'no-store' });
      }
      if (decision.action === 'forbidden') {
        return isApi ? sendJson(res, 403, headers, { error: 'このアプリを使う権限がありません' }) : sendPage(res, 403, '403.html', headers);
      }
      if (isApi) return await handleApi(req, res, url, principal, headers);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ...headers, Allow: 'GET, HEAD' });

      const found = await resolveFile(root, path);
      if (!found) return sendPage(res, 404, '404.html', headers);
      if (found.redirect) return send(res, 301, { ...headers, Location: found.redirect + url.search });
      const type = TYPES[extname(found.file).toLowerCase()] ?? 'application/octet-stream';
      const immutable = /[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/.test(found.file);
      const body = await readFile(found.file);
      return send(
        res,
        200,
        { ...headers, 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' },
        req.method === 'HEAD' ? '' : body,
      );
    } catch (e) {
      const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      if (status === 500) log(`server: ${e?.message ?? e}`);
      return isApi ? sendJson(res, status, headers, { error: status === 500 ? 'サーバーでエラーが発生しました' : e.message }) : sendPage(res, status, '404.html', headers);
    }
  };
}
