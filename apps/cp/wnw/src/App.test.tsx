import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { NEWS_HTML, newsHtmlWith } from './fixture';
import { STORAGE_KEY } from './seen';

const api = (...bodies: string[]) => {
  let n = 0;
  return vi.fn(async () => {
    const body = bodies[Math.min(n++, bodies.length - 1)];
    return new Response(JSON.stringify({ status: 200, body, fetchedAt: '2026-11-18T00:00:00.000Z' }), { status: 200 });
  }) as unknown as typeof fetch;
};
const now = () => new Date('2026-11-18T01:00:00Z');
const open = async () => userEvent.setup().click(await screen.findByRole('button', { name: '新着情報を読み込む' }));

describe('App', () => {
  it('ポータルに戻るリンクがある', () => {
    render(<App fetchFn={api(NEWS_HTML)} now={now} />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
  });

  it('開いただけでは会社HPを読みに行かず、前回見た日時を案内する', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: ['a'], lastVisit: '2026-11-17T00:00:00.000Z' }));
    const fetchFn = api(NEWS_HTML);
    render(<App fetchFn={fetchFn} now={now} />);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByText(/前回見たのは/)).toBeInTheDocument();
  });

  it('保存先がブラウザ内であることを表示する', () => {
    render(<App fetchFn={api(NEWS_HTML)} now={now} />);
    expect(screen.getByText(/このブラウザ内にだけ保存/)).toBeInTheDocument();
  });

  it('初めて開いたときは一覧を表示し、NEW は付けず、既読として保存する', async () => {
    render(<App fetchFn={api(NEWS_HTML)} now={now} />);
    await open();
    const link = await screen.findByRole('link', { name: '電子メールの送受信障害回復について' });
    expect(link).toHaveAttribute('href', 'https://www.midac.jp/news/20261116_0350.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
    expect(screen.getByText(/初めて開いた/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).ids).toEqual(['20261116_0350', '20261105_0347', '20261020_0340']);
  });

  it('前回見たあとに増えた記事にだけ NEW を付ける', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: ['20261116_0350', '20261105_0347', '20261020_0340'], lastVisit: '2026-11-17T00:00:00.000Z' }));
    render(<App fetchFn={api(newsHtmlWith([{ id: '20261118_0351', date: '2026.11.18', title: '新しいお知らせ' }]))} now={now} />);
    await open();
    const link = await screen.findByRole('link', { name: '新しいお知らせ' });
    expect(within(link.closest('li')!).getByText('NEW')).toBeInTheDocument();
    expect(screen.getAllByText('NEW')).toHaveLength(1);
    expect(screen.getByText(/増えた記事が 1 件/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).ids).toContain('20261118_0351');
  });

  it('記事のタイトルに HTML が入っていても、文字として表示する', async () => {
    const { container } = render(<App fetchFn={api(NEWS_HTML)} now={now} />);
    await open();
    await screen.findByRole('link', { name: '太字だけの記事' });
    expect(container.querySelector('img')).toBeNull();
  });

  it('「最新を読み込む」で読み直すと、前回以降の記事に NEW が付く', async () => {
    const user = userEvent.setup();
    const fetchFn = api(NEWS_HTML, newsHtmlWith([{ id: '20261118_0351', date: '2026.11.18', title: '新しいお知らせ' }]));
    render(<App fetchFn={fetchFn} now={now} />);
    await open();
    await screen.findByRole('link', { name: '電子メールの送受信障害回復について' });
    await user.click(screen.getByRole('button', { name: '最新を読み込む' }));
    await screen.findByRole('link', { name: '新しいお知らせ' });
    expect(screen.getAllByText('NEW')).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('読み取りに失敗したらエラーを表示する', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401 })) as unknown as typeof fetch;
    render(<App fetchFn={fetchFn} now={now} />);
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('ログインが必要です');
  });

  it('既読をリセットできる', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App fetchFn={api(NEWS_HTML)} now={now} />);
    await open();
    await screen.findByRole('link', { name: '電子メールの送受信障害回復について' });
    await user.click(screen.getByRole('button', { name: '既読をリセット' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
