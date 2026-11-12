// 市民用テンプレートから新しいアプリを作る。
//   npm run new-app -- <部署コード> <アプリ名>
// 例: npm run new-app -- bm meeting-room
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [dept, app] = process.argv.slice(2);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

if (!dept || !app || !SLUG.test(dept) || !SLUG.test(app)) {
  console.error('使い方: npm run new-app -- <部署コード> <アプリ名>（半角英小文字・数字・ハイフン）\n例: npm run new-app -- bm meeting-room');
  process.exit(1);
}
const dest = join(root, 'apps', dept, app);
if (existsSync(dest)) {
  console.error(`apps/${dept}/${app} は既にあります`);
  process.exit(1);
}

cpSync(join(root, 'apps/_template'), dest, {
  recursive: true,
  filter: (src) => !/node_modules|dist/.test(src),
});
const pkgPath = join(dest, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = `@apps/${dept}-${app}`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`apps/${dept}/${app} を作成しました。
次に:
  1. apps/${dept}/${app}/app.manifest.json に名前・説明・利用できる人を書く
  2. npm install（新しいアプリを登録するため、最初に1回）
  3. npm run dev -w apps/${dept}/${app} で画面を確認しながら作る`);
