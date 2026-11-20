// 台帳（読み取った契約の一覧）は、このブラウザの中（localStorage）にだけ保存する
import { FIELDS, type Values } from './fields';

export type Entry = Values & { id: string; fileName: string; addedAt: string; note: string };

const KEY = 'cp-contract:entries:v1';

export function loadEntries(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string')
      .map((e) => {
        const entry: Record<string, string> = {
          id: e.id,
          fileName: String(e.fileName ?? ''),
          addedAt: String(e.addedAt ?? ''),
          note: String(e.note ?? ''),
        };
        for (const f of FIELDS) entry[f.key] = String(e[f.key] ?? '');
        return entry as Entry;
      });
  } catch {
    return [];
  }
}

export function saveEntries(entries: Entry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}
