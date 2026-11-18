// 会社HP（www.midac.jp）の新着情報を、基盤の読み取り API 経由で読む（読むだけ）。
// ブラウザから会社HPを直接読むことはできないので、必ず /api/read/cp-wnw を使う。

export const NEWS_URL = 'https://www.midac.jp/news/';
export const READ_API = '/api/read/cp-wnw';
const MAX_ITEMS = 50;

export type NewsItem = {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  title: string;
  url: string;
};

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** 新着情報一覧の HTML（ul.u-listNews > li）から、日付・種類・タイトル・リンクを取り出す */
export function parseNews(html: string, base: string = NEWS_URL): NewsItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const origin = new URL(base).origin;
  const items: NewsItem[] = [];
  for (const li of Array.from(doc.querySelectorAll('ul.u-listNews > li'))) {
    const day = clean(li.querySelector('.day')?.textContent).match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    const href = li.querySelector('a[href]')?.getAttribute('href');
    const title = clean(li.querySelector('.u-linktxt')?.textContent ?? li.querySelector('a[href]')?.textContent);
    if (!day || !href || !title) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    // 会社HP内（https）のリンクだけを表示する
    if (url.origin !== origin) continue;
    items.push({
      id: url.pathname.replace(/^\/news\//, '').replace(/\.html?$/, ''),
      date: `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`,
      category: clean(li.querySelector('.icon')?.textContent),
      title,
      url: url.href,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export type NewsResult = { items: NewsItem[]; fetchedAt: string };

/** 基盤の読み取り API で新着情報ページを読み、一覧にする */
export async function loadNews(fetchFn: typeof fetch = fetch): Promise<NewsResult> {
  let res: Response;
  try {
    res = await fetchFn(`${READ_API}?url=${encodeURIComponent(NEWS_URL)}`);
  } catch {
    throw new Error('読み取りに失敗しました。通信状況を確認して、もう一度お試しください');
  }
  let data: { body?: string; status?: number; fetchedAt?: string; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || typeof data.body !== 'string') {
    throw new Error(data.error ?? `読み取りに失敗しました（HTTP ${res.status}）`);
  }
  if (data.status && data.status >= 400) {
    throw new Error(`会社HPがエラーを返しました（HTTP ${data.status}）`);
  }
  const items = parseNews(data.body);
  if (items.length === 0) {
    throw new Error('会社HPの新着情報を読み取れませんでした（ページの形式が変わった可能性があります）');
  }
  return { items, fetchedAt: data.fetchedAt ?? new Date().toISOString() };
}
