import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { findNew, formatDate, mergeSeen, type NewsItem } from './news';

const ITEMS: NewsItem[] = [
  { id: '20261116_0350', date: '2026-11-16', category: 'お知らせ', title: '電子メールの送受信障害回復について', url: '/news/20261116_0350.html' },
  { id: '20261105_0347', date: '2026-11-05', category: '法令・許可', title: '第２回マナビリングパーク出展', url: '/news/20261105_0347.html' },
  { id: '20261020_0340', date: '2026-10-20', category: 'お知らせ', title: '年末年始の営業について', url: '/news/20261020_0340.html' },
];

const NEWS = { source: '/news/', fetchedAt: '2026-11-17T01:00:00.000Z', items: ITEMS };

function mockApi(sub: object = { email: 'taro@midac.jp', available: true, subscribed: false }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (url === '/api/cp-wnw/news') return json(200, NEWS);
    if (url === '/api/cp-wnw/subscription' && method === 'GET') return json(200, sub);
    if (url === '/api/cp-wnw/subscription' && method === 'PUT') return json(200, { ...sub, subscribed: true });
    if (url === '/api/cp-wnw/subscription' && method === 'DELETE') return json(200, { ...sub, subscribed: false });
    return json(404, { error: 'not found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('新着の判定', () => {
  it('初めて（記録なし）は NEW を付けない', () => {
    expect(findNew(ITEMS, null).size).toBe(0);
  });
  it('前回見ていない記事だけ NEW', () => {
    expect([...findNew(ITEMS, ['20261105_0347', '20261020_0340'])]).toEqual(['20261116_0350']);
  });
  it('既読の記録は新しい順で、古い記録も残す', () => {
    expect(mergeSeen(ITEMS.slice(0, 1), ['old'])).toEqual(['20261116_0350', 'old']);
  });
  it('日付は日本語で表示', () => {
    expect(formatDate('2026-11-05')).toBe('2026年11月5日');
  });
});

describe('App', () => {
  it('ポータルに戻るリンクがある', () => {
    mockApi();
    render(<App />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
  });

  it('新着情報の一覧を表示し、前回以降の記事に NEW を付ける', async () => {
    localStorage.setItem('cp-wnw:seen', JSON.stringify(['20261105_0347', '20261020_0340']));
    mockApi();
    render(<App />);
    const link = await screen.findByRole('link', { name: '電子メールの送受信障害回復について' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(link.closest('li')!).getByText('NEW')).toBeInTheDocument();
    expect(screen.getAllByText('NEW')).toHaveLength(1);
    expect(screen.getByText(/前回から 1 件の新着があります/)).toBeInTheDocument();
    // 次回のために既読にする
    expect(JSON.parse(localStorage.getItem('cp-wnw:seen')!)).toContain('20261116_0350');
  });

  it('種類で絞り込める', async () => {
    mockApi();
    render(<App />);
    await screen.findByText('年末年始の営業について');
    await userEvent.click(screen.getByRole('button', { name: '法令・許可' }));
    expect(screen.getByText('第２回マナビリングパーク出展')).toBeInTheDocument();
    expect(screen.queryByText('年末年始の営業について')).not.toBeInTheDocument();
  });

  it('メールの受け取りを登録・解除できる', async () => {
    const fetchMock = mockApi();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'メールで受け取る' }));
    expect(await screen.findByText(/登録しました/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/cp-wnw/subscription', expect.objectContaining({ method: 'PUT' }));
    expect(screen.getByText('送り先：taro@midac.jp')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'メールの受け取りをやめる' }));
    expect(await screen.findByText(/解除しました/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/cp-wnw/subscription', expect.objectContaining({ method: 'DELETE' }));
  });

  it('メール通知の準備前は理由を表示し、ボタンを出さない', async () => {
    mockApi({ email: 'taro@midac.jp', available: false, subscribed: false, reason: 'メール通知はまだ準備中です（管理者の設定待ち）' });
    render(<App />);
    expect(await screen.findByText(/準備中/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'メールで受け取る' })).not.toBeInTheDocument();
  });

  it('会社HPを読めないときはエラーを表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/cp-wnw/news'
          ? { ok: false, status: 504, json: async () => ({ error: '会社HPの応答が時間内に返りませんでした' }) }
          : { ok: true, status: 200, json: async () => ({ email: null, available: false, subscribed: false, reason: 'x' }) },
      ),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('会社HPの応答が時間内に返りませんでした');
  });
});

describe('API の呼び出し', () => {
  it('同じサイトの API だけを呼ぶ', async () => {
    const fetchMock = mockApi();
    render(<App />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    for (const [url] of fetchMock.mock.calls) expect(url).toMatch(/^\/api\/cp-wnw\//);
  });
});
