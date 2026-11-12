import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('ポータルに戻るリンクがある', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: /ポータルに戻る/ })).toHaveAttribute('href', '/');
  });
});
