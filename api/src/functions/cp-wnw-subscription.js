import { app } from '@azure/functions';
import { handleSubscription } from '../lib/wnwSubscription.js';

// GET / PUT / DELETE /api/cp-wnw/subscription
// What'sNew ウォッチャー（apps/cp/wnw）：会社HPの新着をメールで受け取る登録の確認・登録・解除。
// 扱えるのはログインした本人のアドレスだけ（アドレスは画面から受け取らず、ログイン情報から決める）。
// 利用できる人は staticwebapp.config.json（app.manifest.json の access から自動生成）で制限される。
app.http('cp-wnw-subscription', {
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'cp-wnw/subscription',
  handler: async (request, context) =>
    handleSubscription({
      method: request.method,
      principalHeader: request.headers.get('x-ms-client-principal'),
      env: process.env,
      log: (m) => context.log(m),
    }),
});
