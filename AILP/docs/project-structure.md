# AILP 管理メモ

## 目的

`dec-site` リポジトリ内で、既存の公開用LP群とAILP管理アプリを分けて管理する。

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
  chacha/         # 既存LP
  marr/           # 既存LP
    ailp-management/
      index.html  # AILP管理画面のメンテナンス表示
  resole/         # 既存LP
  ...
```

AILP管理アプリの実装コードは `AILP/front` に保管するが、ログイン実装までは公開しない。公開URLは `https://dec-site.netlify.app/marr/ailp-management/` とし、当面はタイトルと「メンテナンス中です。」だけを表示する。

既存の `/chacha/`、`/marr/`、`/resole/` などは維持する。`https://dec-site.netlify.app/` にはAILP管理画面を公開しない。

## Supabase

Supabase関連は `AILP/supabase` に置く。

- DB変更は `migrations/`
- Edge Functionsは `functions/`
- 本物のキーは `.env` に置く
- Gitには `.env.example` のみ入れる

## Git運用

`dist/`、`node_modules/`、`.env` はGit管理しない。コード、設定、ドキュメント、Supabase migrationはGit管理する。
