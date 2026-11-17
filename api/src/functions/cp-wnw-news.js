import { app } from '@azure/functions';
import { handleNews } from '../lib/midacNews.js';

// GET /api/cp-wnw/news
// 会社HP（www.midac.jp/news/）の新着情報一覧を返す。What'sNew ウォッチャー（apps/cp/wnw）用。
// 利用できる人は staticwebapp.config.json（app.manifest.json の access から自動生成）で制限される。
app.http('cp-wnw-news', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cp-wnw/news',
  handler: async (request, context) =>
    handleNews({ principalHeader: request.headers.get('x-ms-client-principal'), log: (m) => context.log(m) }),
});
