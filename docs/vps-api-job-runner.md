# AILP VPS API job-runner 方針

AILPの管理画面からAI提案やdraft反映を実行する場合は、VPS workerをブラウザ待ちにせず、VPS HTTPS APIでジョブを受けてNode job-runnerがSupabaseへ結果を返す構成にする。

```text
AILP管理画面
  ↓
VPS HTTPS API
  ↓
Node job-runner
  ↓
Supabase更新
```

## LPごとの履歴・セッション保持

履歴を混ぜないため、すべての処理は `lp_project_id` を起点にする。`marr/lp1` と `marr/lp2` のように同じクライアント内でLPが増えても、各LPは別の `lp_project_id` を持つ。VPS APIは必ず `lp_project_id` または `job_id` を受け取り、そのLPだけを処理する。

保持する主な履歴は以下。

| テーブル | 役割 | LP分離のキー |
| --- | --- | --- |
| `lp_jobs` | ボタン操作ごとのジョブ、状態、失敗理由、commit、preview URL | `lp_project_id` |
| `lp_job_artifacts` | Codex用タスク材料、draft成果物、preview成果物 | `lp_project_id`, `job_id` |
| `ai_analysis_results` | GA4/HTML/CSSから作った改善提案 | `lp_project_id` |
| `lp_ai_interactions` | AI/Codex処理の入出力ログ | `lp_project_id`, `job_id` |
| `lp_ai_usage_logs` | AIコスト、tokens、model | `lp_project_id`, `job_id` |
| `git_versions` | draft / 本番反映のbranch・commit・URL | LPのfolder/pathとcommit |

これにより、管理画面ではLPごとに「過去の提案」「編集済み改善案」「draft生成」「本番反映」「rollback候補」を追える。

## API endpoints

VPS側の実装は `VPS/src/api/server.js`。

| endpoint | 用途 | body |
| --- | --- | --- |
| `GET /health` | API稼働確認 | なし |
| `POST /api/jobs/propose` | AI提案ジョブ作成・即時実行 | `{ "lp_project_id": "...", "payload": {} }` |
| `POST /api/jobs/apply-draft` | 保存済み提案をdraftへ反映 | `{ "lp_project_id": "...", "payload": {} }` |
| `POST /api/jobs/run` | 既存jobを再実行 | `{ "job_id": "..." }` |

APIは `VPS_API_TOKEN` が設定されている場合、`x-ailp-vps-token` または `Authorization: Bearer ...` を要求する。ブラウザに秘密トークンを直置きしないため、本番ではHTTPSリバースプロキシ、Netlify/Supabase Edge Functionなどのサーバ側proxyで隠す。

## フロント側の動作

`AILP/front/public/app.js` は以下の順でジョブを投入する。

1. `window.AILP_VPS_API_URL` が設定されていて、対象jobがAPI対応済みならVPS APIへ送る。
2. API未設定の場合は、従来通りSupabase `lp_jobs` に直接insertする。

このため、API移行中でも履歴は途切れない。VPS APIへ送った場合も、API側が `lp_jobs` にjobを作成し、結果を同じLPのテーブルへ保存する。

## VPS常駐

worker用サービスとは別にAPI用サービスを置く。

```bash
cp VPS/systemd/ailp-api.service ~/.config/systemd/user/ailp-api.service
systemctl --user daemon-reload
systemctl --user enable --now ailp-api
systemctl --user status ailp-api
```

`.env` に必要な値。

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
VPS_API_PORT=18787
VPS_API_TOKEN=長いランダム文字列
VPS_API_ALLOWED_ORIGINS=https://dec-site.netlify.app
```

`VPS_API_ALLOWED_ORIGINS` はカンマ区切りで複数指定できる。検証中だけ `*` にできるが、本番は管理画面のURLに絞る。

## 実運用での注意

Netlify上の管理画面からVPSへ直接アクセスする場合、VPS APIはHTTPSで公開する必要がある。IP直HTTPだとブラウザのMixed Contentで止まる。公開方法は以下のどちらかにする。

- Nginx + Let's Encryptで `https://api.example.com` をVPS APIへreverse proxyする。
- Netlify Function / Supabase Edge Functionをproxyにして、ブラウザには公開URLだけ見せ、VPS_API_TOKENはサーバ側に置く。

LPごとのセッション保持はDB側で担保する。APIやworkerは一時処理だけを担当し、状態は必ずSupabaseへ保存する。
