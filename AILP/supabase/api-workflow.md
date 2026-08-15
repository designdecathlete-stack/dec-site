# AILP API Workflow

## Answer: APIだけでいけるか

基本的にはAPI中心で実現できる。

ただし、初期設定だけは外部サービスの管理画面操作が必要。

- Googleログイン: Google Cloud ConsoleでOAuth Client ID/Secretを作成し、Supabase Auth Providerへ設定する
- GA4: Google CloudでGA4 Data APIを有効化し、サービスアカウントに対象GA4プロパティの閲覧権限を付ける
- GitHub/Netlify: API実行用のトークン、Build Hook、Deploy Preview権限を設定する

これらの初期設定後は、日常運用はAPIで進められる。

## Full Flow

```text
1. Googleログイン
2. LPをテンプレートから作成
3. GA4のデータ分析
4. AIで改善点提案
5. ユーザーが確認して修正依頼
6. URLは変えず、本番LPを差し替え。旧版はGitで戻せる状態に保存
```

## API Units

### 1. Googleログイン

Use Supabase Auth.

Frontend uses:

```ts
supabase.auth.signInWithOAuth({ provider: 'google' })
```

Backend DB behavior:

- `auth.users` にユーザーが作成される
- triggerで `profiles` を作成する
- `user_roles` で `admin` / `lp_dashboard` を判定する

APIとして新規実装するより、Supabase Authをそのまま使う。

### 2. LPをテンプレートから作成

Endpoint:

```text
POST /functions/v1/lp-create-from-template
```

Request:

```json
{
  "client_id": "uuid",
  "template_lp_project_id": "uuid",
  "name": "新しいLP名",
  "slug": "summer-campaign",
  "instruction": "既存LPをベースに夏キャンペーン訴求で作成"
}
```

Backend behavior:

- `lp_projects` に新しいLP予定レコードを作る
- `ai_change_requests` に制作依頼を作る
- 将来のXServer VPS/Codex実行APIへジョブを渡す
- 生成されたGit branch / preview URLを保存する

今はXServer VPS未実装なので、DB上に依頼を作るところまでをAPI化する。

### 3. GA4のデータ分析

Endpoint:

```text
POST /functions/v1/ga4-sync
```

Request:

```json
{
  "lp_project_id": "uuid",
  "date_from": "2026-08-01",
  "date_to": "2026-08-14"
}
```

Backend behavior:

- `lp_projects.ga4_page_path` を読む
- `clients.ga4_property_id` または `ga4_property_connections` からGA4 propertyと接続情報を決める
- GA4 Data APIで対象pathのデータを取得する
- `ga4_daily_metrics` にupsertする
- 実行履歴を `ga4_sync_jobs` に保存する

定期実行時は `lp_project_id` を省略し、activeなLPを全件同期する。

### 4. AIで改善点提案

Endpoint:

```text
POST /functions/v1/ai-analyze-lp
```

Request:

```json
{
  "lp_project_id": "uuid",
  "date_from": "2026-08-01",
  "date_to": "2026-08-14"
}
```

Backend behavior:

- LP情報を `lp_projects` から取得する
- GA4指標を `ga4_daily_metrics` から取得する
- 必要に応じてGitHub上のLPファイルを読む
- AIで課題と改善案を生成する
- `ai_analysis_results` に保存する

### 5. ユーザー確認と修正依頼

Endpoint:

```text
POST /functions/v1/ai-change-request
```

Request:

```json
{
  "lp_project_id": "uuid",
  "analysis_result_id": "uuid",
  "instruction": "FVの訴求を変更し、CTAをLINE予約に寄せたい"
}
```

Backend behavior:

- `ai_change_requests` を `requested` で作成する
- 現在のGit commit SHAを `before_commit_sha` に保存する
- 将来のXServer VPS/Codex実行APIへ修正ジョブを渡す
- 修正後のbranch / preview URLを保存する

### 6. URLを変えずに本番差し替え

Endpoint:

```text
POST /functions/v1/lp-publish
```

Request:

```json
{
  "ai_change_request_id": "uuid",
  "approved": true
}
```

Backend behavior:

- 対象LPの既存フォルダ名は変えない
- Git上で対象フォルダの中身だけを差し替える
- 旧版は `before_commit_sha` で戻せる状態にする
- mainへmerge/pushする
- Netlifyが本番デプロイする
- `ai_change_requests.status` を `published` にする

URL維持のルール:

```text
OK: chacha/index.html の中身を変更
OK: chacha/images/fv.webp を差し替え
NG: chacha/ を別名に変更
NG: public_url を変更
```

## Scheduled GA4 Sync

最終的には定期実行にする。

Candidate:

```text
Supabase Scheduled Edge Function
  daily 03:00
  -> ga4-sync
  -> active LP全件を同期
```

XServer VPS導入後:

```text
cron
  -> Supabase function ga4-sync
  -> 必要に応じてCodex解析ジョブも起動
```

定期実行に使うシークレットは、Edge Function SecretsまたはSupabase Vaultに保存する。DBの `integration_secret_refs` には、どのシークレットをどこに保存しているかの参照名だけを記録する。

オーナーがGoogle認証してGA4連携する場合は、`integration_connections` と `ga4_property_connections` で接続単位に管理する。cron用の内部トークンはアプリで1つでもよいが、GA4 OAuth tokenはオーナー/接続ごとに増える。

## Frontend Data Contract

フロントは画面に合わせて次を読む。

### 管理者画面

- `clients`
- `lp_projects`
- `ga4_daily_metrics`
- `ai_analysis_results`
- `ai_change_requests`

### クライアント画面

RLSにより、自分の `client_id` に紐づく情報だけ見える。

- 自社の `clients`
- 自社の `lp_projects`
- 自社LPの `ga4_daily_metrics`
- 自社LPの `ai_analysis_results`
- 自社LPの `ai_change_requests`

## Build Order

1. Supabase Auth Google設定
2. DB migration適用
3. 管理者ユーザーを `user_roles` に登録
4. 既存LPを `clients` / `lp_projects` に登録
5. GA4 sync API
6. AI analysis API
7. AI change request API
8. XServer VPS/Codex実行API
9. publish API
