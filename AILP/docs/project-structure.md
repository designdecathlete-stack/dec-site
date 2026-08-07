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
  index.html      # AILP管理アプリ
  app.js          # AILP管理アプリ
  assets/
  chacha/         # 既存LP
  marr/           # 既存LP
  resole/         # 既存LP
  ...
```

これにより `https://dec-site.netlify.app/` ではAILP管理アプリを表示し、既存の `/chacha/`、`/marr/`、`/resole/` などは維持する。

## Supabase

Supabase関連は `AILP/supabase` に置く。

- DB変更は `migrations/`
- Edge Functionsは `functions/`
- 本物のキーは `.env` に置く
- Gitには `.env.example` のみ入れる

## Git運用

`dist/`、`node_modules/`、`.env` はGit管理しない。コード、設定、ドキュメント、Supabase migrationはGit管理する。
