import { readFileSync } from 'node:fs';
import { app } from '@azure/functions';
import { handleRead } from '../lib/readProxy.js';

// GET /api/read/{アプリID}?url=<読み取る URL>
// アプリが app.manifest.json の readFrom に宣言したサイトだけを、読むだけで取ってくる（申請不要・宣言制）。
// 「アプリ ID → 読んでよいサイト」は、ビルド時に tools/generate.mjs が作る。
let allowlist = {};
try {
  allowlist = JSON.parse(readFileSync(new URL('../generated/read-from.json', import.meta.url), 'utf8'));
} catch {
  allowlist = {};
}

app.http('read', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'read/{appId}',
  handler: async (request, context) =>
    handleRead({
      appId: request.params.appId,
      url: request.query.get('url'),
      principalHeader: request.headers.get('x-ms-client-principal'),
      allowlist,
      log: (m) => context.log(m),
    }),
});
