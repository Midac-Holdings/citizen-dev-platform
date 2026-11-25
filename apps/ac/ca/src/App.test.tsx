import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { toCsv } from './csv';
import { SAMPLE_PAYMENTS, SAMPLE_RECEIVABLES } from './data';

const csvFile = (name: string, rows: string[][]) => new File([toCsv(rows)], name, { type: 'text/csv' });

describe('App', () => {
  it('ポータルに戻るリンクと保存先の表示がある', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
    expect(screen.getByText(/このブラウザ内（localStorage）/)).toBeInTheDocument();
  });

  it('債権と入金の CSV をアップすると消込結果が表示され、保存される', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    expect(screen.getByText(/両方アップすると/)).toBeInTheDocument();
    await user.upload(screen.getByLabelText('債権の CSV ファイル'), csvFile('債権.csv', SAMPLE_RECEIVABLES));
    await user.upload(screen.getByLabelText('入金の CSV ファイル'), csvFile('入金.csv', SAMPLE_PAYMENTS));

    expect(await screen.findByText('債権.csv：5件')).toBeInTheDocument();
    expect(screen.queryByText('消込結果（請求書 5件）')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /消込開始/ }));
    expect(screen.getByText('消込結果（請求書 5件）')).toBeInTheDocument();
    expect(screen.getAllByText('消込済（複数の請求をまとめて入金）')).toHaveLength(2);
    expect(screen.getByText('要確認（金額のみ一致）')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /未消込の入金/ }));
    expect(within(screen.getByRole('table')).getByText('ﾐﾅﾐﾔﾏ(ｶ')).toBeInTheDocument();

    unmount();
    render(<App />);
    expect(screen.getByText('消込結果（請求書 5件）')).toBeInTheDocument();
  });

  it('必要な列がない CSV はエラーを表示する', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText('入金の CSV ファイル'), csvFile('x.csv', [['日付', 'メモ'], ['1', '2']]));
    expect(await screen.findByText(/列が見つかりません/)).toBeInTheDocument();
  });

  it('全データ削除で初期状態に戻り、同じファイルを選び直せる', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await user.upload(screen.getByLabelText('債権の CSV ファイル'), csvFile('債権.csv', SAMPLE_RECEIVABLES));
    await user.upload(screen.getByLabelText('入金の CSV ファイル'), csvFile('入金.csv', SAMPLE_PAYMENTS));
    await user.click(screen.getByRole('button', { name: /消込開始/ }));
    expect(await screen.findByText('消込結果（請求書 5件）')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '全データ削除' }));
    expect(screen.getByText(/両方アップすると/)).toBeInTheDocument();
    expect(screen.queryByText('債権.csv：5件')).not.toBeInTheDocument();
    expect(localStorage.getItem('ac-ca:v1')).toBeNull();

    await user.upload(screen.getByLabelText('債権の CSV ファイル'), csvFile('債権.csv', SAMPLE_RECEIVABLES));
    expect(await screen.findByText('債権.csv：5件')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('両方そろうまで消込開始は押せず、データや設定を変えると押し直しになる', async () => {
    const user = userEvent.setup();
    render(<App />);
    const start = screen.getByRole('button', { name: /消込開始/ });
    expect(start).toBeDisabled();
    await user.upload(screen.getByLabelText('債権の CSV ファイル'), csvFile('債権.csv', SAMPLE_RECEIVABLES));
    await screen.findByText('債権.csv：5件');
    expect(start).toBeDisabled();
    await user.upload(screen.getByLabelText('入金の CSV ファイル'), csvFile('入金.csv', SAMPLE_PAYMENTS));
    await screen.findByText('入金.csv：5件');
    expect(start).toBeEnabled();

    await user.click(start);
    expect(screen.getByText('消込結果（請求書 5件）')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/振込手数料として認める差額/), '0');
    expect(screen.queryByText('消込結果（請求書 5件）')).not.toBeInTheDocument();
    expect(screen.getByText(/「消込開始」を押すと/)).toBeInTheDocument();
  });
});
