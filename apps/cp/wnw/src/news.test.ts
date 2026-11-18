import { describe, expect, it, vi } from 'vitest';
import { NEWS_HTML } from './fixture';
import { NEWS_URL, loadNews, parseNews } from './news';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseNews', () => {
  it('日付・種類・タイトル・リンクを取り出し、日付は YYYY-MM-DD にする', () => {
    expect(parseNews(NEWS_HTML)).toEqual([
      { id: '20261116_0350', date: '2026-11-16', category: 'お知らせ', title: '電子メールの送受信障害回復について', url: NEWS_URL + '20261116_0350.html' },
      { id: '20261105_0347', date: '2026-11-05', category: '法令・許可', title: '第２回マナビリングパーク & 出展', url: NEWS_URL + '20261105_0347.html' },
      { id: '20261020_0340', date: '2026-10-20', category: 'お知らせ', title: '太字だけの記事', url: NEWS_URL + '20261020_0340.html' },
    ]);
  });

  it('日付が読めない記事・会社HP以外へのリンクは除く', () => {
    const titles = parseNews(NEWS_HTML).map((i) => i.title);
    expect(titles).not.toContain('日付が読めないものは捨てる');
    expect(titles).not.toContain('外部へのリンクは表示しない');
  });

  it('一覧がなければ空', () => {
    expect(parseNews('<html><body>メンテナンス中</body></html>')).toEqual([]);
  });
});

describe('loadNews', () => {
  it('基盤の読み取り API だけを使い、会社HPの新着情報ページを指定する', async () => {
    const fetchFn = vi.fn(async () => reply({ status: 200, body: NEWS_HTML, fetchedAt: '2026-11-18T00:00:00.000Z' }));
    const r = await loadNews(fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]).toEqual([`/api/read/cp-wnw?url=${encodeURIComponent('https://www.midac.jp/news/')}`]);
    expect(r.items).toHaveLength(3);
    expect(r.fetchedAt).toBe('2026-11-18T00:00:00.000Z');
  });

  it('API のエラー文をそのまま伝える', async () => {
    const fetchFn = vi.fn(async () => reply({ error: '読み取りの回数が多すぎます' }, 429));
    await expect(loadNews(fetchFn as unknown as typeof fetch)).rejects.toThrow('読み取りの回数が多すぎます');
  });

  it('会社HPがエラーを返したとき', async () => {
    const fetchFn = vi.fn(async () => reply({ status: 503, body: 'down' }));
    await expect(loadNews(fetchFn as unknown as typeof fetch)).rejects.toThrow('HTTP 503');
  });

  it('一覧が読めないとき（ページの形式が変わった）', async () => {
    const fetchFn = vi.fn(async () => reply({ status: 200, body: '<html></html>' }));
    await expect(loadNews(fetchFn as unknown as typeof fetch)).rejects.toThrow('ページの形式が変わった');
  });

  it('通信できないとき', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('network');
    });
    await expect(loadNews(fetchFn as unknown as typeof fetch)).rejects.toThrow('通信状況');
  });
});
