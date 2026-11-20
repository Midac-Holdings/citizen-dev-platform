# App Service（F1）試作：準備の手順（AI担当）

今の Static Web Apps（SWA）はそのまま残し、同じ内容を App Service（F1・無料）にも公開する試作です。
F1 では、**ミダックのテナント限定ログイン**と **IP 制限**が無料でかけられます。

| | SWA（今） | App Service F1（試作） |
|---|---|---|
| ログイン | どの Microsoft アカウントでも通る | ミダックのテナントだけ |
| IP 制限 | なし | あり |
| ロール | SWA の「ロール管理」（招待・25人まで） | Entra の「アプリ ロール」（人数の上限なし・グループも可） |
| PR ごとのプレビュー | あり | なし（プレビューは引き続き SWA を使う） |

## 1. App Service を作る
Azure Portal →「App Service」→「作成」→「Web アプリ」
- 公開：コード／ランタイム スタック：**Node 22 LTS**／OS：**Linux**
- 価格プラン：**Free F1**
- 名前：例 `midac-citizen-f1`（URL は `https://<名前>.azurewebsites.net`）

作成後：
- 「設定」→「構成」→「全般設定」→ スタートアップ コマンド：`npm start`
- 同じ画面の「SCM 基本認証の発行資格情報」：**オン**（GitHub からの公開に使う）

## 2. ログイン（ミダックのテナント限定）
「設定」→「認証」→「ID プロバイダーを追加」→ **Microsoft**
- アプリの登録：**新しいアプリの登録を作成**（名前：例 `citizen-portal-f1`）
- サポートされているアカウントの種類：**現在のテナント - シングル テナント**
- 認証されていない要求：**HTTP 302 リダイレクト（推奨）**

## 3. ロール（アプリ ロール）
Entra ID →「アプリの登録」→ 2 で作ったアプリ →「アプリ ロール」→ 次の3つを作成
（許可されたメンバーの種類：ユーザー/グループ、値＝下の名前）
- `portal_admin`（管理画面）／`cp_contract`（契約情報抽出）／`general_affairs`（総務管理）

Entra ID →「エンタープライズ アプリケーション」→ 同じアプリ →「ユーザーとグループ」→「割り当ての追加」
で、人（またはグループ）とロールを割り当てる。割り当てがない社員も、全社員向けのアプリは使える。

## 4. 環境変数
「設定」→「環境変数」に、SWA と同じ AI の設定を入れる
`AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT`（あれば `AZURE_OPENAI_REASONING_EFFORT`）

## 5. IP 制限
「設定」→「ネットワーク」→「公衆ネットワーク アクセス」→「選択した仮想ネットワークと IP アドレスから有効」
- メイン サイト：会社の出口 IP を「許可」で追加。一致しない場合の動作：**拒否**
- 高度なツール サイト（SCM）：**制限しない**（GitHub からの公開に使うため。発行資格情報がないと使えない）

## 6. GitHub から公開する
- App Service の「概要」→「**発行プロファイルのダウンロード**」
- GitHub → Settings → Secrets and variables → Actions
  - Secrets：`AZURE_WEBAPP_PUBLISH_PROFILE` ＝ ダウンロードしたファイルの中身
  - Variables：`AZURE_WEBAPP_NAME` ＝ App Service の名前
- Actions →「App Service（F1 試作）に公開」→「Run workflow」（以後は main へのマージで自動）

## 7. そのほか
- タスクリ：Entra の Taskuri-Trial に、リダイレクト URI（SPA）`https://<名前>.azurewebsites.net/cp/tasukuri/` を追加
- 会社のアップロード制限：`<名前>.azurewebsites.net` の許可を情報システム部門に依頼

## F1 の制約
1日あたりの CPU 時間・転送量に上限があり、超えるとその日は止まる。しばらく使わないとスリープし、次の表示が遅い。稼働保証（SLA）なし。
