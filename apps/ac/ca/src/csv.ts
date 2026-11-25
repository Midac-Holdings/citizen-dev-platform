// CSV の読み込み（UTF-8 / Shift_JIS 両対応）と書き出し

/** ファイルのバイト列を文字列にする。UTF-8 として読めなければ Shift_JIS として読む。 */
export function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** CSV 文字列を行の配列にする（ダブルクォート・改行入りの項目に対応）。空行は除く。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function escapeField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 行の配列を CSV 文字列にする（Excel で文字化けしないよう BOM 付き）。 */
export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
