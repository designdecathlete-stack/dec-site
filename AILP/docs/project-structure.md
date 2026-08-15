# AILP 管理メモ

## 目的

`dec-site` リポジトリ内で、既存の公開用LP群とAILP管理アプリを分けて管理する。

## 担当範囲

現在の担当はバックエンド側。フロント担当者が並列で作業するため、`AILP/front` の画面実装・デザイン・表示ロジックは勝手に変更しない。

バックエンド側では、Supabaseを使って次の機能を段階的に構築する。

- Googleログインによるユーザー管理
- 管理者・LPダッシュボード閲覧者の権限管理
- クライアントごとのLP・公開URL・Gitフォルダパス管理
- GA4連携データの保存・集計
- LPのAI解析結果の保存
- LPのAI修正依頼・承認・公開履歴の管理
- Git commit / branch / preview URL と紐づくバージョン管理
- 監査ログ、通知、ジョブ、承認、プレビュー、Git履歴、Netlifyデプロイ履歴、LPファイルメタ情報の管理

LPファイル本体と過去版はGitで管理し、Supabaseにはユーザー、権限、対象LP、解析結果、AI修正依頼、承認状態、Git commit SHA、Netlify preview URLなどの管理情報を保存する。

## 採用構成

このプロジェクトは次の役割分担で進める。

```text
Netlify
  画面、Webフロント、既存LPの公開を担当する。
  LP1、LP2、LP3などクライアントごとの静的LPファイルは、これまでの運用を維持してNetlify側で公開する。

Supabase
  ログイン、DB、ユーザー情報、プロジェクト情報を担当する。
  Googleログイン、管理者・LPダッシュボード閲覧者権限、LP情報、AI解析結果、AI修正依頼、承認状態を管理する。

XServer VPS
  将来的にCodexを実際に動かす実行マシンとして使う。
  まずはAPI経由の設計だけを想定し、今回の実装対象には含めない。
```

当面は、NetlifyとSupabaseを中心に構築する。XServer VPS上のCodex実行環境、フォルダ単位の自動修正、Gitブランチ作成、Netlify Deploy Preview連携は後フェーズで実装する。

## 業務フロー

最終的な運用フローは次の通り。

1. Googleログイン
2. LPをテンプレートから作成
3. GA4のデータをLPごとに取得・分析
4. AIで改善点を提案
5. ユーザーが確認し、必要に応じて修正依頼
6. 新しいLPを作成し、現在のLPはGitで戻せる状態に保存する
7. 公開URLは変えず、対象LPフォルダの中身だけを本番用に差し替える

この流れは基本的にAPI中心で実装できる。Google OAuth、GA4 service account、GitHub/Netlify tokenなどの初期設定は各サービスの管理画面で行う必要がある。

## フォルダ方針

```text
app/
  AILP/
    front/       # AILP管理アプリ本体
    supabase/    # Supabase migrations / functions
    docs/        # 設計メモ、運用メモ
    .env.example # 環境変数の見本
  front-edit/    # フロント担当者の並列作業領域
```

## フロント

`AILP/front` にアプリのコード一式を置く。

- `index.html`
- `app.js`
- CSS一式
- `assets/`
- `package.json`

現時点の参照元は静的HTML/CSS/JSだが、Viteで開発・ビルドできる構成にしている。React化する場合も、この `AILP/front` 内で `src/` を追加して移行する。

## Netlify

既存LPは運用中のため、既存URLを変えないことを優先する。

リポジトリ直下の `netlify.toml` は、公開用 `dist/` を生成するルートビルドを実行する。

公開用 `dist/` は次の構成で作る。

```text
dist/
  ailp-management/
    index.html  # AILP管理画面のメンテナンス表示
  chacha/         # 既存LP
  marr/           # 既存LP
  resole/         # 既存LP
  ...
```

AILP管理アプリの実装コードは `AILP/front` に保管するが、ログイン実装までは公開しない。公開URLは `https://dec-site.site/ailp-management/` とし、当面はタイトルと「メンテナンス中です。」だけを表示する。

既存の `/chacha/`、`/marr/`、`/resole/` などは維持する。ドメイン直下 `/` にはAILP管理画面を公開しない。

## Supabase

Supabase関連は `AILP/supabase` に置く。

- DB変更は `migrations/`
- Edge Functionsは `functions/`
- 本物のキーは `.env` に置く
- Gitには `.env.example` のみ入れる

Supabase側の今回のアプリ名・管理単位も `ailp-management` に揃える。

- アプリ識別名: `ailp-management`
- Google OAuth / GA4 / secrets / cron / Edge Functions はこの `ailp-management` 単位で管理する
- 既存の仮名 `ailp-manager` を使う場合も、運用上の正式名称は `ailp-management` として扱う

## Git運用

`dist/`、`node_modules/`、`.env` はGit管理しない。コード、設定、ドキュメント、Supabase migrationはGit管理する。
