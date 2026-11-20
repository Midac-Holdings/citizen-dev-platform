import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

const okFetch = (name: string) =>
  (async () =>
    new Response(
      JSON.stringify({
        values: {
          haishutsu_jigyosha: name,
          unpan_jigyosha: '株式会社運搬',
          haishutsu_jigyojo: '第一工場（埼玉県）',
          shobun_jigyojo: '処分センター',
          seikyusaki: '本社経理部',
        },
        note: '',
      }),
      { status: 200 },
    )) as typeof fetch;

const pdf = () => new File(['%PDF-1.7'], '契約書.pdf', { type: 'application/pdf' });

async function readAndAdd(user: ReturnType<typeof userEvent.setup>, fix?: string) {
  await user.upload(screen.getByLabelText(/契約書の写し/), pdf());
  await user.click(screen.getByRole('button', { name: 'AI で読み取る' }));
  const box = await screen.findByLabelText('排出事業者');
  if (fix) {
    await user.clear(box);
    await user.type(box, fix);
  }
  await user.click(screen.getByRole('button', { name: '台帳に追加' }));
}

describe('契約情報抽出', () => {
  it('保存先がブラウザ内であることを表示する', () => {
    render(<App />);
    expect(screen.getByText(/このブラウザの中にだけ保存/)).toBeInTheDocument();
  });

  it('読み取り → 修正 → 台帳に追加 → Excel に出力。件数を重ねると追記される', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(<App fetchFn={okFetch('株式会社排出')} download={download} />);

    await readAndAdd(user, '株式会社排出（修正）');
    expect(screen.getByText('3. 台帳（1 件）')).toBeInTheDocument();
    expect(screen.getByText('株式会社排出（修正）')).toBeInTheDocument();

    await readAndAdd(user);
    expect(screen.getByText('3. 台帳（2 件）')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excel に出力（2 件）' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0][1]).toMatch(/^契約台帳_\d{8}\.xlsx$/);
    expect(JSON.parse(localStorage.getItem('cp-contract:entries:v1')!)).toHaveLength(2);
  });

  it('台帳はページを開き直しても残る', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App fetchFn={okFetch('A社')} />);
    await readAndAdd(user);
    unmount();
    render(<App />);
    expect(screen.getByText('3. 台帳（1 件）')).toBeInTheDocument();
    expect(screen.getByText('A社')).toBeInTheDocument();
  });

  it('契約書に記載がない項目（請求先など）は、台帳に「記載なし」と表示する', async () => {
    const user = userEvent.setup();
    const f = (async () =>
      new Response(
        JSON.stringify({ values: { haishutsu_jigyosha: 'C社', unpan_jigyosha: '運搬', haishutsu_jigyojo: '工場', shobun_jigyojo: '処分', seikyusaki: '' }, note: '' }),
        { status: 200 },
      )) as typeof fetch;
    render(<App fetchFn={f} />);
    await readAndAdd(user);
    const seikyu = screen.getByText('請求先', { selector: 'dt' }).nextElementSibling;
    expect(seikyu).toHaveTextContent('記載なし');
  });

  it('読み取りに失敗したらエラーを表示する', async () => {
    const user = userEvent.setup();
    const f = (async () => new Response(JSON.stringify({ error: 'AI の設定がまだありません' }), { status: 503 })) as typeof fetch;
    render(<App fetchFn={f} />);
    await user.upload(screen.getByLabelText(/契約書の写し/), pdf());
    await user.click(screen.getByRole('button', { name: 'AI で読み取る' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI の設定がまだありません');
  });

  it('削除できる', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App fetchFn={okFetch('B社')} />);
    await readAndAdd(user);
    await user.click(screen.getByRole('button', { name: 'No.1 を削除' }));
    expect(screen.getByText('3. 台帳（0 件）')).toBeInTheDocument();
  });
});
