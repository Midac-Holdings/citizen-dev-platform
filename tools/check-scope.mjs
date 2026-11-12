// ④ 変更範囲チェック：市民の PR が、自分のアプリのフォルダ以外を変更していないか。
//   apps/<部署コード>/<アプリ名>/ の中と package-lock.json（アプリ追加時に更新される）は OK。
//   それ以外（ポータル・仕組み・テンプレート・設定）は管理者（CODEOWNERS）の PR のみ OK。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_FILE = /^apps\/(?!_)[^/]+\/[^/]+\//;
const ALWAYS_OK = new Set(['package-lock.json']);

/** 変更ファイルを「アプリ」「管理者のみ」に分ける。 */
export function classifyChanges(files) {
  const apps = new Set();
  const restricted = [];
  for (const f of files) {
    const m = f.match(/^apps\/([^/]+)\/([^/]+)\//);
    if (APP_FILE.test(f)) apps.add(`apps/${m[1]}/${m[2]}`);
    else if (!ALWAYS_OK.has(f)) restricted.push(f);
  }
  return { apps: [...apps].sort(), restricted };
}

/** CODEOWNERS に書かれた GitHub ユーザー名（@ を除く）。 */
export function parseOwners(text) {
  const owners = new Set();
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('#')) continue;
    for (const token of line.trim().split(/\s+/)) {
      // @user は個人、@org/team はチーム（チームは対象外）
      if (/^@[A-Za-z0-9-]+$/.test(token)) owners.add(token.slice(1).toLowerCase());
    }
  }
  return owners;
}

export function judge({ files, author, owners }) {
  const { apps, restricted } = classifyChanges(files);
  const isAdmin = owners.has(String(author).toLowerCase());
  const messages = [];
  if (restricted.length && !isAdmin) {
    messages.push(
      `自分のアプリのフォルダ以外が変更されています（管理者のみ変更できます）:\n${restricted.map((f) => `  - ${f}`).join('\n')}`,
    );
  }
  if (apps.length > 1 && !isAdmin) {
    messages.push(`1つの PR で変更できるアプリは1つです:\n${apps.map((a) => `  - ${a}`).join('\n')}`);
  }
  return { ok: messages.length === 0, apps, restricted, isAdmin, messages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const base = process.argv[2] ?? 'HEAD^1';
  const files = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const owners = parseOwners(readFileSync(join(root, '.github/CODEOWNERS'), 'utf8'));
  const author = process.env.PR_AUTHOR ?? '';
  const result = judge({ files, author, owners });

  console.log(`変更ファイル: ${files.length}件 / 対象アプリ: ${result.apps.join(', ') || 'なし'}`);
  if (result.isAdmin && result.restricted.length) {
    console.log(`管理者（${author}）の PR のため、仕組み側の変更を許可します:\n${result.restricted.map((f) => `  - ${f}`).join('\n')}`);
  }
  if (!result.ok) {
    for (const m of result.messages) console.log(`::error::${m.replaceAll('\n', '%0A')}`);
    process.exit(1);
  }
  console.log('変更範囲 OK');
}
