// 会社HP（www.midac.jp）の新着情報一覧を読み、アプリ用の一覧にする（読むだけ。書き込みはしない）。
// 読みに行く先は NEWS_URL に固定（アプリや利用者が通信先を変えることはできない）。

export const NEWS_URL = 'https://www.midac.jp/news/';
export const MAX_ITEMS = 50;
const CACHE_MS = 10 * 60 * 1000; // HP に負担をかけないよう、10分間は結果を使い回す
const MAX_BYTES = 2 * 1024 * 1024;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function text(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** 新着情報一覧の HTML（ul.u-listNews > li）から、日付・種類・タイトル・リンクを取り出す */
export function parseNews(html, base = NEWS_URL) {
  const start = html.indexOf('class="u-listNews"');
  if (start < 0) return [];
  const end = html.indexOf('</ul>', start);
  const list = html.slice(start, end < 0 ? undefined : end);
  const items = [];
  for (const [, li] of list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const day = li.match(/class="day"[^>]*>([\s\S]*?)<\/span>/);
    const href = li.match(/<a\s[^>]*href="([^"]+)"/);
    const title = li.match(/class="u-linktxt"[^>]*>([\s\S]*?)<\/span>/);
    if (!day || !href || !title) continue;
    const d = text(day[1]).match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
    if (!d) continue;
    let url;
    try {
      url = new URL(href[1], base);
    } catch {
      continue;
    }
    // 会社HP内のリンクだけを返す
    if (url.origin !== new URL(base).origin) continue;
    const category = li.match(/class="icon"[^>]*>([\s\S]*?)<\/span>/);
    items.push({
      id: url.pathname.replace(/^\/news\//, '').replace(/\.html$/, ''),
      date: `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`,
      category: category ? text(category[1]) : '',
      title: text(title[1]),
      url: url.href,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

let cache = null; // { at, items }

/** 新着情報を取得する（10分間はキャッシュを使う） */
export async function getNews({ fetchFn = fetch, now = Date.now(), timeoutMs = 10000 } = {}) {
  if (cache && now - cache.at < CACHE_MS) return { items: cache.items, fetchedAt: new Date(cache.at).toISOString(), cached: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(NEWS_URL, {
      method: 'GET',
      headers: { 'User-Agent': 'MidacCitizenAppPlatform/1.0 (What\'sNew watcher)' },
      signal: controller.signal,
    });
  } catch (e) {
    const err = new Error(e?.name === 'AbortError' ? '会社HPの応答が時間内に返りませんでした' : '会社HPに接続できませんでした');
    err.status = 504;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = new Error(`会社HPがエラーを返しました（HTTP ${res.status}）`);
    err.status = 502;
    throw err;
  }
  const html = (await res.text()).slice(0, MAX_BYTES);
  const items = parseNews(html);
  if (items.length === 0) {
    const err = new Error('会社HPの新着情報を読み取れませんでした（ページの形式が変わった可能性があります）');
    err.status = 502;
    throw err;
  }
  cache = { at: now, items };
  return { items, fetchedAt: new Date(now).toISOString(), cached: false };
}

export function clearNewsCache() {
  cache = null;
}

/** HTTP 呼び出し1回分の処理（関数本体から呼ぶ） */
export async function handleNews({ principalHeader, fetchFn, now, log = () => {} }) {
  let principal = null;
  try {
    principal = principalHeader ? JSON.parse(Buffer.from(principalHeader, 'base64').toString('utf8')) : null;
  } catch {
    principal = null;
  }
  if (!principal?.userRoles?.includes('authenticated')) return { status: 401, jsonBody: { error: 'ログインが必要です' } };
  try {
    const r = await getNews({ fetchFn, now });
    log(`midac-news: items=${r.items.length} cached=${r.cached}`);
    return { status: 200, jsonBody: { source: NEWS_URL, fetchedAt: r.fetchedAt, items: r.items } };
  } catch (e) {
    log(`midac-news: ${e.message}`);
    return { status: e.status ?? 502, jsonBody: { error: e.message } };
  }
}
