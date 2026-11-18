// 会社HP（www.midac.jp/news/）の新着情報を、基盤の読み取り API 経由で読む（読むだけ）。
// ブラウザから会社HPを直接読むことはできないので、必ず /api/read/cp-hpwatcher を使う。

export const NEWS_URL = 'https://www.midac.jp/news/';
export const READ_API = '/api/read/cp-hpwatcher';
const MAX_ITEMS = 50;

export type NewsItem = {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  title: string;
  url: string;
};

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** 新着情報一覧の HTML（ul.u-listNews > li）から、日付・種類・タイトル・リンクを取り出す */
export function parseNews(html: string, base: string = NEWS_URL): NewsItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const origin = new URL(base).origin;
  const items: NewsItem[] = [];
  const seenIds = new Set<string>();
  for (const li of Array.from(doc.querySelectorAll('ul.u-listNews > li'))) {
    const m = squash(li.querySelector('.day')?.textContent).match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    const link = li.querySelector('a[href]');
    const href = link?.getAttribute('href');
    const title = squash(li.querySelector('.u-linktxt')?.textContent ?? link?.textContent);
    if (!m || !href || !title) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    // 会社HP内のリンクだけを表示する
    if (url.origin !== origin) continue;
    const id = url.pathname;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    items.push({
      id,
      date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      category: squash(li.querySelector('.icon')?.textContent),
      title,
      url: url.href,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export type NewsResult = { items: NewsItem[]; fetchedAt: string };

/** 基盤の読み取り API で新着情報ページを読み、一覧にする */
export async function fetchNews(fetchFn: typeof fetch = fetch): Promise<NewsResult> {
  let res: Response;
  try {
    res = await fetchFn(`${READ_API}?url=${encodeURIComponent(NEWS_URL)}`);
  } catch {
    throw new Error('読み取りに失敗しました。通信状況を確認して、もう一度お試しください。');
  }
  let data: { body?: unknown; status?: number; fetchedAt?: string; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || typeof data.body !== 'string') {
    throw new Error(data.error ?? `読み取りに失敗しました（HTTP ${res.status}）。`);
  }
  if (typeof data.status === 'number' && data.status >= 400) {
    throw new Error(`会社HPがエラーを返しました（HTTP ${data.status}）。`);
  }
  const items = parseNews(data.body);
  if (items.length === 0) {
    throw new Error('新着情報を読み取れませんでした（HPの形式が変わった可能性があります）。');
  }
  return { items, fetchedAt: data.fetchedAt ?? new Date().toISOString() };
}
