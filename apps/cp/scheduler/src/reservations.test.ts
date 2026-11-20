import { describe, expect, it } from 'vitest';
import { CSV_HEADER, findConflicts, type Reservation, toCsv } from './reservations';

const base: Reservation = { id: '1', date: '2026-11-21', start: '14:00', end: '15:00', room: '会議室A', title: '定例', createdAt: '' };

describe('findConflicts', () => {
  it('同じ会議室・時間が重なる予約を見つける', () => {
    expect(findConflicts([base], { date: '2026-11-21', start: '14:30', end: '15:30', room: '会議室A' })).toHaveLength(1);
  });
  it('終了と開始がちょうど接する場合や別の会議室は重ならない', () => {
    expect(findConflicts([base], { date: '2026-11-21', start: '15:00', end: '16:00', room: '会議室A' })).toHaveLength(0);
    expect(findConflicts([base], { date: '2026-11-21', start: '14:00', end: '15:00', room: '会議室B' })).toHaveLength(0);
  });
});

describe('toCsv', () => {
  it('BOM付きで見出しと予約を出力する', () => {
    const csv = toCsv([base]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines[1]).toBe('2026/11/21,14:00,2026/11/21,15:00,会議室A,定例,会議室予約アプリから出力');
  });
  it('カンマや引用符を含む値をくくり、数式になる値を無害化する', () => {
    const csv = toCsv([{ ...base, title: '=SUM(1,2) "A"' }]);
    expect(csv).toContain(`"'=SUM(1,2) ""A"""`);
  });
});
