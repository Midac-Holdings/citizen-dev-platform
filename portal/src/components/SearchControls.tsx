import type { AppCategory } from '../data/apps';
import type { CategoryFilter } from '../lib/filterApps';

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  categories: readonly AppCategory[];
  category: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
}

export function SearchControls({ query, onQueryChange, categories, category, onCategoryChange }: Props) {
  const options: CategoryFilter[] = ['all', ...categories];
  return (
    <section className="controls" aria-label="アプリの検索と絞り込み">
      <label className="search">
        <span className="search__icon" aria-hidden="true">🔍</span>
        <input
          type="search"
          placeholder="アプリ名で検索"
          aria-label="アプリ名で検索"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <div className="chips" role="group" aria-label="カテゴリで絞り込み">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === category}
            className={option === category ? 'chip is-active' : 'chip'}
            onClick={() => onCategoryChange(option)}
          >
            {option === 'all' ? 'すべて' : option}
          </button>
        ))}
      </div>
    </section>
  );
}
