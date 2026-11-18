# MidacHP 新着ウォッチャー（apps/cp/hpwatcher）

当社HP（https://www.midac.jp/news/）の新着情報を一覧表示し、まだ見ていない記事に「新着」を付けます。

- HPは基盤の読み取り API（`/api/read/cp-hpwatcher`）経由で読みます（`app.manifest.json` の `readFrom` に `www.midac.jp` を宣言）。
- 既読の記録はブラウザ内（localStorage）にだけ保存します。
- 「新着を確認」で読み込みます。初めて確認したときは今ある記事をすべて既読にし、次回から増えた記事に「新着」を付けます。
- 新着時のメール通知は未対応です（外部への送信は AI担当の確認が必要なため）。
