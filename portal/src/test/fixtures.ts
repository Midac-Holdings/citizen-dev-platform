import type { AppEntry } from '../data/apps';

const base = { category: '申請・手続き', status: 'available', icon: '🧩', color: '#2bb673' } as const;

export const fixtureApps: AppEntry[] = [
  { ...base, id: 'bm-equipment', dept: 'bm', path: '/bm/equipment/', name: '備品申請', description: '備品を申請', access: ['authenticated'] },
  { ...base, id: 'bm-meeting-room', dept: 'bm', path: '/bm/meeting-room/', name: '会議室予約', description: '会議室を予約', category: '施設・設備', access: ['authenticated'] },
  { ...base, id: 'bm-admin', dept: 'bm', path: '/bm/admin/', name: '総務管理（準備中）', description: '総務向け', category: '管理', status: 'preparing', access: ['general-affairs'] },
];
