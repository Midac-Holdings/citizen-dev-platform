// テスト用：会社HP（www.midac.jp/news/）の一覧と同じ形の HTML
export const NEWS_HTML = `
<ul class="l-pankz"><li><a href="/">TOP</a></li></ul>
<ul class="u-listNews">
  <li>
    <div class="hd"><span class="day">2026.11.16</span><span class="icon">お知らせ
      </span></div>
    <a href="/news/20261116_0350.html" class="u-link1"><span class="u-linktxt">電子メールの送受信障害回復について
      </span></a>
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
    <a href="//evil.example.com/a.html"><span class="u-linktxt">外部へのリンクは表示しない</span></a>
  </li>
  <li>
    <div class="hd"><span class="day">2026.10.20</span><span class="icon">お知らせ</span></div>
    <a href="/news/20261020_0340.html"><span class="u-linktxt"><img src=x onerror="alert(1)">太字<b>だけ</b>の記事</span></a>
  </li>
</ul>`;

export const newsHtmlWith = (extra: { id: string; date: string; title: string }[]) =>
  NEWS_HTML.replace(
    '<ul class="u-listNews">',
    '<ul class="u-listNews">' +
      extra
        .map((e) => `<li><div class="hd"><span class="day">${e.date}</span><span class="icon">お知らせ</span></div><a href="/news/${e.id}.html"><span class="u-linktxt">${e.title}</span></a></li>`)
        .join(''),
  );
