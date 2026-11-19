// 台帳を Excel（.xlsx）にする。毎回、これまでに追加したすべての件を出力する（件数を重ねると行が増える）
import writeExcelFile from 'write-excel-file/universal';
import { FIELDS } from './fields';
import type { Entry } from './storage';

export const HEADERS = ['No', '追加日時', 'ファイル名', ...FIELDS.map((f) => f.label), '備考（AI）'];

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Excel の行（見出し＋1件1行） */
export function toRows(entries: Entry[]): string[][] {
  return [
    HEADERS,
    ...entries.map((e, i) => [String(i + 1), fmtDateTime(e.addedAt), e.fileName, ...FIELDS.map((f) => e[f.key]), e.note]),
  ];
}

export async function toXlsxBlob(entries: Entry[]): Promise<Blob> {
  const rows = toRows(entries);
  const sheetData = rows.map((row, r) =>
    row.map((value) => ({ type: String, value, ...(r === 0 ? { fontWeight: 'bold' as const } : {}), wrap: r > 0 })),
  );
  const columns = [{ width: 5 }, { width: 17 }, { width: 24 }, ...FIELDS.map(() => ({ width: 36 })), { width: 30 }];
  return writeExcelFile(sheetData, { columns, sheet: '契約台帳' }).toBlob();
}

export function exportFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `契約台帳_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.xlsx`;
}
