import { describe, expect, it } from 'vitest';
import { API_PATH, checkFile, extractContract, toBase64 } from './extract';

const pdf = () => new File(['%PDF-1.7 test'], '契約書.pdf', { type: 'application/pdf' });

describe('契約書の読み取り', () => {
  it('PDF 以外・空・大きすぎるファイルを断る', () => {
    expect(checkFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull();
    expect(checkFile({ name: 'a.docx', type: 'application/msword', size: 10 })).toContain('PDF');
    expect(checkFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toContain('空');
    expect(checkFile({ name: 'a.pdf', type: 'application/pdf', size: 9 * 1024 * 1024 })).toContain('8MB');
  });

  it('Base64 に変換できる', () => {
    expect(toBase64(new TextEncoder().encode('%PDF'))).toBe(btoa('%PDF'));
  });

  it('基盤の AI 読み取り API に、5項目と PDF を送る', async () => {
    let sent: { url: string; body: { fields: { key: string }[]; file: { type: string; data: string } } } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ values: { haishutsu_jigyosha: '株式会社A', extra: 'x' }, note: '' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await extractContract(pdf(), f);
    expect(sent!.url).toBe(API_PATH);
    expect(sent!.body.fields.map((x) => x.key)).toHaveLength(5);
    expect(sent!.body.file.type).toBe('application/pdf');
    expect(atob(sent!.body.file.data)).toBe('%PDF-1.7 test');
    expect(r.values.haishutsu_jigyosha).toBe('株式会社A');
    expect(r.values.seikyusaki).toBe('');
    expect(Object.keys(r.values)).not.toContain('extra');
  });

  it('エラーの内容を画面向けの文で返す', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'AI の設定がまだありません' }), { status: 503 })) as typeof fetch;
    await expect(extractContract(pdf(), f)).rejects.toThrow('AI の設定がまだありません');
    const down = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    await expect(extractContract(pdf(), down)).rejects.toThrow('通信状況');
  });
});
