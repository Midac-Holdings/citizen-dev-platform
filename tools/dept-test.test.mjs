import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDeptTest, judgeDeptTest } from './check-dept-test.mjs';

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
const filled = template
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

  it('下書きの間と、管理者の PR は確認しない', () => {
    expect(judgeDeptTest({ body: template, author: 'citizen1', draft: true, owners })).toMatchObject({ ok: true });
    expect(judgeDeptTest({ body: '', author: 'JNXJENT', draft: false, owners })).toMatchObject({ ok: true });
    expect(judgeDeptTest({ body: template, author: 'citizen1', draft: false, owners }).ok).toBe(false);
    expect(judgeDeptTest({ body: filled, author: 'citizen1', draft: false, owners }).ok).toBe(true);
  });
});
