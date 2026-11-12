import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('備品申請', () => {
  it('申請すると履歴に追加され、再表示しても残る', async () => {
    const { unmount } = render(<App />);
    await userEvent.selectOptions(screen.getByLabelText('種類'), 'PC周辺機器');
    await userEvent.type(screen.getByLabelText('品名'), 'USBマウス');
    await userEvent.clear(screen.getByLabelText('数量'));
    await userEvent.type(screen.getByLabelText('数量'), '2');
    await userEvent.click(screen.getByRole('button', { name: '申請する' }));

    expect(screen.getByRole('status')).toHaveTextContent('申請しました');
    const rows = within(screen.getByRole('table', { name: '申請履歴' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('PC周辺機器USBマウス2申請中');

    unmount();
    render(<App />);
    expect(screen.getByRole('table', { name: '申請履歴' })).toHaveTextContent('USBマウス');
  });

  it('品名が空なら申請できない', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '申請する' }));
    expect(screen.getByRole('alert')).toHaveTextContent('品名を入力してください');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('デモである旨を表示する', () => {
    render(<App />);
    expect(screen.getByRole('note')).toHaveTextContent('このブラウザ内にだけ保存');
  });
});
