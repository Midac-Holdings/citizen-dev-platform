import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { BASE_ENTRIES, fakeFetch, newsHtml } from './fixture';
import { loadRead, saveRead } from './storage';

const now = () => new Date('2026-11-18T01:00:00Z');
const withNew = newsHtml([{ id: '20261118_0351', date: '2026.11.18', title: '新しいお知らせです' }, ...BASE_ENTRIES]);

const check = () => userEvent.click(screen.getByRole('button', { name: '新着を確認' }));

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('ポータルに戻るリンクと、保存先の表示がある', async () => {
    render(<App fetchFn={fakeFetch(newsHtml())} now={now} />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
    expect(screen.getByText(/ブラウザ内（localStorage）/)).toBeInTheDocument();
  });

  it('開いただけでは読み込まず、「新着を確認」で読み込む', async () => {
    const f = fakeFetch(newsHtml());
    render(<App fetchFn={f} now={now} />);
    expect(f.calls).toHaveLength(0);
    await check();
    await screen.findByText('電子メールの送受信障害回復について');
    expect(f.calls).toHaveLength(1);
  });

  it('初めて開いたときは一覧を表示し、すべて既読として記録する', async () => {
    render(<App fetchFn={fakeFetch(newsHtml())} now={now} />);
    await check();
    const link = await screen.findByRole('link', { name: '電子メールの送受信障害回復について' });
    expect(link).toHaveAttribute('href', 'https://www.midac.jp/news/20261116_0350.html');
    expect(screen.queryByText('新着', { selector: '.badge' })).not.toBeInTheDocument();
    expect(loadRead()?.ids).toHaveLength(3);
  });

  it('前回から増えた記事に「新着」を付け、件数を出す', async () => {
    saveRead({ ids: BASE_ENTRIES.map((e) => `/news/${e.id}.html`), checkedAt: '2026-11-17T00:00:00.000Z' });
    render(<App fetchFn={fakeFetch(withNew)} now={now} />);
    await check();
    const link = await screen.findByRole('link', { name: '新しいお知らせです' });
    const li = link.closest('li')!;
    expect(within(li).getByText('新着')).toBeInTheDocument();
    expect(screen.getByText('1')).toHaveClass('num');
  });

  it('記事を開くと既読になる', async () => {
    saveRead({ ids: BASE_ENTRIES.map((e) => `/news/${e.id}.html`), checkedAt: '2026-11-17T00:00:00.000Z' });
    render(<App fetchFn={fakeFetch(withNew)} now={now} />);
    await check();
    const link = await screen.findByRole('link', { name: '新しいお知らせです' });
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(within(link.closest('li')!).queryByText('新着')).not.toBeInTheDocument();
    expect(loadRead()?.ids[0]).toBe('/news/20261118_0351.html');
  });

  it('「すべて既読にする」と「未読だけ表示」', async () => {
    saveRead({ ids: BASE_ENTRIES.map((e) => `/news/${e.id}.html`), checkedAt: '2026-11-17T00:00:00.000Z' });
    render(<App fetchFn={fakeFetch(withNew)} now={now} />);
    await check();
    await screen.findByRole('link', { name: '新しいお知らせです' });
    await userEvent.click(screen.getByRole('checkbox', { name: '未読だけ表示' }));
    expect(screen.queryByRole('link', { name: '電子メールの送受信障害回復について' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'すべて既読にする' }));
    expect(screen.getByText('未読の記事はありません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'すべて既読にする' })).toBeDisabled();
  });

  it('もう一度「新着を確認」で読み直し、増えた記事に新着が付く', async () => {
    let html = newsHtml();
    const f = fakeFetch(() => html);
    render(<App fetchFn={f} now={now} />);
    await check();
    await screen.findByText('電子メールの送受信障害回復について');
    html = withNew;
    await check();
    const link = await screen.findByRole('link', { name: '新しいお知らせです' });
    expect(within(link.closest('li')!).getByText('新着')).toBeInTheDocument();
    expect(f.calls).toHaveLength(2);
  });

  it('読み取りに失敗したらエラーを表示する', async () => {
    const f = (async () => new Response(JSON.stringify({ error: '読み取りできませんでした' }), { status: 502 })) as typeof fetch;
    render(<App fetchFn={f} now={now} />);
    await check();
    expect(await screen.findByRole('alert')).toHaveTextContent('読み取りできませんでした');
  });

  it('メール通知は準備中と案内する', async () => {
    render(<App fetchFn={fakeFetch(newsHtml())} now={now} />);
    await check();
    expect(screen.getByText(/メール通知は、まだ利用できません/)).toBeInTheDocument();
  });
});
