import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEWS_URL, clearNewsCache, getNews, handleNews, parseNews } from './midacNews.js';

// 会社HP（www.midac.jp/news/）の一覧と同じ形の HTML
const HTML = `
<ul class="l-pankz"><li><a href="/">TOP</a></li></ul>
<ul class="u-listNews">
  <li>
    <div class="hd">
      <span class="day">2026.11.16</span>
      <span class="icon">お知らせ
      </span>
    </div>
    <a href="/news/20261116_0350.html" class="u-link1">
      <span class="u-linktxt">電子メールの送受信障害回復について
      </span>
    </a>
  </li>
  <li>
    <div class="hd"><span class="day">2026.11.5</span><span class="icon">法令・許可</span></div>
    <a href="/news/20261105_0347.html" class="u-link1"><span class="u-linktxt">第２回マナビリングパーク &amp; 出展</span></a>
  </li>
  <li>
    <div class="hd"><span class="day">日付なし</span><span class="icon">お知らせ</span></div>
    <a href="/news/x.html"><span class="u-linktxt">日付が読めないものは捨てる</span></a>
  </li>
  <li>
    <div class="hd"><span class="day">2026.11.01</span><span class="icon">お知らせ</span></div>
    <a href="https://evil.example.com/a.html"><span class="u-linktxt">外部へのリンクは返さない</span></a>
  </li>
</ul>`;

const principal = (roles = ['anonymous', 'authenticated']) => Buffer.from(JSON.stringify({ userId: 'u', userRoles: roles })).toString('base64');
const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => body });

afterEach(() => clearNewsCache());

describe('新着情報の読み取り', () => {
  it('日付・種類・タイトル・リンクを取り出し、日付は YYYY-MM-DD にする', () => {
    expect(parseNews(HTML)).toEqual([
      { id: '20261116_0350', date: '2026-11-16', category: 'お知らせ', title: '電子メールの送受信障害回復について', url: 'https://www.midac.jp/news/20261116_0350.html' },
      { id: '20261105_0347', date: '2026-11-05', category: '法令・許可', title: '第２回マナビリングパーク & 出展', url: 'https://www.midac.jp/news/20261105_0347.html' },
    ]);
  });

  it('一覧がなければ空', () => {
    expect(parseNews('<html><body>メンテナンス中</body></html>')).toEqual([]);
  });
});

describe('会社HPからの取得', () => {
  it('読みに行く先は会社HPの新着情報ページだけ（GET）', async () => {
    const fetchFn = vi.fn(async () => reply(HTML));
    await getNews({ fetchFn, now: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(NEWS_URL);
    expect(fetchFn.mock.calls[0][1].method).toBe('GET');
  });

  it('10分間は結果を使い回し、HP に読みに行かない', async () => {
    const fetchFn = vi.fn(async () => reply(HTML));
    await getNews({ fetchFn, now: 0 });
    const second = await getNews({ fetchFn, now: 9 * 60 * 1000 });
    expect(second.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await getNews({ fetchFn, now: 11 * 60 * 1000 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('HP のエラー・形式の変化・時間切れは、それぞれ分かるエラーにする', async () => {
    await expect(getNews({ fetchFn: async () => reply('', 500), now: 0 })).rejects.toMatchObject({ status: 502 });
    await expect(getNews({ fetchFn: async () => reply('<html></html>'), now: 0 })).rejects.toThrow('形式が変わった');
    const hang = (_u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' }))));
    await expect(getNews({ fetchFn: hang, now: 0, timeoutMs: 10 })).rejects.toMatchObject({ status: 504 });
  });
});

describe('API（/api/cp-wnw/news）', () => {
  it('ログインしていなければ 401', async () => {
    expect((await handleNews({ principalHeader: null })).status).toBe(401);
    expect((await handleNews({ principalHeader: principal(['anonymous']) })).status).toBe(401);
  });

  it('ログインしていれば一覧と取得元を返す', async () => {
    const r = await handleNews({ principalHeader: principal(), fetchFn: async () => reply(HTML), now: 0 });
    expect(r.status).toBe(200);
    expect(r.jsonBody.source).toBe(NEWS_URL);
    expect(r.jsonBody.items).toHaveLength(2);
  });
});
