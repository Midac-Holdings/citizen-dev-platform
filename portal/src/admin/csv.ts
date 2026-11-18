/** 管理画面：申請されたアプリの一覧を CSV にする */

export interface AdminApp {
  id: string;
  dept: string;
  path: string;
  folder: string;
  name: string;
  description: string;
  category: string;
  owner: string;
  status: 'available' | 'preparing';
  access: string[];
  readFrom: string[];
  request: { summary: string; access: string; currentWork: string; hoursPerMonth: number } | null;
}

export const STATUS_LABEL: Record<AdminApp['status'], string> = { available: '公開中', preparing: '準備中' };

const COLUMNS: [string, (a: AdminApp) => string | number][] = [
  ['アプリID', (a) => a.id],
  ['① アプリ名', (a) => a.name],
  ['② 機能概要', (a) => a.request?.summary ?? ''],
  ['③ 利用可能ユーザー', (a) => a.request?.access ?? ''],
  ['④ 削減される既存業務', (a) => a.request?.currentWork ?? ''],
  ['⑤ 削減が期待される時間（時間/月）', (a) => a.request?.hoursPerMonth ?? ''],
  ['フォルダ', (a) => a.folder],
  ['URL', (a) => a.path],
  ['部署コード', (a) => a.dept],
  ['担当部署', (a) => a.owner],
  ['カテゴリ', (a) => a.category],
  ['状態', (a) => STATUS_LABEL[a.status]],
  ['利用できるロール（設定値）', (a) => a.access.join(' ')],
  ['読むサイト', (a) => (a.readFrom ?? []).join(' ')],
];

function cell(v: string | number): string {
  let s = String(v);
  // Excel で式として実行されないように（=,+,-,@ で始まる値）
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel でそのまま開けるように、BOM 付き UTF-8・改行は CRLF */
export function toCsv(apps: AdminApp[]): string {
  const rows = [COLUMNS.map(([h]) => h), ...apps.map((a) => COLUMNS.map(([, f]) => f(a)))];
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function totalHours(apps: AdminApp[]): number {
  return apps.reduce((sum, a) => sum + (a.status === 'available' ? (a.request?.hoursPerMonth ?? 0) : 0), 0);
}

export function csvFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `市民アプリ一覧_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.csv`;
}
