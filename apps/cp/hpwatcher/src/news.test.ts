import { describe, expect, it } from 'vitest';
import { fetchNews, parseNews, READ_API } from './news';
import { fakeFetch, newsHtml } from './fixture';

describe('parseNews', () => {
  it('日付・種類・タイトル・リンクを取り出す', () => {
    const items = parseNews(newsHtml());
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      id: '/news/20261116_0350.html',
      date: '2026-11-16',
      category: 'お知らせ',
      title: '電子メールの送受信障害回復について',
      url: 'https://www.midac.jp/news/20261116_0350.html',
    });
    expect(items[1].date).toBe('2026-11-05');
    expect(items[1].category).toBe('イベント');
  });

  it('日付が読めないもの・社外へのリンク・重複は除く', () => {
    const extra =
      '<li><span class="day">日付なし</span><a href="/news/x.html"><span class="u-linktxt">x</span></a></li>' +
      '<li><span class="day">2026.11.01</span><a href="//evil.example.com/a.html"><span class="u-linktxt">外部</span></a></li>' +
      '<li><span class="day">2026.11.16</span><a href="/news/20261116_0350.html"><span class="u-linktxt">重複</span></a></li>';
    const items = parseNews(newsHtml(undefined, extra));
    expect(items.map((i) => i.title)).not.toContain('外部');
    expect(items.map((i) => i.title)).not.toContain('重複');
    expect(items).toHaveLength(3);
  });

  it('タイトル中のタグは文字だけにする', () => {
    const items = parseNews(newsHtml([{ id: 'a', date: '2026.1.2', title: '<img src=x onerror="alert(1)">太字<b>だけ</b>' }]));
    expect(items[0].title).toBe('太字だけ');
  });
});

describe('fetchNews', () => {
  it('基盤の読み取り API で当社HPの新着ページを読む', async () => {
    const f = fakeFetch(newsHtml());
    const r = await fetchNews(f);
    expect(f.calls[0]).toBe(`${READ_API}?url=${encodeURIComponent('https://www.midac.jp/news/')}`);
    expect(r.items).toHaveLength(3);
    expect(r.fetchedAt).toBe('2026-11-18T01:00:00.000Z');
  });

  it('API がエラーを返したらメッセージを出す', async () => {
    const f = (async () => new Response(JSON.stringify({ error: '回数の上限です' }), { status: 429 })) as typeof fetch;
    await expect(fetchNews(f)).rejects.toThrow('回数の上限です');
  });

  it('HPがエラーを返したら知らせる', async () => {
    const f = (async () => new Response(JSON.stringify({ status: 503, body: '' }), { status: 200 })) as typeof fetch;
    await expect(fetchNews(f)).rejects.toThrow('HTTP 503');
  });

  it('記事が読めなければ形式変更の可能性を知らせる', async () => {
    await expect(fetchNews(fakeFetch('<p>no list</p>'))).rejects.toThrow('形式が変わった');
  });

  it('通信できないとき', async () => {
    const f = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    await expect(fetchNews(f)).rejects.toThrow('通信状況');
  });
});
