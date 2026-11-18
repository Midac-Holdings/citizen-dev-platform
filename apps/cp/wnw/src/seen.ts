// 既読の記録（このブラウザ内の localStorage のみに保存。サーバーには送らない）

export const STORAGE_KEY = 'cp-wnw:seen';
const MAX_IDS = 300;

export type SeenState = { ids: string[]; lastVisit: string };

export function loadSeen(): SeenState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.ids) || typeof v?.lastVisit !== 'string') return null;
    return { ids: v.ids.filter((x: unknown) => typeof x === 'string'), lastVisit: v.lastVisit };
  } catch {
    return null;
  }
}

export function saveSeen(state: SeenState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: state.ids.slice(0, MAX_IDS), lastVisit: state.lastVisit }));
  } catch {
    // 保存できない（プライベートモード等）場合は何もしない
  }
}

export function clearSeen(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}

/** 前回の既読に含まれない記事の id。初めて開いたとき（記録なし）は NEW を付けない */
export function newIds(currentIds: string[], seen: SeenState | null): Set<string> {
  if (!seen) return new Set();
  const known = new Set(seen.ids);
  return new Set(currentIds.filter((id) => !known.has(id)));
}

/** 今回表示した記事を既読に加える（新しいものを先頭に） */
export function mergeSeen(currentIds: string[], seen: SeenState | null, now: Date): SeenState {
  const ids = [...new Set([...currentIds, ...(seen?.ids ?? [])])];
  return { ids: ids.slice(0, MAX_IDS), lastVisit: now.toISOString() };
}
