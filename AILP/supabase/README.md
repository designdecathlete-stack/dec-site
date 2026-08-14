# Supabase

Supabaseの管理ファイルを置く場所です。

- `migrations/`: DBスキーマ変更
- `functions/`: Edge Functions

本物のURLやキーは `.env` に置き、Gitには入れません。

## 現在の方針

- GoogleログインはSupabase Authで管理する
- 管理者/LPダッシュボード権限は `user_roles` で管理する
- クライアントとLPの紐付けは `clients` / `lp_projects` で管理する
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
