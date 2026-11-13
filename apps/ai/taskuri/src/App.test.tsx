import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { dueLabel, filterTasks, loadSettings, sampleTasks, toDateKey, validateRunTime } from './tasks';

// 2026年11月13日（金）9:00 に固定
const TODAY = new Date(2026, 10, 13, 9, 0, 0);

describe('タスクの絞り込み', () => {
  it('今日やる：期限が今日以前の未着手＋期限なしの優先度高・中。期限切れが先頭', () => {
    const list = filterTasks(sampleTasks(TODAY), '今日やる', TODAY);
    expect(list.map((t) => t.id)).toEqual(['s3', 's1', 's2', 's7']);
  });

  it('未着手：期限の近い順で、期限なしは最後', () => {
    const list = filterTasks(sampleTasks(TODAY), '未着手', TODAY);
    expect(list).toHaveLength(7);
    expect(list.at(-1)?.dueDate).toBeNull();
  });

  it('期限の表示', () => {
    expect(dueLabel(toDateKey(TODAY), TODAY)).toBe('今日まで');
    expect(dueLabel('2026-11-14', TODAY)).toBe('明日まで');
    expect(dueLabel('2026-11-12', TODAY)).toBe('昨日まで（期限切れ）');
    expect(dueLabel('2026-11-01', TODAY)).toBe('11月1日まで（期限切れ）');
    expect(dueLabel('2026-11-20', TODAY)).toBe('11月20日まで');
    expect(dueLabel(null, TODAY)).toBe('期限なし');
  });

  it('実行時刻の入力チェック', () => {
    expect(validateRunTime('07:30')).toBeNull();
    expect(validateRunTime('7:30')).not.toBeNull();
    expect(validateRunTime('25:00')).not.toBeNull();
  });
});

describe('画面', () => {
  it('ポータルに戻るリンクと、デモの注意書きがある', () => {
    render(<App today={TODAY} />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('note')).toHaveTextContent('このブラウザ内にだけ保存');
  });

  it('今日やるタスクが表示され、期限切れの件数が出る', () => {
    render(<App today={TODAY} />);
    expect(screen.getByText(/今日やること 4件（うち期限切れ 1件）/)).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '不具合報告に回答する' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '年末調整の書類を提出する' })).not.toBeInTheDocument();
  });

  it('完了にすると一覧から消え、完了済みに移る。再読み込みしても残る', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App today={TODAY} />);
    const card = screen.getByRole('article', { name: 'A社への見積回答を送付する' });
    await user.click(within(card).getByRole('button', { name: /完了/ }));
    expect(screen.queryByRole('article', { name: 'A社への見積回答を送付する' })).not.toBeInTheDocument();

    unmount();
    render(<App today={TODAY} />);
    expect(screen.queryByRole('article', { name: 'A社への見積回答を送付する' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /完了済み/ }));
    const done = screen.getByRole('article', { name: 'A社への見積回答を送付する' });
    await user.click(within(done).getByRole('button', { name: '未着手に戻す' }));
    expect(screen.queryByRole('article', { name: 'A社への見積回答を送付する' })).not.toBeInTheDocument();
  });

  it('AIの判断理由を開いて読める', async () => {
    const user = userEvent.setup();
    render(<App today={TODAY} />);
    const card = screen.getByRole('article', { name: '出張申請を承認する' });
    await user.click(within(card).getByText(/AIの判断：自分への個別依頼（CC）/));
    expect(within(card).getByText(/承認をお願いします/)).toBeVisible();
  });

  it('設定を保存できる。不正な時刻はエラー', async () => {
    const user = userEvent.setup();
    render(<App today={TODAY} />);
    const form = screen.getByRole('form', { name: '設定' });
    const time = within(form).getByLabelText('実行時刻');
    await user.clear(time);
    await user.click(within(form).getByRole('button', { name: '保存する' }));
    expect(within(form).getByRole('alert')).toBeInTheDocument();

    await user.type(time, '08:00');
    await user.click(within(form).getByLabelText('平日のみ実行する'));
    await user.click(within(form).getByRole('button', { name: '保存する' }));
    expect(within(form).getByRole('status')).toHaveTextContent('保存しました');
    expect(loadSettings()).toEqual({ runTime: '08:00', weekdaysOnly: false });
  });
});
