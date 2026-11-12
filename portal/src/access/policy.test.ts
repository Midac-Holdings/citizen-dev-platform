import { describe, expect, it } from 'vitest';
import { filterVisibleApps, roleBasedPolicy } from './policy';
import type { Viewer } from '../viewer/types';
import { fixtureApps } from '../test/fixtures';

const viewer = (roles: string[]): Viewer => ({ id: 'x', displayName: 'x', roles, source: 'swa' });

describe('roleBasedPolicy', () => {
  it('ロールが一致するアプリだけ表示する', () => {
    expect(roleBasedPolicy.canView(viewer(['authenticated']), { access: ['general-affairs'] })).toBe(false);
    expect(roleBasedPolicy.canView(viewer(['authenticated', 'general-affairs']), { access: ['general-affairs'] })).toBe(true);
  });

  it('ロールがなければ何も表示しない', () => {
    expect(filterVisibleApps(fixtureApps, viewer([]))).toEqual([]);
  });
});
