// App Service（F1）の起動ファイル。npm start → node appservice/server.mjs
// 環境変数（App Service の「環境変数」に設定する。鍵はコードに書かない）：
//   AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT（タスクリ・AI 読み取り）
//   WEBSITE_AUTH_ENABLED（App Service が認証を有効にすると自動で付く。True のときだけログイン情報を信用する）
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { handleExtract } from '../api/src/lib/taskuri.js';
import { handleRead } from '../api/src/lib/readProxy.js';
import { handleAiExtract } from '../api/src/lib/aiExtract.js';
import { createHandler } from './app.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(join(root, p), 'utf8'));
  } catch {
    return fallback;
  }
};

// App Service 用の設定（tools/build.mjs が作る）。静的 Web アプリ用（テスト担当だけ）とは別
const config = readJson('appservice/generated/config.json', null);
if (!config) {
  console.error('appservice/generated/config.json がありません（npm run build のあとに起動してください）');
  process.exit(1);
}
const readAllowlist = readJson('api/src/generated/read-from.json', {});
const aiAllowlist = readJson('api/src/generated/ai-apps.json', {});
const log = (m) => console.log(m);

const trustPrincipal = String(process.env.WEBSITE_AUTH_ENABLED).toLowerCase() === 'true';
if (!trustPrincipal) console.warn('App Service の認証が無効です。全員を未ログインとして扱います（ログインが必要なページは開けません）');

const handler = createHandler({
  distDir: join(root, 'dist'),
  config,
  trustPrincipal,
  log,
  api: {
    tasukuriExtract: ({ principalHeader, body }) => handleExtract({ principalHeader, body, env: process.env, log }),
    read: ({ appId, url, principalHeader }) => handleRead({ appId, url, principalHeader, allowlist: readAllowlist, log }),
    aiExtract: ({ appId, principalHeader, body }) => handleAiExtract({ appId, principalHeader, body, allowlist: aiAllowlist, env: process.env, log }),
  },
});

const port = Number(process.env.PORT) || 8080;
createServer((req, res) => void handler(req, res)).listen(port, () => console.log(`listening on ${port}`));
