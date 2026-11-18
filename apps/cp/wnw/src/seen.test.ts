import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, clearSeen, loadSeen, mergeSeen, newIds, saveSeen } from './seen';

describe('既読の記録', () => {
  it('初めて（記録なし）なら NEW は付けない', () => {
    expect(newIds(['a', 'b'], null).size).toBe(0);
  });

  it('前回の既読にない記事だけ NEW', () => {
    expect([...newIds(['c', 'a', 'b'], { ids: ['a', 'b'], lastVisit: 'x' })]).toEqual(['c']);
  });

  it('今回の記事を既読に加え、重複しない', () => {
    const s = mergeSeen(['c', 'a'], { ids: ['a', 'b'], lastVisit: 'x' }, new Date('2026-11-18T01:00:00Z'));
    expect(s).toEqual({ ids: ['c', 'a', 'b'], lastVisit: '2026-11-18T01:00:00.000Z' });
  });

  it('localStorage に保存・読み込み・削除できる', () => {
    saveSeen({ ids: ['a'], lastVisit: '2026-11-18T01:00:00.000Z' });
    expect(loadSeen()).toEqual({ ids: ['a'], lastVisit: '2026-11-18T01:00:00.000Z' });
    clearSeen();
    expect(loadSeen()).toBeNull();
  });

  it('壊れた記録は無視する', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadSeen()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: 'a' }));
    expect(loadSeen()).toBeNull();
  });

  it('記録は 300 件までに抑える', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `id${i}`);
    saveSeen({ ids, lastVisit: 'x' });
    expect(loadSeen()!.ids).toHaveLength(300);
  });
});
