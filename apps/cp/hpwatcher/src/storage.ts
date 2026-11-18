// 既読の記録。このブラウザ内（localStorage）だけに保存し、どこにも送らない。

export const STORAGE_KEY = 'cp-hpwatcher:read';
const MAX_IDS = 300;

export type ReadState = { ids: string[]; checkedAt: string };

export function loadRead(): ReadState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.ids) || typeof v?.checkedAt !== 'string') return null;
    return { ids: v.ids.filter((x: unknown): x is string => typeof x === 'string'), checkedAt: v.checkedAt };
  } catch {
    return null;
  }
}

export function saveRead(state: ReadState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: state.ids.slice(0, MAX_IDS), checkedAt: state.checkedAt }));
  } catch {
    // 保存できない環境（プライベートモード等）では何もしない
  }
}

export function clearRead(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}

/** まだ既読にしていない記事の id。初めて使うとき（記録なし）は、すべてを既読扱いにして新着を付けない */
export function unreadIds(currentIds: string[], state: ReadState | null): Set<string> {
  if (!state) return new Set();
  const known = new Set(state.ids);
  return new Set(currentIds.filter((id) => !known.has(id)));
}

/** 記事を既読に加える（新しいものを先頭に） */
export function markRead(ids: string[], state: ReadState | null, now: Date): ReadState {
  const merged = [...new Set([...ids, ...(state?.ids ?? [])])];
  return { ids: merged.slice(0, MAX_IDS), checkedAt: now.toISOString() };
}
