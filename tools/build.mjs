// ポータルと全アプリをビルドし、dist/ に1つのサイトとしてまとめる。
//   dist/                     ポータル
//   dist/<部署コード>/<アプリ名>/  各アプリ
//   dist/staticwebapp.config.json  パスごとのアクセス設定（自動生成）
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApps, toSwaConfig } from './manifests.mjs';

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

writeFileSync(join(dist, 'staticwebapp.config.json'), JSON.stringify(toSwaConfig(apps), null, 2) + '\n');
console.log(`\n✔ dist/ にまとめました（アプリ ${apps.length}件）`);
