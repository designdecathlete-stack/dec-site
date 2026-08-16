# Supabase

Supabaseの管理ファイルを置く場所です。

- `migrations/`: DBスキーマ変更
- `functions/`: Edge Functions

本物のURLやキーは `.env` に置き、Gitには入れません。

## 現在の方針

- Supabase側の今回のアプリ識別名は `ailp-management` で統一する
- GoogleログインはSupabase Authで管理する
- 管理者/LPダッシュボード権限は `user_roles` で管理する
- 初期管理者メールは `admin_email_allowlist` で管理し、該当メールで初回ログインしたユーザーには自動で `admin` を付与する
- クライアントとLPの紐付けは `clients` / `lp_projects` で管理する
- GA4のGoogle接続は `integration_connections` / `ga4_property_connections` でオーナー・クライアント・プロパティ単位に管理できるようにする
- GA4の日次データは `ga4_daily_metrics` に保存する
- AI解析・修正依頼は `ai_analysis_results` / `ai_change_requests` に保存する
- フロント画面の実装は担当外のため、バックエンド契約とDBを先に整える

## API構築順

1. GoogleログインはSupabase Authを使う
2. `clients` / `lp_projects` に既存LPを登録する
3. `ga4-sync` APIでGA4データをLP別に保存する
4. `ai-analyze-lp` APIで改善点を保存する
5. `ai-change-request` APIでユーザー確認後の修正依頼を保存する
6. 将来、XServer VPS上のCodex実行APIへ修正ジョブを渡す
7. `lp-publish` APIでURLを変えずに本番LPを差し替える

詳細は `auth-ga4-plan.md` と `api-workflow.md` を参照する。

シークレットと定期実行の方針は `secret-and-schedule-plan.md` を参照する。

監査ログ、通知、ジョブ、承認、プレビュー、Git履歴、Netlifyデプロイ履歴、LPファイルメタ情報は `operations-workflow-plan.md` を参照する。

## ローカル実装済み

- `migrations/202608150001_admin_email_allowlist.sql`
  - 初期管理者メールの自動 `admin` 付与
- `migrations/202608150002_ga4_oauth_connections.sql`
  - GA4接続メタデータ
- `migrations/202608150003_backend_runtime.sql`
  - `google_oauth_states`
  - `enqueue_app_job()`
  - `user_can_access_lp()`
  - `app_private.invoke_edge_function()`
  - `pg_net` / `pg_cron`
- `functions/ga4-sync`
  - service account 方式の GA4 Data API 同期
- `functions/lp-create-from-template`
  - LP作成依頼のバックエンド入口
- `functions/ai-change-request`
  - AI修正依頼のバックエンド入口
- `functions/lp-publish`
  - 承認と公開ジョブ投入のバックエンド入口
- `migrations/202608160001_api_logs.sql`
  - `api_logs` テーブル
  - Edge Functions の request / stage / error ログ
- `migrations/202608160002_dashboard_reporting_and_live_state.sql`
  - `git_versions.published_at` / `replaced_at`
  - `lp_dashboard_overview`
  - `api_logs_overview`

## 管理者が主に見るもの

- `lp_dashboard_overview`
  - LPごとの公開状態
  - 直近30日のGA4集計
  - 最新同期結果
  - 最新AI分析
- `api_logs_overview`
  - function名
  - stage
  - level
  - request_id
  - actor / client / LP
  - status_code / duration_ms

## まだ接続待ちのもの

- Supabase Dashboard 側の Google Provider 有効化
- Supabase Project への migration 適用
- Edge Function secrets 設定
  - `SUPABASE_SECRET_KEY`
  - `APP_INTERNAL_CRON_TOKEN`
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
- owner OAuth 方式の GA4 token 永続保存
