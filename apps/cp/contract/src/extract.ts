// 基盤の AI 読み取り API（/api/ai/cp-contract/extract）で、契約書 PDF から項目を読み取る
import { FIELDS, emptyValues, type Values } from './fields';

export const API_PATH = '/api/ai/cp-contract/extract';
export const MAX_BYTES = 8 * 1024 * 1024;

/** 送る前の確認。問題があればエラー文、なければ null */
export function checkFile(file: { name: string; type: string; size: number }): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'PDF ファイルを選んでください';
  if (file.size === 0) return 'ファイルが空です';
  if (file.size > MAX_BYTES) return 'ファイルが大きすぎます（8MB まで）';
  return null;
}

/** バイト列を Base64 にする */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export type ExtractResult = { values: Values; note: string };

export async function extractContract(file: File, fetchFn: typeof fetch = fetch): Promise<ExtractResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let res: Response;
  try {
    res = await fetchFn(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: FIELDS.map(({ key, label, hint }) => ({ key, label, hint })),
        file: { name: file.name, type: 'application/pdf', data: toBase64(bytes) },
      }),
    });
  } catch {
    throw new Error('読み取りに失敗しました。通信状況を確認して、もう一度お試しください。');
  }
  let data: { values?: Record<string, unknown>; note?: unknown; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    if (res.status === 403) throw new Error(data.error ?? 'このアプリを使う権限がありません（AI担当に確認してください）');
    throw new Error(data.error ?? `読み取りに失敗しました（HTTP ${res.status}）`);
  }
  const values = emptyValues();
  for (const f of FIELDS) {
    const v = data.values?.[f.key];
    values[f.key] = typeof v === 'string' ? v : '';
  }
  return { values, note: typeof data.note === 'string' ? data.note : '' };
}
