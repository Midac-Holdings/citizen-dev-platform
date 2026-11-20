import { describe, expect, it } from 'vitest';
import { HEADERS, exportFileName, toRows, toXlsxBlob } from './excel';
import type { Entry } from './storage';

const entry = (n: number): Entry => ({
  id: `id${n}`,
  fileName: `契約${n}.pdf`,
  addedAt: '2026-11-20T01:02:00.000Z',
  note: '',
  haishutsu_jigyosha: `排出${n}`,
  unpan_jigyosha: '運搬',
  haishutsu_jigyojo: '事業場',
  shobun_jigyojo: '処分',
  seikyusaki: '請求',
});

describe('Excel 出力', () => {
  it('見出しと、追加した件数分の行を出す（件数を重ねると行が増える）', () => {
    expect(toRows([entry(1)])).toHaveLength(2);
    const rows = toRows([entry(1), entry(2), entry(3)]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual(HEADERS);
    expect(rows[0]).toEqual(['No', '追加日時', 'ファイル名', '排出事業者', '運搬事業者', '排出事業場', '処分事業場', '請求先', '備考（AI）']);
    expect(rows[3].slice(0, 4)).toEqual(['3', expect.stringMatching(/^2026\/11\/20 /), '契約3.pdf', '排出3']);
  });

  it('読み取れなかった項目は「記載なし」と出力する（5項目すべて）', () => {
    const empty: Entry = { ...entry(1), haishutsu_jigyosha: '', unpan_jigyosha: ' ', haishutsu_jigyojo: '', shobun_jigyojo: '', seikyusaki: '' };
    expect(toRows([empty])[1].slice(3, 8)).toEqual(['記載なし', '記載なし', '記載なし', '記載なし', '記載なし']);
    expect(toRows([entry(1)])[1][7]).toBe('請求');
  });

  it('.xlsx ファイル（ZIP 形式）を作る', async () => {
    const blob = await toXlsxBlob([entry(1)]);
    const head = new Uint8Array(await blob.arrayBuffer()).subarray(0, 2);
    expect(String.fromCharCode(...head)).toBe('PK');
  });

  it('ファイル名に日付を入れる', () => {
    expect(exportFileName(new Date(2026, 10, 20))).toBe('契約台帳_20261120.xlsx');
  });
});
