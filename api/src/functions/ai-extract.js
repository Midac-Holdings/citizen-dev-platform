import { readFileSync } from 'node:fs';
import { app } from '@azure/functions';
import { handleAiExtract } from '../lib/aiExtract.js';

// POST /api/ai/{アプリID}/extract
// PDF・画像から、アプリが指定した項目を社内の Azure OpenAI で読み取る（AI担当が許可したアプリだけ）。
// 「使ってよいアプリ」は、ビルド時に tools/generate.mjs が tools/app-capabilities.json から作る。
// 利用できる人は staticwebapp.config.json（app.manifest.json の access から自動生成）で制限される。
let allowlist = [];
try {
  allowlist = JSON.parse(readFileSync(new URL('../generated/ai-apps.json', import.meta.url), 'utf8'));
} catch {
  allowlist = [];
}

app.http('ai-extract', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai/{appId}/extract',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'JSON を送ってください' } };
    }
    return handleAiExtract({
      appId: request.params.appId,
      principalHeader: request.headers.get('x-ms-client-principal'),
      body,
      allowlist,
      env: process.env,
      log: (m) => context.log(m),
    });
  },
});
