// ⑤ 禁止パターンチェック：市民アプリのコードに、危ない書き方がないか。
// 該当したら PR は失敗する。正当な理由があれば AI担当に相談する（ルールの変更は管理者が行う）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = [
  { id: 'external-url', re: /https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/i, message: '外部のURLが書かれています。外部サービスとの連携・外部ファイルの読み込みは AI担当に相談してください' },
  { id: 'network', re: /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource)\b/, message: '通信処理があります。データの送受信は AI担当に相談してください' },
  { id: 'eval', re: /\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*['"`]/, message: '文字列をプログラムとして実行する処理（eval 等）は使えません' },
  { id: 'raw-html', re: /dangerouslySetInnerHTML|\.(inner|outer)HTML\s*=|insertAdjacentHTML|document\.write/, message: 'HTMLを直接書き込む処理は使えません（画面の乗っ取りにつながります）。React の通常の書き方で表示してください' },
  { id: 'cookie', re: /document\.cookie/, message: 'Cookie は扱えません' },
  { id: 'auth', re: /\/\.auth\/|msal|oauth|client_secret|clientSecret/i, message: 'ログイン・認証の処理は書かないでください（サイト全体で自動設定されます）' },
  { id: 'env', re: /import\.meta\.env\.(?!DEV\b|PROD\b|MODE\b|BASE_URL\b)|process\.env/, message: '環境変数（設定値・鍵）は使えません' },
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html', '.css', '.json']);
const SKIP_DIRS = new Set(['node_modules', 'dist']);
const SKIP_FILES = /(\.test\.|\.spec\.|setupTests\.|^package(-lock)?\.json$|^tsconfig\.json$|^app\.manifest\.json$)/;

/** 1ファイル分の検出結果。コメント行は対象外。 */
export function scanSource(text) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push({ line: i + 1, rule: rule.id, message: rule.message, text: t.slice(0, 120) });
    }
  });
  return findings;
}

export function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...listFiles(p));
    } else if (EXTENSIONS.has(extname(name)) && !SKIP_FILES.test(name)) {
      out.push(p);
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = listFiles(join(root, 'apps'));
  let count = 0;
  for (const file of files) {
    const rel = relative(root, file);
    for (const f of scanSource(readFileSync(file, 'utf8'))) {
      count++;
      console.log(`::error file=${rel},line=${f.line}::${f.message}`);
      console.log(`  ${rel}:${f.line}  [${f.rule}]  ${f.text}`);
    }
  }
  if (count) {
    console.log(`\n禁止パターンが ${count}件 見つかりました。`);
    process.exit(1);
  }
  console.log(`禁止パターンなし（${files.length}ファイルを確認）`);
}
