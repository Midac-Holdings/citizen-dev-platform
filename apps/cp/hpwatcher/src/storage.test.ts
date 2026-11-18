import { beforeEach, describe, expect, it } from 'vitest';
import { clearRead, loadRead, markRead, saveRead, STORAGE_KEY, unreadIds } from './storage';

beforeEach(() => localStorage.clear());

describe('既読の記録', () => {
  it('保存して読み戻せる', () => {
    saveRead({ ids: ['a', 'b'], checkedAt: '2026-11-18T00:00:00.000Z' });
    expect(loadRead()).toEqual({ ids: ['a', 'b'], checkedAt: '2026-11-18T00:00:00.000Z' });
    clearRead();
    expect(loadRead()).toBeNull();
  });

  it('壊れたデータは無視する', () => {
    localStorage.setItem(STORAGE_KEY, '{bad');
    expect(loadRead()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: 'x' }));
    expect(loadRead()).toBeNull();
  });

  it('初めて（記録なし）は新着を付けない', () => {
    expect(unreadIds(['a', 'b'], null).size).toBe(0);
  });

  it('記録にない記事が新着になる', () => {
    const s = { ids: ['a', 'b'], checkedAt: '' };
    expect([...unreadIds(['c', 'a', 'b'], s)]).toEqual(['c']);
  });

  it('既読に加えると新しいものが先頭、上限300件', () => {
    const many = Array.from({ length: 400 }, (_, i) => `old${i}`);
    const next = markRead(['new'], { ids: many, checkedAt: '' }, new Date('2026-11-18T00:00:00Z'));
    expect(next.ids[0]).toBe('new');
    expect(next.ids).toHaveLength(300);
    expect(next.checkedAt).toBe('2026-11-18T00:00:00.000Z');
  });
});
