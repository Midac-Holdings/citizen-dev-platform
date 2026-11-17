/**
 * 基盤の API との通信と、「新着」の判定。
 *   GET    /api/cp-wnw/news          会社HPの新着情報一覧（基盤が会社HPを読んで返す）
 *   GET    /api/cp-wnw/subscription  新着メールの受け取り登録の確認
 *   PUT    /api/cp-wnw/subscription  登録（ログインした本人のアドレス）
 *   DELETE /api/cp-wnw/subscription  解除
 */

export interface NewsItem {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  title: string;
  url: string;
}

export interface NewsResult {
  source: string;
  fetchedAt: string;
  items: NewsItem[];
}

export interface Subscription {
  email: string | null;
  available: boolean;
  subscribed: boolean;
  reason?: string;
}

async function call<T>(path: string, method = 'GET'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('通信できませんでした。ネットワークを確認して、もう一度お試しください');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `読み込みに失敗しました（HTTP ${res.status}）`);
  return data;
}

export const fetchNews = () => call<NewsResult>('/api/cp-wnw/news');
export const fetchSubscription = () => call<Subscription>('/api/cp-wnw/subscription');
export const setSubscription = (on: boolean) => call<Subscription>('/api/cp-wnw/subscription', on ? 'PUT' : 'DELETE');

// ---------------------------------------------------------------- 既読の記録（このブラウザ内だけ）

const SEEN_KEY = 'cp-wnw:seen';
const MAX_SEEN = 300;

export function loadSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function saveSeen(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, MAX_SEEN)));
  } catch {
    // 保存できなくても一覧は表示できる
  }
}

/**
 * 前回までに見ていない記事の ID。初めて開いたとき（記録なし）は、全部に印が付かないよう空にする。
 */
export function findNew(items: NewsItem[], seen: string[] | null): Set<string> {
  if (!seen) return new Set();
  const s = new Set(seen);
  return new Set(items.filter((i) => !s.has(i.id)).map((i) => i.id));
}

/** 今回の一覧を既読にした後の記録（新しい順、古い記録も残す） */
export function mergeSeen(items: NewsItem[], seen: string[] | null): string[] {
  return [...new Set([...items.map((i) => i.id), ...(seen ?? [])])].slice(0, MAX_SEEN);
}

export function formatDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : d;
}
