// 外部サイトの読み取り（宣言制・申請不要）。
// アプリが app.manifest.json の readFrom に宣言したサイトだけを、読むだけ（GET）で取ってくる。
//
// 市民の善意とは関係なく、仕組みでかける守り：
//   ① 社内・クラウド内部（プライベート IP、メタデータ等）へのアクセスを禁止。リダイレクト先も毎回確認
//   ② ログインした人だけ・1人あたりの回数制限（社外から「中継サーバー」として使われないように）
//   ③ どのアプリが、どのサイトを読んだかを記録（内容は記録しない）
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 10000,
  maxRedirects: 3,
  perUserPerMinute: 60,
  cacheMs: 5 * 60 * 1000,
};

const TEXT_TYPES = /^(text\/|application\/(json|xml|rss\+xml|atom\+xml|xhtml\+xml|ld\+json)|[^;]*\+xml)/i;

/** 内部・特殊用途の IP アドレスなら true（そこへのアクセスは禁止） */
export function isPrivateAddress(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // キャリア NAT
      (a === 169 && b === 254) || // リンクローカル（クラウドのメタデータを含む）
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true; // IP として読めないものは拒否
}

/** URL の形式とホストを確認する。問題があればエラー文、なければ null */
export function checkUrl(raw, allowedHosts) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return 'URL の形式が正しくありません';
  }
  if (u.protocol !== 'https:') return 'https の URL だけ読めます';
  if (u.username || u.password) return 'ログイン情報を含む URL は読めません';
  if (u.port && u.port !== '443') return '通常のポート（443）以外は読めません';
  if (isIP(u.hostname.replace(/^\[|\]$/g, ''))) return 'IP アドレスの URL は読めません';
  if (!allowedHosts.includes(u.hostname.toLowerCase())) {
    return `「${u.hostname}」はこのアプリの readFrom に宣言されていません（app.manifest.json の readFrom に追加してください）`;
  }
  return null;
}

async function resolvesToPublic(hostname, lookupFn) {
  const addrs = await lookupFn(hostname, { all: true, verbatim: true });
  return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
}

const rate = new Map(); // userId → { minute, count }
const cache = new Map(); // url → { at, value }

export function resetReadProxyState() {
  rate.clear();
  cache.clear();
}

function allowRate(userId, now) {
  const minute = Math.floor(now / 60000);
  const r = rate.get(userId);
  if (!r || r.minute !== minute) {
    rate.set(userId, { minute, count: 1 });
    return true;
  }
  r.count += 1;
  return r.count <= LIMITS.perUserPerMinute;
}

async function readBody(res) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const t = await res.text();
    if (Buffer.byteLength(t) > LIMITS.maxBytes) throw Object.assign(new Error('ページが大きすぎます（2MB まで）'), { status: 413 });
    return t;
  }
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMITS.maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error('ページが大きすぎます（2MB まで）'), { status: 413 });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/** 1回分の読み取り */
export async function readExternal({ url, allowedHosts, fetchFn = fetch, lookupFn = lookup, now = Date.now() }) {
  const hit = cache.get(url);
  if (hit && now - hit.at < LIMITS.cacheMs) return { ...hit.value, cached: true };

  let current = url;
  for (let i = 0; i <= LIMITS.maxRedirects; i++) {
    const problem = checkUrl(current, allowedHosts);
    if (problem) throw Object.assign(new Error(problem), { status: 403 });
    const host = new URL(current).hostname;
    if (!(await resolvesToPublic(host, lookupFn).catch(() => false))) {
      throw Object.assign(new Error(`「${host}」は社内・内部のアドレスか、名前を解決できないため読めません`), { status: 403 });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs);
    let res;
    try {
      res = await fetchFn(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'MidacCitizenAppPlatform/1.0 (+read-only)', Accept: 'text/html,application/json,application/xml,text/*;q=0.9' },
        signal: controller.signal,
      });
    } catch (e) {
      throw Object.assign(new Error(e?.name === 'AbortError' ? '相手のサイトの応答が時間内に返りませんでした' : '相手のサイトに接続できませんでした'), { status: 504 });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href; // 次の周回で、移動先も確認する
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!TEXT_TYPES.test(contentType)) {
      throw Object.assign(new Error(`文字のページ（HTML・JSON・XML など）だけ読めます（${contentType || '種類不明'}）`), { status: 415 });
    }
    const body = await readBody(res);
    const value = { url, finalUrl: current, status: res.status, contentType, body, fetchedAt: new Date(now).toISOString() };
    if (res.ok) cache.set(url, { at: now, value });
    return { ...value, cached: false };
  }
  throw Object.assign(new Error('リダイレクトが多すぎます'), { status: 508 });
}

function readPrincipal(headerValue) {
  try {
    return headerValue ? JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8')) : null;
  } catch {
    return null;
  }
}

/** HTTP 呼び出し1回分の処理（関数本体から呼ぶ）。allowlist は「アプリ ID → 読んでよいホスト」 */
export async function handleRead({ appId, url, principalHeader, allowlist, fetchFn, lookupFn, now = Date.now(), log = () => {} }) {
  const p = readPrincipal(principalHeader);
  if (!p?.userId || !p.userRoles?.includes('authenticated')) return { status: 401, jsonBody: { error: 'ログインが必要です' } };
  const hosts = allowlist[appId];
  if (!hosts) return { status: 404, jsonBody: { error: `アプリ「${appId}」には読むサイト（readFrom）の宣言がありません` } };
  if (!url) return { status: 400, jsonBody: { error: '読み取る URL（?url=）を指定してください' } };
  if (!allowRate(p.userId, now)) return { status: 429, jsonBody: { error: '読み取りの回数が多すぎます。1分ほど待ってから試してください' } };
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '(不正な URL)';
  }
  try {
    const r = await readExternal({ url, allowedHosts: hosts, fetchFn, lookupFn, now });
    // ③ 記録：どのアプリが、どのサイトを読んだか（内容は記録しない）
    log(`read: app=${appId} host=${host} status=${r.status} bytes=${Buffer.byteLength(r.body)} cached=${r.cached} user=${p.userDetails ?? p.userId}`);
    return { status: 200, jsonBody: r };
  } catch (e) {
    log(`read: app=${appId} host=${host} error=${e.status ?? ''} ${e.message} user=${p.userDetails ?? p.userId}`);
    return { status: e.status ?? 502, jsonBody: { error: e.message } };
  }
}
