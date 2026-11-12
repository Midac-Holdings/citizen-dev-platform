// 部内テストの申告チェック：市民の PR は、PR 本文の「部内テスト（必須）」欄が記入され、
// 「部内テストを実施し…」にチェックが入っていないと失敗する（＝承認・マージに進めない）。
// - 下書き（Draft）の間は確認しない（部内テスト中のため）
// - 管理者（CODEOWNERS）の PR は対象外（基盤の修正のため）
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOwners } from './check-scope.mjs';

const SECTION = /^##\s*部内テスト[^\n]*$/m;

/** PR 本文から「部内テスト」欄を取り出して検証する。問題の一覧を返す（空なら OK）。 */
export function checkDeptTest(body) {
  const text = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n');
  const start = text.search(SECTION);
  if (start < 0) return ['PR 本文に「## 部内テスト（必須）」欄がありません（PR テンプレートの欄を消さずに記入してください）'];
  const rest = text.slice(start).split('\n').slice(1).join('\n');
  const end = rest.search(/^##\s/m);
  const section = end < 0 ? rest : rest.slice(0, end);

  const field = (label) => {
    const m = section.match(new RegExp(`^[ \\t]*[-*][ \\t]*${label}[ \\t]*[:：][ \\t]*(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const problems = [];
  if (!field('テストした部署・役割')) problems.push('「テストした部署・役割」を記入してください');
  if (!field('確認した内容')) problems.push('「確認した内容」を記入してください');
  if (!/^[ \t]*[-*][ \t]*\[[xX]\][ \t]*部内テストを実施/m.test(section)) {
    problems.push('「部内テストを実施し、問題がないことを確認した」にチェックを入れてください');
  }
  return problems;
}

export function judgeDeptTest({ body, author, draft, owners }) {
  if (draft) return { ok: true, skipped: '下書き（Draft）のため確認しません。Ready for review にしたときに確認します' };
  if (owners.has(String(author).toLowerCase())) return { ok: true, skipped: `管理者（${author}）の PR のため対象外です` };
  const problems = checkDeptTest(body);
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const owners = parseOwners(readFileSync(join(root, '.github/CODEOWNERS'), 'utf8'));
  const result = judgeDeptTest({
    body: process.env.PR_BODY,
    author: process.env.PR_AUTHOR ?? '',
    draft: process.env.PR_DRAFT === 'true',
    owners,
  });
  if (result.skipped) console.log(result.skipped);
  if (!result.ok) {
    console.log(`::error::部内テストの申告が不足しています（PR 本文を編集すると自動で再確認されます）%0A${result.problems.map((p) => `- ${p}`).join('%0A')}`);
    process.exit(1);
  }
  if (!result.skipped) console.log('部内テストの申告 OK');
}
