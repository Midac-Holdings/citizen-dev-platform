import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App, { type MailDeps } from './App';
import { toTasks, type ApiTask } from './extract';
import { cleanBody, positionOf, toMailForAi, type MailForAi } from './graph';
import { loadMailExtraction } from './tasks';

const TODAY = new Date(2026, 10, 16, 9, 0, 0);
const ME = 'yamada@example.com';
const r = (address: string) => ({ emailAddress: { name: address.split('@')[0], address } });

describe('メールの整形（Graph の結果 → AI に渡す形）', () => {
  it('宛先上の立場を判定する', () => {
    const base = { id: 'm', receivedDateTime: '2026-11-16T00:00:00Z' };
    expect(positionOf({ ...base, toRecipients: [r(ME)] }, ME)).toBe('to-only');
    expect(positionOf({ ...base, toRecipients: [r(ME), r('a@example.com')] }, ME)).toBe('to-multi');
    expect(positionOf({ ...base, toRecipients: [r('a@example.com')], ccRecipients: [r('YAMADA@example.com'.toLowerCase())] }, ME)).toBe('cc');
    expect(positionOf({ ...base, toRecipients: [r('all@example.com')] }, ME)).toBe('other');
  });

  it('本文の引用部分・過去のやり取りを落とす', () => {
    const body = 'お世話になっております。\n本日中にご回答ください。\n\n> 以前の引用\n-----Original Message-----\nFrom: 誰か\n古いやり取り';
    expect(cleanBody(body)).toBe('お世話になっております。\n本日中にご回答ください。');
  });

  it('差出人・件名・リンクを整える', () => {
    const m = toMailForAi(
      { id: 'm1', receivedDateTime: '2026-11-16T00:00:00Z', from: r('sato@example.com'), toRecipients: [r(ME)], webLink: 'https://outlook.office365.com/x' },
      ME,
    );
    expect(m).toMatchObject({ from: 'sato <sato@example.com>', subject: '（件名なし）', position: 'to-only', webLink: 'https://outlook.office365.com/x' });
  });
});

const mailFor = (id: string): MailForAi => ({
  id, receivedAt: '2026-11-16T00:10:00Z', from: '佐藤 <sato@example.com>', subject: `件名${id}`, position: 'to-only',
  toCount: 1, ccCount: 0, importance: 'normal', body: '…', webLink: `https://outlook.office365.com/${id}`,
});
const apiTask = (mailId: string, title: string, extra: Partial<ApiTask> = {}): ApiTask => ({
  mailId, title, detail: '詳細', actionType: '返信', dueDate: '2026-11-16', priority: '高',
  recipientRole: 'To（自分だけ）', interpretation: '自分への個別依頼', reason: '期限付きの依頼', ...extra,
});

describe('API の結果 → 画面のタスク', () => {
  it('元メールの件名・差出人・リンクを付け、同じメールのタスクは別IDにする', () => {
    const tasks = toTasks([apiTask('m1', '回答する'), apiTask('m1', '資料を送る'), apiTask('zz', '不明')], [mailFor('m1')]);
    expect(tasks.map((t) => t.id)).toEqual(['m1#1', 'm1#2']);
    expect(tasks[0]).toMatchObject({ mailSubject: '件名m1', mailFrom: '佐藤', mailLink: 'https://outlook.office365.com/m1', status: '未着手' });
  });
});

const deps = (over: Partial<MailDeps> = {}): MailDeps => ({
  configured: () => true,
  returning: () => false,
  completeSignIn: vi.fn(async () => true),
  extract: vi.fn(async (_d, _t, onProgress) => {
    onProgress({ phase: 'done', mails: 12, tasks: 1 });
    return { mails: 12, tasks: toTasks([apiTask('m1', '見積を回答する')], [mailFor('m1')]) };
  }),
  ...over,
});

describe('画面：実際のメールから抽出', () => {
  it('サインイン設定がなければボタンを押せず、管理者の設定待ちと表示する', () => {
    render(<App today={TODAY} mail={deps({ configured: () => false })} />);
    const card = screen.getByRole('region', { name: 'メールから抽出' });
    expect(within(card).getByRole('alert')).toHaveTextContent('管理者の設定待ち');
    expect(within(card).getByRole('button', { name: 'メールを読み込んで抽出する' })).toBeDisabled();
  });

  it('抽出するとサンプルが実メールのタスクに置き換わり、保存される。サンプルにも戻せる', async () => {
    const user = userEvent.setup();
    const d = deps();
    render(<App today={TODAY} mail={d} />);
    await user.selectOptions(screen.getByLabelText('期間'), '7');
    await user.click(screen.getByRole('button', { name: 'メールを読み込んで抽出する' }));

    expect(d.extract).toHaveBeenCalledWith(7, TODAY, expect.any(Function));
    const card = await screen.findByRole('article', { name: '見積を回答する' });
    expect(within(card).getByRole('link', { name: 'Outlookで開く' })).toHaveAttribute('href', 'https://outlook.office365.com/m1');
    expect(screen.queryByRole('article', { name: 'A社への見積回答を送付する' })).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('あなたの受信メールを AI が読み取った結果');
    expect(screen.getByRole('status')).toHaveTextContent('メール 12 通から、タスクを 1 件');
    expect(loadMailExtraction()?.tasks).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'サンプルに戻す' }));
    expect(screen.getByRole('article', { name: 'A社への見積回答を送付する' })).toBeInTheDocument();
    expect(loadMailExtraction()).toBeNull();
  });

  it('サインインのため移動するときは、何も変えずに待つ', async () => {
    const user = userEvent.setup();
    const d = deps({ extract: vi.fn(async () => null) });
    render(<App today={TODAY} mail={d} />);
    await user.click(screen.getByRole('button', { name: 'メールを読み込んで抽出する' }));
    expect(loadMailExtraction()).toBeNull();
    expect(sessionStorage.getItem('cp-tasukuri.pendingDays')).toBe('30');
  });

  it('サインインから戻ってきたら、続きを自動で実行する', async () => {
    sessionStorage.setItem('cp-tasukuri.pendingDays', '14');
    const d = deps({ returning: () => true });
    render(<App today={TODAY} mail={d} />);
    expect(await screen.findByRole('article', { name: '見積を回答する' })).toBeInTheDocument();
    expect(d.completeSignIn).toHaveBeenCalled();
    expect(d.extract).toHaveBeenCalledWith(14, TODAY, expect.any(Function));
  });

  it('失敗したら理由を表示する', async () => {
    const user = userEvent.setup();
    const d = deps({ extract: vi.fn(async () => { throw new Error('AI の設定がまだありません'); }) });
    render(<App today={TODAY} mail={d} />);
    await user.click(screen.getByRole('button', { name: 'メールを読み込んで抽出する' }));
    expect(await screen.findByText('AI の設定がまだありません')).toBeInTheDocument();
  });
});
