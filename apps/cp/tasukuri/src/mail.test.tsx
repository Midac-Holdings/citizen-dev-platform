import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App, { type MailDeps } from './App';
import { toTasks, type ApiTask } from './extract';
import { authErrorMessage, cleanBody, positionOf, toMailForAi, toOriginalMail, type MailForAi, type OriginalMail } from './graph';
import { loadMailExtraction, originalMailIdOf, sampleTasks } from './tasks';

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

  it('差出人・件名を整える', () => {
    const m = toMailForAi({ id: 'm1', receivedDateTime: '2026-11-16T00:00:00Z', from: r('sato@example.com'), toRecipients: [r(ME)] }, ME);
    expect(m).toMatchObject({ from: 'sato <sato@example.com>', subject: '（件名なし）', position: 'to-only' });
  });

  it('元のメール：宛先・CC・添付の有無を整え、本文は引用も含めてそのまま', () => {
    const m = toOriginalMail({
      id: 'm1', receivedDateTime: '2026-11-16T00:00:00Z', subject: '見積', hasAttachments: true,
      from: r('sato@example.com'), toRecipients: [r(ME), r('a@example.com')], ccRecipients: [r('b@example.com')],
      body: { content: '本文\r\n\r\n\r\n\r\n> 引用' },
    });
    expect(m).toEqual({
      subject: '見積', from: 'sato <sato@example.com>', to: ['yamada <yamada@example.com>', 'a <a@example.com>'], cc: ['b <b@example.com>'],
      receivedAt: '2026-11-16T00:00:00Z', hasAttachments: true, body: '本文\n\n> 引用',
    });
  });
});

const mailFor = (id: string): MailForAi => ({
  id, receivedAt: '2026-11-16T00:10:00Z', from: '佐藤 <sato@example.com>', subject: `件名${id}`, position: 'to-only',
  toCount: 1, ccCount: 0, importance: 'normal', body: '…',
});
const apiTask = (mailId: string, title: string, extra: Partial<ApiTask> = {}): ApiTask => ({
  mailId, title, detail: '詳細', actionType: '返信', dueDate: '2026-11-16', priority: '高',
  recipientRole: 'To（自分だけ）', interpretation: '自分への個別依頼', reason: '期限付きの依頼', ...extra,
});

describe('サインインのエラー表示', () => {
  it('割り当てがない・同意が必要・キャンセル・途中のままを、日本語で案内する', () => {
    expect(authErrorMessage(Object.assign(new Error('AADSTS50105: The signed in user is not assigned to a role'), { errorCode: 'invalid_grant' }))).toContain('利用が許可されていません');
    expect(authErrorMessage(Object.assign(new Error('x'), { errorCode: 'consent_required' }))).toContain('同意');
    expect(authErrorMessage(Object.assign(new Error('x'), { errorCode: 'user_cancelled' }))).toContain('キャンセル');
    expect(authErrorMessage(Object.assign(new Error('x'), { errorCode: 'interaction_in_progress' }))).toContain('再読み込み');
    expect(authErrorMessage(Object.assign(new Error('x'), { errorCode: 'server_error' }))).toContain('server_error');
  });
});

describe('API の結果 → 画面のタスク', () => {
  it('元メールの件名・差出人・IDを付け、同じメールのタスクは別IDにする', () => {
    const tasks = toTasks([apiTask('m1', '回答する'), apiTask('m1', '資料を送る'), apiTask('zz', '不明')], [mailFor('m1')]);
    expect(tasks.map((t) => t.id)).toEqual(['m1#1', 'm1#2']);
    expect(tasks[0]).toMatchObject({ mailSubject: '件名m1', mailFrom: '佐藤', mailId: 'm1', status: '未着手' });
  });

  it('元のメールの ID：mailId がない古い保存データでも取り出せる。サンプルは null', () => {
    const base = sampleTasks(TODAY)[0];
    expect(originalMailIdOf({ ...base, id: 'AAMk=#2' })).toBe('AAMk=');
    expect(originalMailIdOf({ ...base, id: 'x#1', mailId: 'real' })).toBe('real');
    expect(originalMailIdOf(base)).toBeNull();
  });
});

const ORIGINAL: OriginalMail = {
  subject: '件名m1', from: '佐藤 <sato@example.com>', to: ['山田 <yamada@example.com>'], cc: ['鈴木 <suzuki@example.com>'],
  receivedAt: '2026-11-16T00:10:00Z', hasAttachments: true, body: '山田さん\n本日中にご回答ください。',
};

