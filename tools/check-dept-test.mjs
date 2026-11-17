// 申請内容と部内テストの申告チェック：市民の PR は、PR 本文の
//   - 「申請内容（必須）」欄（①アプリ名 ②機能概要 ③利用可能ユーザー ④削減される既存業務 ⑤削減が期待される時間）
//   - 「部内テスト（必須）」欄（テストした部署・役割、確認した内容、「部内テストを実施し…」のチェック）
// が記入されていないと失敗する（＝承認・マージに進めない）。
// - 下書き（Draft）の間は確認しない（部内テスト中のため）
// - 管理者（CODEOWNERS）の PR は対象外（基盤の修正のため）
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOwners } from './check-scope.mjs';

const SECTION = /^##\s*部内テスト[^\n]*$/m;

/** PR 本文から「## 見出し」の欄を取り出す（コメント <!-- --> は除く）。なければ null */
function sectionOf(body, heading) {
  const text = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n');
  const start = text.search(heading);
  if (start < 0) return null;
  const rest = text.slice(start).split('\n').slice(1).join('\n');
  const end = rest.search(/^##\s/m);
  return end < 0 ? rest : rest.slice(0, end);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 欄の中の「- ラベル：値」の値 */
function fieldOf(section, label) {
  const m = section.match(new RegExp(`^[ \\t]*[-*][ \\t]*${escapeRe(label)}[ \\t]*[:：][ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const REQUIREMENTS = /^##\s*申請内容[^\n]*$/m;

/** 「申請内容（必須）」欄を検証する。問題の一覧を返す（空なら OK）。 */
export function checkRequirements(body) {
  const section = sectionOf(body, REQUIREMENTS);
  if (section === null) return ['PR 本文に「## 申請内容（必須）」欄がありません（PR テンプレートの欄を消さずに記入してください）'];
  const problems = [];
  for (const label of ['① アプリ名', '② 機能概要', '③ 利用可能ユーザー', '④ 削減される既存業務']) {
    if (!fieldOf(section, label)) problems.push(`「${label}」を記入してください`);
  }
  const hours = fieldOf(section, '⑤ 削減が期待される時間（時間/月）');
  const n = Number((hours.normalize('NFKC').match(/\d+(\.\d+)?/) ?? [''])[0]);
  if (!hours) problems.push('「⑤ 削減が期待される時間（時間/月）」を記入してください');
  else if (!(n > 0)) problems.push('「⑤ 削減が期待される時間（時間/月）」は、0より大きい数で記入してください（例：10）');
  return problems;
}

/** PR 本文から「部内テスト」欄を取り出して検証する。問題の一覧を返す（空なら OK）。 */
export function checkDeptTest(body) {
  const section = sectionOf(body, SECTION);
  if (section === null) return ['PR 本文に「## 部内テスト（必須）」欄がありません（PR テンプレートの欄を消さずに記入してください）'];
  const field = (label) => fieldOf(section, label);
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
  const problems = [...checkRequirements(body), ...checkDeptTest(body)];
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
    console.log(`::error::申請内容または部内テストの記入が不足しています（PR 本文を編集すると自動で再確認されます）%0A${result.problems.map((p) => `- ${p}`).join('%0A')}`);
    process.exit(1);
  }
  if (!result.skipped) console.log('申請内容・部内テストの申告 OK');
}
