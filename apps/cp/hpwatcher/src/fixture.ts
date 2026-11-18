// テスト用：当社HP（www.midac.jp/news/）の新着情報一覧と同じ形の HTML
type Entry = { id: string; date: string; title: string; category?: string };

const li = (e: Entry) =>
  `<li><div class="hd"><span class="day">${e.date}</span><span class="icon">${e.category ?? 'お知らせ'}</span></div>` +
  `<a href="/news/${e.id}.html" class="u-link1"><span class="u-linktxt">${e.title}</span></a></li>`;

export const BASE_ENTRIES: Entry[] = [
  { id: '20261116_0350', date: '2026.11.16', title: '電子メールの送受信障害回復について' },
  { id: '20261105_0347', date: '2026.11.5', title: '展示会出展のお知らせ', category: 'イベント' },
  { id: '20261020_0340', date: '2026.10.20', title: '決算説明資料を掲載しました', category: 'IR' },
];

export const newsHtml = (entries: Entry[] = BASE_ENTRIES, extra = '') =>
  `<ul class="l-pankz"><li><a href="/">TOP</a></li></ul><ul class="u-listNews">${entries.map(li).join('')}${extra}</ul>`;

/** 読み取り API の応答を返す fetch の代わり */
export const fakeFetch = (html: string | (() => string)) => {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const body = typeof html === 'function' ? html() : html;
    return new Response(
      JSON.stringify({ url: 'https://www.midac.jp/news/', status: 200, body, fetchedAt: '2026-11-18T01:00:00.000Z', cached: false }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return Object.assign(fn, { calls });
};