const deps = (over: Partial<MailDeps> = {}): MailDeps => ({
  configured: () => true,
  returning: () => false,
  completeSignIn: vi.fn(async () => true),
  extract: vi.fn(async (_d, _t, onProgress) => {
    onProgress({ phase: 'done', mails: 12, tasks: 1 });
    return { mails: 12, tasks: toTasks([apiTask('m1', '見積を回答する')], [mailFor('m1')]) };
  }),
  original: vi.fn(async (): Promise<OriginalMail | null> => ORIGINAL),
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
    expect(within(card).queryByRole('link', { name: /Outlook/ })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /元のメールを見る/ })).toBeInTheDocument();
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

describe('画面：元のメールを見る', () => {
  const saveReal = () =>
    localStorage.setItem(
      'cp-tasukuri.mailTasks',
      JSON.stringify({ extractedAt: '2026-11-16T00:00:00Z', days: 7, mails: 1, tasks: toTasks([apiTask('m1', '見積を回答する')], [mailFor('m1')]) }),
    );

  it('サンプルのタスクは、サインインせずにサンプルのメールを画面の中に表示する', async () => {
    const user = userEvent.setup();
    const d = deps();
    render(<App today={TODAY} mail={d} />);
    const card = screen.getByRole('article', { name: 'A社への見積回答を送付する' });
    await user.click(within(card).getByRole('button', { name: /元のメールを見る/ }));

    const dialog = screen.getByRole('dialog', { name: '✉️ 元のメール' });
    expect(within(dialog).getByText('サンプルのメールです（架空の内容）')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '【至急】お見積りのご回答について' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('本文')).toHaveTextContent('本日中にご回答ください');
    expect(within(dialog).getByText(/添付ファイルがあります/)).toBeInTheDocument();
    expect(d.original).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('実メールのタスクは、その1通を読んで、差出人・宛先・CC・本文を表示する。件名をコピーできる', async () => {
    saveReal();
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const d = deps();
    render(<App today={TODAY} mail={d} />);
    const card = screen.getByRole('article', { name: '見積を回答する' });
    await user.click(within(card).getByRole('button', { name: /元のメールを見る/ }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: '件名m1' })).toBeInTheDocument();
    expect(d.original).toHaveBeenCalledWith('m1');
    expect(dialog).toHaveTextContent('佐藤 <sato@example.com>');
    expect(dialog).toHaveTextContent('山田 <yamada@example.com>');
    expect(dialog).toHaveTextContent('鈴木 <suzuki@example.com>');
    expect(within(dialog).getByLabelText('本文')).toHaveTextContent('本日中にご回答ください。');
    expect(within(dialog).queryByText(/サンプル/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('cp-tasukuri.pendingMail')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: '件名をコピー' }));
    expect(writeText).toHaveBeenCalledWith('件名m1');
    expect(within(dialog).getByText(/コピーしました/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('本文は HTML として埋め込まず、文字のまま表示する', async () => {
    saveReal();
    const user = userEvent.setup();
    const d = deps({ original: vi.fn(async () => ({ ...ORIGINAL, body: '<img src=x onerror=alert(1)><b>太字</b>' })) });
    render(<App today={TODAY} mail={d} />);
    await user.click(within(screen.getByRole('article', { name: '見積を回答する' })).getByRole('button', { name: /元のメールを見る/ }));
    const body = await screen.findByLabelText('本文');
    expect(body).toHaveTextContent('<img src=x onerror=alert(1)><b>太字</b>');
    expect(body.querySelector('img, b')).toBeNull();
  });

  it('読めなかったら理由を表示する', async () => {
    saveReal();
    const user = userEvent.setup();
    const d = deps({ original: vi.fn(async () => { throw new Error('元のメールが見つかりません（削除されたか…）'); }) });
    render(<App today={TODAY} mail={d} />);
    await user.click(within(screen.getByRole('article', { name: '見積を回答する' })).getByRole('button', { name: /元のメールを見る/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('元のメールが見つかりません');
  });

  it('サインインから戻ってきたら、抽出ではなく、見ようとしたメールを開き直す', async () => {
    saveReal();
    sessionStorage.setItem('cp-tasukuri.pendingMail', 'm1#1');
    const d = deps({ returning: () => true });
    render(<App today={TODAY} mail={d} />);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: '件名m1' })).toBeInTheDocument();
    expect(d.completeSignIn).toHaveBeenCalled();
    expect(d.original).toHaveBeenCalledWith('m1');
    expect(d.extract).not.toHaveBeenCalled();
  });
});

