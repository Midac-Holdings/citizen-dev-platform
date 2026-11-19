// ポータル用のアプリ台帳（portal/src/generated/apps.json）、管理画面用の台帳（admin-apps.json）、
// 読み取り API 用の「読んでよいサイト」（api/src/generated/read-from.json）、
// AI 読み取り API 用の「使ってよいアプリ」（api/src/generated/ai-apps.json）を生成する。
// --check: 検証のみ（ファイルは書かない）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApps, toAdminApps, toAiAllowlist, toPortalApps, toReadAllowlist } from './manifests.mjs';
import { loadAppCapabilities } from './capabilities.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const apps = loadApps(join(root, 'apps'));
  if (process.argv.includes('--check')) {
    console.log(`app.manifest.json OK（${apps.length}件）`);
  } else {
    const out = join(root, 'portal/src/generated/apps.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(toPortalApps(apps), null, 2) + '\n');
    writeFileSync(join(dirname(out), 'admin-apps.json'), JSON.stringify(toAdminApps(apps), null, 2) + '\n');
    // 読み取り API（api/）が使う「アプリごとの読んでよいサイト」
    const readOut = join(root, 'api/src/generated/read-from.json');
    mkdirSync(dirname(readOut), { recursive: true });
    writeFileSync(readOut, JSON.stringify(toReadAllowlist(apps), null, 2) + '\n');
    // AI 読み取り API（api/）が使う「使ってよいアプリ」
    writeFileSync(join(dirname(readOut), 'ai-apps.json'), JSON.stringify(toAiAllowlist(apps, loadAppCapabilities()), null, 2) + '\n');
    console.log(`ポータル台帳を生成しました（${apps.length}件）`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
