import { app } from '@azure/functions';
import { handleExtract } from '../lib/taskuri.js';

// POST /api/ai-taskuri/extract
// 利用できる人は staticwebapp.config.json（app.manifest.json の access から自動生成）で制限される。
app.http('taskuri-extract', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai-taskuri/extract',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'JSON を送ってください' } };
    }
    return handleExtract({
      principalHeader: request.headers.get('x-ms-client-principal'),
      body,
      env: process.env,
      log: (m) => context.log(m),
    });
  },
});
