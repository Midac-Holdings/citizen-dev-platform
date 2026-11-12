# citizen-app-pilot（市民開発パイロット）

社員（市民開発者）が Claude Code で作った社内アプリを、
**GitHub でプルリクエスト → 自動チェック → AI担当が承認 → 自動で公開**する流れを試すリポジトリです。

```
市民：Claude Code でアプリを作る ─▶ PR を出す
                                    │
                                    ▼
                     自動チェック（秘密情報スキャン・申告の確認・テスト・ビルド）
                                    │
                                    ▼
                     プレビュー環境に公開（PR にURLがコメントされる・ログイン必須）
                                    │
AI担当：内容とプレビューを確認 ─▶ Approve（承認）→ Merge
                                    │
                                    ▼
                     本番に自動公開 → ポータルにカードが出る
```

ポータルと全アプリを **1つの Azure Static Web Apps** にまとめて公開します。
ログインは1回で、アプリごとに利用できる人を分けられます。

```
https://<サイト>/                    ポータル
https://<サイト>/bm/equipment/       備品申請（BM部）
https://<サイト>/<部署コード>/<アプリ名>/
```

> ⚠️ **デモ構成です。** Static Web Apps（Free プラン）の標準 Microsoft ログインを使っているため、
> **社外の Microsoft アカウントでもログインできます。** 社外秘・個人情報を扱うアプリは載せないでください。
> 本番化の手順は下の「本番に向けて」を参照してください。

## 構成

```
portal/                        ポータル（React + TypeScript + Vite）
apps/<部署コード>/<アプリ名>/     各アプリ（1フォルダ＝1アプリ）
  └ app.manifest.json          アプリの申告（名前・説明・カテゴリ・利用できる人）
apps/_template/                市民用テンプレート
tools/                         申告の検証、ポータル台帳・アクセス設定の生成、ビルド
.github/workflows/ci-deploy.yml チェックと公開
.github/CODEOWNERS             承認者（AI担当）
.github/pull_request_template.md PR のチェックリスト
CLAUDE.md                      Claude Code が守るルール（認証を書かない・鍵を書かない 等）
```

### app.manifest.json（アプリの申告）

```json
{
  "name": "備品申請",
  "description": "文房具やPC周辺機器などの備品を申請できます。",
  "category": "申請・手続き",
  "icon": "📦",
  "color": "#2bb673",
  "owner": "総務G",
  "status": "available",
  "access": ["authenticated"]
}
```

| 項目 | 内容 |
|---|---|
| `category` | 申請・手続き／施設・設備／お知らせ・情報／サポート／管理 |
| `status` | `available`（公開）／`preparing`（準備中：カードは出るが開けない） |
| `access` | 利用できるロール。`authenticated` は全社員（ログインした人全員）。`general-affairs` などの独自ロールは特定の人だけ |

この申告から次の2つを**自動生成**します（手で書かないので食い違いません）。
- ポータルのカード一覧（誰にどのカードを見せるか）
- `staticwebapp.config.json`（どのパスを誰が開けるか。**サーバー側で制限**されます）

## コマンド

```bash
npm install
npm run new-app -- bm meeting-room   # テンプレートから新しいアプリを作る
npm run dev:portal                   # ポータルを開発モードで表示（デモ利用者の切り替えあり）
npm run dev -w apps/bm/equipment     # アプリを開発モードで表示
npm test                             # すべてのテスト
npm run build                        # dist/ に1つのサイトとしてまとめる
```

## デモの準備

### Azure（Static Web Apps）
1. Azure ポータルで **Static Web Apps を新規作成**（プラン：Free、デプロイの詳細：**その他**）
2. 作成したリソースの「概要」→「**デプロイ トークンの管理**」でトークンをコピー
3. GitHub のこのリポジトリ →「Settings → Secrets and variables → Actions → New repository secret」
   - 名前：`AZURE_STATIC_WEB_APPS_API_TOKEN`、値：コピーしたトークン
4. （総務管理カードの確認用）Static Web Apps の「**ロール管理**」→「招待」で、
   確認用のユーザーにロール `general-affairs` を付ける

トークン未登録の間は、チェックだけ実行して公開はスキップされます。

### GitHub
1. 「Settings → General」で**リポジトリを Public** にする（無料プランでブランチ保護を使うため）
2. 「Settings → Branches → Add branch protection rule」（対象：`main`）
   - ✅ Require a pull request before merging
     - ✅ Require approvals（1）
     - ✅ Require review from Code Owners
   - ✅ Require status checks to pass → 「チェック（秘密情報・申告・テスト・ビルド）」を選ぶ
   - ✅ Do not allow bypassing the above settings
3. 市民役の GitHub アカウントを「Settings → Collaborators」で招待する
   （自分の PR は自分で承認できないため、市民役と AI担当役は別アカウントが必要）

## デモの流れ（例）

1. **市民役**：Claude Code に「BM部の会議室予約アプリを作って」と依頼
   → `npm run new-app -- bm meeting-room` から作成、テスト、PR を作成
2. **自動チェック**：PR に結果が表示される（わざとAPIキーを書くと秘密情報スキャンで失敗）
3. **プレビュー**：PR にプレビューURLがコメントされる。ログインして動作を確認
4. **AI担当役**：PR のチェックリストを確認 → Approve → Merge
5. **本番公開**：数分でポータルに「会議室予約」カードが追加され、`/bm/meeting-room/` で開ける

## 制限事項（デモ）
- ログインは Static Web Apps 標準の Microsoft ログイン。**社外アカウントでもログイン可能**。
- 独自ロール（`general-affairs` 等）は Static Web Apps の招待で個別に付ける。
- 備品申請のデータはブラウザ内（localStorage）にのみ保存され、総務には届きません。
- Free プランのプレビュー環境は同時に3つまで。

## 本番に向けて
1. Static Web Apps を **Standard プラン**にし、**自社テナント限定の Entra ID 登録**（カスタム認証）に切り替える
2. Entra の**セキュリティグループ → ロール**の変換（`rolesSource`）を追加し、招待制をやめる
3. リポジトリを **Private**（GitHub Pro 以上、または組織のリポジトリ）に戻し、ブランチ保護を維持する
4. 個人情報を扱うアプリは別の Static Web Apps に分離する
