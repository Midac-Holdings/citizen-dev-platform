import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage';
import { csvFileName, toCsv, totalHours, type AdminApp } from './csv';

const app = (over: Partial<AdminApp> = {}): AdminApp => ({
  id: 'cp-tasukuri', dept: 'cp', path: '/cp/tasukuri/', folder: 'apps/cp/tasukuri/', name: 'タスクリ',
  description: '', category: 'サポート', owner: 'AI担当', status: 'available', access: ['authenticated'],
  request: { summary: 'OutlookメールをAIが読んで、タスクをリストアップ', access: '全社員', currentWork: 'タスクの忘れ防止', hoursPerMonth: 10 },
  ...over,
});

describe('CSV', () => {
  it('Excel 向け（BOM・CRLF）で、見出しと申請内容が並ぶ', () => {
    const csv = toCsv([app()]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [head, row] = csv.slice(1).split('\r\n');
    expect(head).toBe('アプリID,① アプリ名,② 機能概要,③ 利用可能ユーザー,④ 削減される既存業務,⑤ 削減が期待される時間（時間/月）,フォルダ,URL,部署コード,担当部署,カテゴリ,状態,利用できるロール（設定値）');
    expect(row).toBe('cp-tasukuri,タスクリ,OutlookメールをAIが読んで、タスクをリストアップ,全社員,タスクの忘れ防止,10,apps/cp/tasukuri/,/cp/tasukuri/,cp,AI担当,サポート,公開中,authenticated');
  });

  it('カンマ・改行・引用符を含む値は囲み、式として実行されないようにする', () => {
    const csv = toCsv([app({ name: 'A,B "C"', request: { summary: '1行目\n2行目', access: '=1+1', currentWork: '-', hoursPerMonth: 1.5 } })]);
    const row = csv.slice(1).split('\r\n')[1];
    expect(row).toContain('"A,B ""C"""');
    expect(row).toContain('"1行目\n2行目"');
    expect(row).toContain("'=1+1");
    expect(row).toContain(",'-,");
  });

  it('申請内容がないアプリは空欄。合計時間は公開中だけ', () => {
    expect(toCsv([app({ request: null })]).split('\r\n')[1]).toContain('タスクリ,,,,,apps/');
    expect(totalHours([app(), app({ status: 'preparing' }), app({ request: null })])).toBe(10);
  });

  it('ファイル名に日付が入る', () => {
    expect(csvFileName(new Date(2026, 10, 17))).toBe('市民アプリ一覧_20261117.csv');
  });
});

describe('管理画面', () => {
  it('一覧・集計を表示し、ボタンで CSV をダウンロードする', async () => {
    const onDownload = vi.fn();
    const apps = [app(), app({ id: 'bm-equipment', name: '備品申請', path: '/bm/equipment/', request: null })];
    render(<AdminPage apps={apps} onDownload={onDownload} />);
    expect(screen.getByText('タスクリ')).toBeInTheDocument();
    expect(screen.getByText('タスクの忘れ防止')).toBeInTheDocument();
    expect(screen.getByText(/申請内容が記録されていないアプリ.*1 件/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'CSV をダウンロード' }));
    expect(onDownload).toHaveBeenCalledWith(apps);
  });
});
