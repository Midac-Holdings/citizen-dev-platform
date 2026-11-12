import type { Viewer } from './types';

/** ローカル開発用のデモ利用者。実在の社員情報ではなく、認証も行わない。 */
export const demoViewers: readonly Viewer[] = [
  { id: 'demo-all-staff', displayName: '全社員', roles: ['authenticated'], source: 'demo' },
  {
    id: 'demo-general-affairs',
    displayName: '総務担当',
    roles: ['authenticated', 'general-affairs'],
    source: 'demo',
  },
];
