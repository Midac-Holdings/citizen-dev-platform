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
- GitHub → Settings → Environments →「New environment」：名前 `production`
  - Deployment branches and tags：**Selected branches and tags** → `main` だけを追加
- App Service の「概要」→「**発行プロファイルのダウンロード**」
- `production` の Environment secrets：`AZURE_WEBAPP_PUBLISH_PROFILE` ＝ ダウンロードしたファイルの中身
  - ⚠ リポジトリのシークレット（Settings → Secrets and variables → Actions）には置かない。
    市民のブランチで書き換えたワークフローからも使えてしまうため
- GitHub → Settings → Secrets and variables → Actions → Variables：`AZURE_WEBAPP_NAME` ＝ App Service の名前
- Actions →「App Service（F1 試作）に公開」→「Run workflow」（以後は main へのマージで自動）

## 7. そのほか
- タスクリ：Entra の Taskuri-Trial に、リダイレクト URI（SPA）`https://<名前>.azurewebsites.net/cp/tasukuri/` を追加
- 会社のアップロード制限：`<名前>.azurewebsites.net` の許可を情報システム部門に依頼

## F1 の制約
1日あたりの CPU 時間・転送量に上限があり、超えるとその日は止まる。しばらく使わないとスリープし、次の表示が遅い。稼働保証（SLA）なし。

---

# 検証用（stg）：マージ前に本番と同じ仕組みで確認する

PR ごとのプレビュー（静的 Web アプリ）は URL が PR ごとに変わり、サインインの戻りにアプリのログインが割り込むため、
タスクリのメール読み取りなど **Microsoft 365 へのサインインを使う機能は確認できない**。
そこで、本番と同じ仕組み（App Service・テナント限定ログイン・IP 制限）の検証用を1つ置き、PR の内容を手動で公開して確認する。

| | 本番 | 検証用（stg） |
|---|---|---|
| 名前 | `midac-citizen-f1` | `midac-citizen-f1-stg` |
| App Service プラン | F1 | `gijiro-plan` |
| ログイン（Easy Auth）のアプリ登録 | `citizen-portal-f1` | `Taskuri-Trial`（`b43a7140-b3f7-474c-882e-c483b8f17e5e`） |
| 公開 | main へのマージで自動 | Actions から手動（PR の番号を指定） |
| GitHub の環境 | `production` | `staging` |

## 1. App Service を作る
Azure Portal →「App Service」→「作成」→「Web アプリ」
- 名前：`midac-citizen-f1-stg`／公開：コード／ランタイム スタック：**Node 22 LTS**
- App Service プラン：**`gijiro-plan`**（OS・リージョンはプランに合わせて決まる。**Linux のプランであること**を確認する。
  Windows のプランだと `npm start` で起動しないため、この手順では動かない）

作成後：
- 「設定」→「構成」→「全般設定」→ スタートアップ コマンド：`npm start`
- 同じ画面の「SCM 基本認証の発行資格情報」：**オン**（GitHub からの公開に使う）
- 「概要」の「既定のドメイン」を控える（以下 `<stgのURL>`。例：`midac-citizen-f1-stg-xxxx.japaneast-01.azurewebsites.net`）

## 2. ログイン（Easy Auth）：Taskuri-Trial を使う
「設定」→「認証」→「ID プロバイダーを追加」→ **Microsoft**
- アプリの登録の種類：**このディレクトリ内の既存のアプリの登録を選択する** → `Taskuri-Trial`
- クライアント シークレットの有効期限：既定のまま（Taskuri-Trial にシークレットが1つ作られる）
- 認証されていない要求：**HTTP 302 リダイレクト（推奨）**

追加後、Entra ID →「アプリの登録」→ Taskuri-Trial →「認証」で確認する：
- 「**Web**」に `https://<stgのURL>/.auth/login/aad/callback` があること（ポータルが自動で追加する。なければ追加）
- 「暗黙的な許可およびハイブリッド フロー」の「**ID トークン**」にチェックがあること（Easy Auth が使う）
- 「**シングルページ アプリケーション**」に `https://<stgのURL>/cp/tasukuri/` を追加する（タスクリのメール読み取り用）

> 注意：アプリ ロール（`portal_admin` など）は本番のアプリ登録（`citizen-portal-f1`）に作ってあるため、
> 検証用では**ロール限定のページ（管理画面・契約情報抽出など）は開けない**。全社員向けのページ（タスクリなど）は確認できる。
> ロール限定のページも検証用で確認したい場合は、Taskuri-Trial に同じアプリ ロールを作り、確認する人に割り当てる。

## 3. 環境変数
本番と同じ AI の設定を入れる：`AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT`（あれば `AZURE_OPENAI_REASONING_EFFORT`）

## 4. IP 制限（本番と同じ）
「設定」→「ネットワーク」→「公衆ネットワーク アクセス」→「選択した仮想ネットワークと IP アドレスから有効」
- メイン サイト：会社の出口 IP を「許可」で追加。一致しない場合の動作：**拒否**
- 高度なツール サイト（SCM）：**制限しない**（GitHub からの公開に使うため）

## 5. GitHub の準備
- GitHub → Settings → Environments →「New environment」：名前 `staging`
  - Deployment branches and tags：**Selected branches and tags** → `main` だけを追加
    （ワークフローは main のものが動き、PR の内容は取り出してビルドするだけなので、main だけで足りる）
  - 任意：Required reviewers に AI担当を入れると、公開の前に承認が必要になる
  - Environment secrets：`AZURE_WEBAPP_PUBLISH_PROFILE` ＝ 検証用 App Service の「発行プロファイル」の中身
    （⚠ リポジトリのシークレットには置かない）
  - Environment variables：`AZURE_WEBAPP_NAME_STG` ＝ `midac-citizen-f1-stg`

## 6. 使い方
1. GitHub → Actions →「検証用 App Service（stg）に公開」→「Run workflow」
2. 「公開する PR の番号」に PR の番号（例：`23`）を入れて実行（空なら main）
3. 終わったら `https://<stgのURL>/` を開いて確認する

- 検証用は1つだけなので、別の PR を公開すると上書きされる。
- PR のコードは、鍵を持たないジョブでビルドする。公開するジョブは、そのビルド結果（ファイル）を受け取るだけで PR のコードは実行しない。
- 他人のフォーク（外部）からの PR も指定できてしまうので、中身を確認してから公開する。
