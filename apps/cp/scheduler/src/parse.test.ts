import { describe, expect, it } from 'vitest';
import { mergeResult, parseRequest } from './parse';

const ROOMS = ['会議室A', '会議室B', '応接室'];
// 2026-11-20（金）10:00
const NOW = new Date(2026, 10, 20, 10, 0);

describe('parseRequest', () => {
  it('明日・開始時刻・長さ・会議室・用件を読み取る', () => {
    const r = parseRequest('明日14時から1時間 会議室A 定例会議', ROOMS, NOW);
    expect(r).toMatchObject({ date: '2026-11-21', start: '14:00', end: '15:00', room: '会議室A', title: '定例会議', missing: [] });
  });

  it('時間の範囲（〜）と月日を読み取る', () => {
    const r = parseRequest('11/25 10:30〜12:00 会議室B', ROOMS, NOW);
    expect(r).toMatchObject({ date: '2026-11-25', start: '10:30', end: '12:00', room: '会議室B', missing: [] });
  });

  it('全角の数字・午後・半・分を読み取る', () => {
    const r = parseRequest('１２月３日　午後３時半から９０分　応接室で「来客対応」を予約して', ROOMS, NOW);
    expect(r).toMatchObject({ date: '2026-12-03', start: '15:30', end: '17:00', room: '応接室', title: '来客対応' });
  });

  it('「2時から3時」は午後とみなす', () => {
    const r = parseRequest('今日 2時から3時 会議室A', ROOMS, NOW);
    expect(r).toMatchObject({ date: '2026-11-20', start: '14:00', end: '15:00' });
  });

  it('来週の曜日を読み取る（週は月曜はじまり）', () => {
    expect(parseRequest('来週水曜 10時から1時間半 会議室A', ROOMS, NOW)).toMatchObject({ date: '2026-11-25', start: '10:00', end: '11:30' });
    expect(parseRequest('月曜日 9時~10時 会議室A', ROOMS, NOW).date).toBe('2026-11-23');
  });

  it('過ぎた月日は来年とみなす', () => {
    expect(parseRequest('1月10日 10時~11時 会議室A', ROOMS, NOW).date).toBe('2027-01-10');
  });

  it('会議室名は大文字・小文字・全角を区別しない', () => {
    expect(parseRequest('明日10時~11時 会議室ａ', ROOMS, NOW).room).toBe('会議室A');
  });

  it('足りない項目を返す', () => {
    const r = parseRequest('明日 会議室A', ROOMS, NOW);
    expect(r.missing).toEqual(['start', 'end']);
  });
});

describe('mergeResult', () => {
  it('あとから送られた内容で足りない項目を埋める', () => {
    const first = parseRequest('明日 会議室B 打ち合わせ', ROOMS, NOW);
    const merged = mergeResult(first, parseRequest('15時から30分', ROOMS, NOW));
    expect(merged).toMatchObject({ date: '2026-11-21', start: '15:00', end: '15:30', room: '会議室B', title: '打ち合わせ', missing: [] });
  });
});
