import { describe, expect, it } from 'vitest';
import { decodeBytes, parseCsv, toCsv } from './csv';
import { loadPayments, loadReceivables, SAMPLE_PAYMENTS, SAMPLE_RECEIVABLES } from './data';
import type { Payment, Receivable } from './data';
import { reconcile, resultRows } from './match';
import { nameKey, namesMatch, parseAmount } from './normalize';

const r = (id: string, customer: string, amount: number, kana?: string, due?: string): Receivable => ({ id, customer, amount, kana, due });
const p = (id: string, payer: string, amount: number, date = '2026/11/25'): Payment => ({ id, payer, amount, date });

describe('CSV', () => {
  it('クォート・カンマ・改行入りの項目を読める', () => {
    expect(parseCsv('a,b\r\n"x,1","y""z"\n"改\n行",2\n\n')).toEqual([['a', 'b'], ['x,1', 'y"z'], ['改\n行', '2']]);
  });
  it('UTF-8（BOM付き）と Shift_JIS を読める', () => {
    expect(decodeBytes(new TextEncoder().encode('﻿取引先'))).toBe('取引先');
    const sjis = new Uint8Array([0x8e, 0xe6, 0x88, 0xf8, 0x90, 0xe6]); // 「取引先」
    expect(decodeBytes(sjis)).toBe('取引先');
  });
  it('書き出した CSV を読み戻せる', () => {
    const rows = [['a,b', 'c"d'], ['1', '2']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('名義の照合', () => {
  it('半角カナ・法人格・小書き文字の違いを吸収する', () => {
    expect(nameKey('ｶ)ｻｸﾗｼﾖｳｼﾞ')).toBe(nameKey('サクラショウジ'));
    expect(namesMatch('ｱｵｿﾞﾗｺｳｷﾞﾖｳ(ｶ', '青空工業株式会社', 'アオゾラコウギョウ')).toBe(true);
    expect(namesMatch('株式会社 さくら商事', '（株）さくら商事')).toBe(true);
    expect(namesMatch('ｻｸﾗｼﾖｳｼﾞ', 'みどり運輸', 'ミドリウンユ')).toBe(false);
  });
  it('途中で切れた名義も前方一致で照合する', () => {
    expect(namesMatch('ﾄｳｻﾞｲｻｰﾋﾞｽｶﾌﾞｼｷｶﾞ', 'トウザイサービスカブシキガイシャ')).toBe(true);
  });
  it('金額を読める', () => {
    expect(parseAmount('¥1,234円')).toBe(1234);
    expect(parseAmount('１２，０００')).toBe(12000);
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('データの読み込み', () => {
  it('見出しの名前が違っても列を見つける', () => {
    const { items } = loadReceivables([['No', '得意先', '金額'], ['A1', 'さくら商事', '1,000']]);
    expect(items).toEqual([{ id: 'A1', customer: 'さくら商事', kana: undefined, amount: 1000, due: undefined }]);
  });
  it('必要な列がないとエラーになる', () => {
    expect(loadPayments([['日付', 'メモ']]).errors[0]).toMatch(/振込依頼人名.*入金額/);
  });
  it('読めない行は飛ばして知らせる', () => {
    const res = loadPayments([['入金日', '振込依頼人名', '入金額'], ['11/1', 'ｻｸﾗ', 'x'], ['11/2', 'ｻｸﾗ', '100']]);
    expect(res.items).toHaveLength(1);
    expect(res.errors[0]).toMatch(/2行目/);
  });
});

describe('消込', () => {
  it('名義と金額が一致する請求を消し込む（期日の早いものから）', () => {
    const rs = [r('2', 'さくら商事', 1000, 'サクラショウジ', '2026/12/31'), r('1', 'さくら商事', 1000, 'サクラショウジ', '2026/11/30')];
    const res = reconcile(rs, [p('a', 'ｻｸﾗｼﾖｳｼﾞ', 1000)]);
    expect(res.matches[0]).toMatchObject({ kind: 'exact', diff: 0 });
    expect(res.matches[0].receivables[0].id).toBe('1');
    expect(res.unmatchedReceivables.map((x) => x.id)).toEqual(['2']);
  });
  it('複数の請求のまとめ入金を消し込む', () => {
    const rs = [r('1', 'さくら商事', 300), r('2', 'さくら商事', 500), r('3', 'さくら商事', 700)];
    const res = reconcile(rs, [p('a', 'さくら商事', 1200)]);
    expect(res.matches[0].kind).toBe('combined');
    expect(res.matches[0].receivables.map((x) => x.id).sort()).toEqual(['2', '3']);
  });
  it('振込手数料の差引を認める（上限を超えたら認めない）', () => {
    expect(reconcile([r('1', 'みどり運輸', 33000, 'ミドリウンユ')], [p('a', 'ﾐﾄﾞﾘｳﾝﾕ', 32560)]).matches[0]).toMatchObject({ kind: 'fee', diff: 440 });
    const over = reconcile([r('1', 'みどり運輸', 33000, 'ミドリウンユ')], [p('a', 'ﾐﾄﾞﾘｳﾝﾕ', 32000)]);
    expect(over.matches).toHaveLength(0);
    expect(over.unmatchedPayments[0].candidates.map((x) => x.id)).toEqual(['1']);
    expect(reconcile([r('1', 'みどり運輸', 33000, 'ミドリウンユ')], [p('a', 'ﾐﾄﾞﾘｳﾝﾕ', 32560)], 0).matches).toHaveLength(0);
  });
  it('名義が違っても金額が1対1で一致すれば「要確認」にする', () => {
    const res = reconcile([r('1', '東西サービス', 44000)], [p('a', 'ﾄｳｻﾞｲ ﾎﾝﾃﾝ', 44000)]);
    expect(res.matches[0].kind).toBe('amountOnly');
  });
  it('金額だけの一致が複数あるときは消し込まない', () => {
    const res = reconcile([r('1', 'A社', 500), r('2', 'B社', 500)], [p('a', 'ｼｰｼﾔ', 500)]);
    expect(res.matches).toHaveLength(0);
    expect(res.unmatchedReceivables).toHaveLength(2);
    expect(res.unmatchedPayments).toHaveLength(1);
  });
  it('サンプルデータの結果', () => {
    const res = reconcile(loadReceivables(SAMPLE_RECEIVABLES).items, loadPayments(SAMPLE_PAYMENTS).items);
    expect(res.matches.map((m) => m.kind)).toEqual(['combined', 'fee', 'exact', 'amountOnly']);
    expect(res.unmatchedReceivables).toHaveLength(0);
    expect(res.unmatchedPayments.map((u) => u.payment.payer)).toEqual(['ﾐﾅﾐﾔﾏ(ｶ']);
    const rows = resultRows(res);
    expect(rows[0][0]).toBe('状態');
    expect(rows).toHaveLength(1 + 5 + 1);
  });
});
