import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

const now = () => new Date(2026, 10, 20, 10, 0);

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'メッセージ' }), text);
  await user.click(screen.getByRole('button', { name: '送信' }));
  return user;
}

describe('App', () => {
  it('ポータルに戻るリンクと保存先の表示がある', () => {
    render(<App now={now} />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
    expect(screen.getByText(/ブラウザ内（localStorage）にだけ保存/)).toBeInTheDocument();
  });

  it('チャットで予約し、一覧に表示・保存される', async () => {
    render(<App now={now} />);
    const user = await send('明日14時から1時間 会議室A 定例会議');
    expect(screen.getByText(/11\/21（土） 14:00〜15:00\s会議室A\s「定例会議」 で予約しますか/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '予約する' }));
    expect(screen.getByText(/予約しました/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '予約一覧' })).toHaveTextContent('会議室A');
    expect(JSON.parse(localStorage.getItem('cp-scheduler:reservations')!)).toHaveLength(1);
  });

  it('足りない項目を聞き返し、続けて送ると予約できる', async () => {
    render(<App now={now} />);
    await send('明日 会議室B');
    expect(screen.getByText(/開始時刻・終了時刻.*を教えてください/)).toBeInTheDocument();
    await send('10時から30分');
    expect(screen.getByText(/10:00〜10:30\s会議室B で予約しますか/)).toBeInTheDocument();
  });

  it('時間が重なる予約は受け付けない', async () => {
    localStorage.setItem(
      'cp-scheduler:reservations',
      JSON.stringify([{ id: 'x', date: '2026-11-21', start: '14:00', end: '15:00', room: '会議室A', title: '', createdAt: '' }]),
    );
    render(<App now={now} />);
    await send('明日14時半から1時間 会議室A');
    expect(screen.getByText(/会議室A は 14:00〜15:00 に予約が入っています/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '予約する' })).not.toBeInTheDocument();
  });

  it('過去の日付は予約できない', async () => {
    render(<App now={now} />);
    await send('2026/11/1 10時~11時 会議室A');
    expect(screen.getByText(/過去の日付は予約できません/)).toBeInTheDocument();
  });

  it('会議室を追加でき、チャットで使える', async () => {
    render(<App now={now} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '追加する会議室' }), '大会議室');
    await user.click(screen.getByRole('button', { name: '追加' }));
    await send('明日10時~11時 大会議室');
    expect(screen.getByText(/大会議室 で予約しますか/)).toBeInTheDocument();
  });
});
