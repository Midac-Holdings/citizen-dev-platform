import { describe, expect, it } from 'vitest';
import { filterApps } from './filterApps';
import { resolveLaunch } from './launch';
import { fixtureApps } from '../test/fixtures';

describe('filterApps', () => {
  it('全角・半角や空白を区別せずにアプリ名で検索する', () => {
    expect(filterApps(fixtureApps, { query: ' 備品 ', category: 'all' }).map((a) => a.id)).toEqual(['bm-equipment']);
  });

  it('説明文では一致しない（アプリ名のみ）', () => {
    expect(filterApps(fixtureApps, { query: '予約', category: 'all' }).map((a) => a.id)).toEqual(['bm-meeting-room']);
    expect(filterApps(fixtureApps, { query: '申請', category: 'all' })).toEqual([fixtureApps[0]]);
  });
});

describe('resolveLaunch', () => {
  it('公開中はパスで開き、準備中は開けない', () => {
    expect(resolveLaunch(fixtureApps[0])).toEqual({ openable: true, url: '/bm/equipment/' });
    expect(resolveLaunch(fixtureApps[2])).toMatchObject({ openable: false, badge: '準備中' });
  });
});
