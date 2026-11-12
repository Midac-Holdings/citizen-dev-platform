// ポータル用のアプリ台帳（portal/src/generated/apps.json）を生成する。
// --check: 検証のみ（ファイルは書かない）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApps, toPortalApps } from './manifests.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const apps = loadApps(join(root, 'apps'));
  if (process.argv.includes('--check')) {
    console.log(`app.manifest.json OK（${apps.length}件）`);
  } else {
    const out = join(root, 'portal/src/generated/apps.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(toPortalApps(apps), null, 2) + '\n');
    console.log(`ポータル台帳を生成しました（${apps.length}件）`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
