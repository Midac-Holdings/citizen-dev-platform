# What'sNew ウォッチャー

会社HP（www.midac.jp）の「新着情報」を一覧で確認するアプリです。

- **一覧**：基盤の API（`GET /api/cp-wnw/news`）が会社HPの新着情報一覧を読み、新しい順に最大50件を返します。
  記事のタイトルを押すと会社HPの記事が別タブで開きます。種類（お知らせ など）で絞り込めます。
- **NEW の印**：前回このアプリを開いたあとに増えた記事に「NEW」が付きます。既読の記録はこのブラウザ内（localStorage）にだけ保存します。
  初めて開いたときは印を付けません。
- **メールで受け取る**：ボタンを押すと、ログインしている本人のアドレスを登録します（`PUT /api/cp-wnw/subscription`、解除は `DELETE`）。
  会社HPに新しい記事が載ると、30分ほどで登録した人にメールが届きます。アドレスは画面から入力せず、ログイン情報から決めます。

## しくみ
| 部分 | 場所 | 管理者 |
|---|---|---|
| 画面 | `apps/cp/wnw/src/` | アプリの作成者 |
| 会社HPの読み取り | `api/src/lib/midacNews.js`、`api/src/functions/cp-wnw-news.js` | 基盤の管理者 |
| メール受け取りの登録・解除（Azure Table Storage に保存） | `api/src/lib/wnwSubscription.js`、`api/src/functions/cp-wnw-subscription.js` | 基盤の管理者 |
| 新着の確認とメール送信（30分おきのタイマー） | `Midac-Holdings/-taskuri-functions` の `src/functions/wnwTimer.ts` | 基盤の管理者 |
| 基盤の API の利用の許可 | `tools/app-capabilities.json`（`platform-api`） | 基盤の管理者 |

ブラウザから会社HPを直接読むことはできない（CSP と、会社HPが他サイトからの読み取りを許可していないため）ので、
基盤の API がサーバー側で読みます。

## 制限
- メール通知は、管理者が Azure の設定（README の「What'sNew ウォッチャーのメール通知」）を終えるまで「準備中」と表示されます。
- 登録できるのは会社のメールアドレス（既定は `midac.jp`）でログインした人だけです。
