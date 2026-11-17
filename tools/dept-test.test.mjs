import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDeptTest, checkRequirements, judgeDeptTest } from './check-dept-test.mjs';

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
const filled = template
  .replace('- ① アプリ名：', '- ① アプリ名：会議室予約')
  .replace('- ② 機能概要：', '- ② 機能概要：空き状況を見て予約・取消できる')
  .replace('- ③ 利用可能ユーザー：', '- ③ 利用可能ユーザー：全社員')
  .replace('- ④ 削減される既存業務：', '- ④ 削減される既存業務：Excel の予約表への手入力')
  .replace('- ⑤ 削減が期待される時間（時間/月）：', '- ⑤ 削減が期待される時間（時間/月）：10')
  .replace('- テストした部署・役割：', '- テストした部署・役割：BM部 総務担当2名')
  .replace('- 確認した内容：', '- 確認した内容：予約の登録・取消、スマートフォン表示')
  .replace('- [ ] 部内テストを実施し', '- [x] 部内テストを実施し');
const owners = new Set(['jnxjent']);

describe('部内テストの申告', () => {
  it('テンプレートのまま（未記入）は NG', () => {
    expect(checkDeptTest(template)).toHaveLength(3);
  });

  it('記入してチェックを入れれば OK', () => {
    expect(checkDeptTest(filled)).toEqual([]);
  });

  it('チェックだけ入れて内容が空なら NG', () => {
    const body = template.replace('- [ ] 部内テストを実施し', '- [x] 部内テストを実施し');
    expect(checkDeptTest(body).join()).toContain('確認した内容');
  });

  it('欄を消してしまったら NG', () => {
    expect(checkDeptTest('## 何を作った／変えたか\nアプリを作りました')[0]).toContain('欄がありません');
    expect(checkDeptTest(null)).toHaveLength(1);
  });

  it('コメント（<!-- -->）の中の記述は記入扱いにしない', () => {
    const body = '## 部内テスト（必須）\n<!-- - テストした部署・役割：例 -->\n- テストした部署・役割：\n- 確認した内容：\n- [ ] 部内テストを実施';
    expect(checkDeptTest(body)).toHaveLength(3);
  });

  it('申請内容（①〜⑤）が未記入なら NG、記入すれば OK', () => {
    expect(checkRequirements(template)).toHaveLength(5);
    expect(checkRequirements(filled)).toEqual([]);
  });

  it('⑤ は 0 より大きい数（全角数字・単位付きも可）', () => {
    const with5 = (v) => filled.replace('（時間/月）：10', `（時間/月）：${v}`);
    expect(checkRequirements(with5('１２．５時間'))).toEqual([]);
    expect(checkRequirements(with5('未定')).join()).toContain('0より大きい数');
    expect(checkRequirements(with5('0')).join()).toContain('0より大きい数');
  });

  it('申請内容の欄を消してしまったら NG', () => {
    expect(checkRequirements('## 部内テスト（必須）\n- [x] 部内テストを実施')[0]).toContain('申請内容');
  });

  it('下書きの間と、管理者の PR は確認しない', () => {
    expect(judgeDeptTest({ body: template, author: 'citizen1', draft: true, owners })).toMatchObject({ ok: true });
    expect(judgeDeptTest({ body: '', author: 'JNXJENT', draft: false, owners })).toMatchObject({ ok: true });
    expect(judgeDeptTest({ body: template, author: 'citizen1', draft: false, owners }).ok).toBe(false);
    expect(judgeDeptTest({ body: filled, author: 'citizen1', draft: false, owners }).ok).toBe(true);
  });
});
