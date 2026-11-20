// ポータルと全アプリをビルドし、dist/ に1つのサイトとしてまとめる。
//   dist/                     ポータル
//   dist/<部署コード>/<アプリ名>/  各アプリ
//   dist/staticwebapp.config.json  パスごとのアクセス設定（自動生成・静的 Web アプリ用。テスト担当だけ）
//   appservice/generated/config.json  同じ設定の App Service 用（全社員向けのページはログインした社員なら使える）
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApps, restrictToTesters, toSwaConfig } from './manifests.mjs';
import { loadAppCapabilities } from './capabilities.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) => execFileSync(npm, args, { cwd: root, stdio: 'inherit' });

let apps;
try {
  apps = loadApps(join(root, 'apps'));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
run(['run', 'build', '-w', 'portal', '--', '--outDir', dist]);

for (const { dept, app, manifest } of apps) {
  if (manifest.status !== 'available') continue;
  const base = `/${dept}/${app}/`;
  console.log(`\n▶ ${manifest.name}（${base}）`);
  run(['run', 'build', '-w', `apps/${dept}/${app}`, '--', '--base', base, '--outDir', join(dist, dept, app), '--emptyOutDir']);
}

const config = toSwaConfig(apps, loadAppCapabilities());
// 静的 Web アプリ（PR のプレビュー用）：全社員向けのページも、テスト担当（preview_tester）だけにする
writeFileSync(join(dist, 'staticwebapp.config.json'), JSON.stringify(restrictToTesters(config), null, 2) + '\n');
// App Service（社員が使う入口・IP 制限＋社内のみ）：全社員向けのページは、ログインした社員なら使える
mkdirSync(join(root, 'appservice/generated'), { recursive: true });
writeFileSync(join(root, 'appservice/generated/config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`\n✔ dist/ にまとめました（アプリ ${apps.length}件）`);
