import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { fixtureApps } from './test/fixtures';
import type { ViewerState } from './viewer/loadViewer';

const demo = () => Promise.resolve<ViewerState>({ mode: 'demo' });
const swa = (roles: string[]) => () =>
  Promise.resolve<ViewerState>({
    mode: 'swa',
    viewer: { id: 'u1', displayName: 'taro@example.com', roles, source: 'swa' },
  });

const cardNames = async () =>
  within(await screen.findByRole('list', { name: 'アプリ一覧' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('ログインした利用者（Azure Static Web Apps）', () => {
  it('全社員ロールだけなら総務管理カードを表示しない', async () => {
    render(<App apps={fixtureApps} loadViewer={swa(['authenticated'])} />);
    expect(await cardNames()).toEqual(['備品申請', '会議室予約']);
    expect(screen.getByText('taro@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ログアウト' })).toHaveAttribute('href', '/.auth/logout');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('general-affairs ロールがあれば総務管理カードを表示する', async () => {
    render(<App apps={fixtureApps} loadViewer={swa(['authenticated', 'general-affairs'])} />);
    expect(await cardNames()).toContain('総務管理（準備中）');
  });

  it('公開中のアプリはサイト内のパスで開き、準備中は開けない', async () => {
    render(<App apps={fixtureApps} loadViewer={swa(['authenticated', 'general-affairs'])} />);
    const card = await screen.findByRole('article', { name: '備品申請' });
    expect(within(card).getByRole('link', { name: /開く/ })).toHaveAttribute('href', '/bm/equipment/');
    const admin = screen.getByRole('article', { name: '総務管理（準備中）' });
    expect(within(admin).queryByRole('link')).not.toBeInTheDocument();
    expect(within(admin).getByRole('button')).toBeDisabled();
  });

  it('注意書きを表示する', async () => {
    render(<App apps={fixtureApps} loadViewer={swa(['authenticated'])} />);
    expect(await screen.findByRole('note')).toHaveTextContent('社外のMicrosoftアカウントでもログインできる');
  });

  it('ログイン情報が取れないときはアプリを表示しない', async () => {
    render(<App apps={fixtureApps} loadViewer={() => Promise.resolve({ mode: 'error', message: '取得できません' })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('取得できません');
    expect(screen.queryByRole('list', { name: 'アプリ一覧' })).not.toBeInTheDocument();
  });
});

describe('ローカル開発（デモ利用者）', () => {
  it('利用者を切り替えると表示が変わる', async () => {
    render(<App apps={fixtureApps} loadViewer={demo} />);
    expect(await cardNames()).not.toContain('総務管理（準備中）');
    expect(screen.getByRole('note')).toHaveTextContent('実際の認証・アクセス制御は未実装');
    await userEvent.click(screen.getByRole('radio', { name: '総務担当' }));
    expect(await cardNames()).toContain('総務管理（準備中）');
  });

  it('アプリ名で検索でき、未許可のアプリは検索しても出ない', async () => {
    render(<App apps={fixtureApps} loadViewer={demo} />);
    const box = await screen.findByRole('searchbox', { name: 'アプリ名で検索' });
    await userEvent.type(box, '会議');
    expect(await cardNames()).toEqual(['会議室予約']);
    await userEvent.clear(box);
    await userEvent.type(box, '総務管理');
    expect(screen.getByText('条件に合うアプリが見つかりません。')).toBeInTheDocument();
  });

  it('カテゴリで絞り込める', async () => {
    render(<App apps={fixtureApps} loadViewer={demo} />);
    await userEvent.click(await screen.findByRole('button', { name: '施設・設備' }));
    expect(await cardNames()).toEqual(['会議室予約']);
  });
});
