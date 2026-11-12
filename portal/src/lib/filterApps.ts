import type { AppCategory, AppEntry } from '../data/apps';

export type CategoryFilter = AppCategory | 'all';

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

/** アプリ名の部分一致とカテゴリで絞り込む。 */
export function filterApps(
  apps: readonly AppEntry[],
  { query, category }: { query: string; category: CategoryFilter },
): AppEntry[] {
  const q = normalize(query);
  return apps.filter(
    (app) => (category === 'all' || app.category === category) && normalize(app.name).includes(q),
  );
}
