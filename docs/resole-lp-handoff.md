# Resole LP 修正・公開の引き継ぎ

最終更新: 2026-11-10（日本時間）

## 最初に確認すること

- 現在はピラティス訴求LPを比較用ページで確認している段階です。比較用の公開と本番LPへの反映は別作業です。
- 「比較ページを更新」では本番LPを変更しません。本番反映は対象店舗とページを確認し、明示的な依頼を受けて実施してください。
- 比較用ページもインターネットから閲覧できます。`noindex,nofollow` はアクセス制限ではありません。機密情報は置かないでください。
- 依頼された原稿・料金・画像・店舗別リンクを保ち、未確認の条件、実績、口コミを作らないでください。

## ページと公開URL

公開ルート: https://dec-site.netlify.app/

| 用途 | リポジトリ内ファイル | 公開URL |
| --- | --- | --- |
| 田町・神田の比較 | `resole/compare_pilates.html` | https://dec-site.netlify.app/resole/compare_pilates.html |
| 田町ピラティス確認用 | `resole/preview/index_pilates_tamachi.html` | https://dec-site.netlify.app/resole/preview/index_pilates_tamachi.html |
| 神田ピラティス確認用 | `resole/preview/index_pilates.html` | https://dec-site.netlify.app/resole/preview/index_pilates.html |
| 田町ピラティス本番 | `resole/index_pilates_tamachi.html` | https://dec-site.netlify.app/resole/index_pilates_tamachi.html |
| 神田ピラティス本番 | `resole/index_pilates.html` | https://dec-site.netlify.app/resole/index_pilates.html |
| 田町通常LP本番 | `resole/index_tamachi.html` | https://dec-site.netlify.app/resole/index_tamachi.html |
| 神田通常LP本番 | `resole/index.html` | https://dec-site.netlify.app/resole/index.html |

比較ページは左が田町、右が神田です。`?sync=1` がなくても同時スクロールします。ページ全体のスクロール率を同期する方式なので、内容の高さが違うと同じ見出し位置にはなりません。

## 店舗別LINE CTA（最重要）

| 対象 | 指定URL |
| --- | --- |
| 神田ピラティス | https://s.lmes.jp/landing-qr/2011885360-dbFiaZj4?uLand=XgMtxf |
| 田町ピラティス | https://s.lmes.jp/landing-qr/2011021865-eK3JLqVB?uLand=kw6S3e |
| 田町通常LP | https://s.lmes.jp/landing-qr/2011021865-eK3JLqVB?uLand=oopWxj |

- 神田通常LPのURLは、上記ピラティス用から推測して変更しないでください。対象ファイルと最新の指定を別途確認します。
- 確認用ピラティスLPは各6か所（右サイド、FV下、事例下、料金下、末尾、モバイル固定CTA）。全箇所を調べます。
- 現在の文言は「登録して特典を受け取る→」。緑の立体感のあるボタンです。
- リンク先を正しく設置したことと、LINE登録後の特典配信・流入計測が動作することは別です。後者はLINE側で実登録テストが必要です。

## 現在の比較用LPの内容

- オファー: 「初回体験キャンペーン」「無料体験」＋「追加特典」「入会金 通常33,000円 → 無料」。両店舗共通。
- 月額税込料金: 月4回48,800円、月6回73,200円、月8回97,600円。表記はカンマ付き。
- 無料特典の適用条件・期限は未確定です。体験当日入会などの条件を勝手に付けず、依頼者に確認してください。
- 田町アクセス: 田町駅徒歩6分・三田駅徒歩4分。FV画像内と店舗情報の両方を更新済みです。
- 田町住所: 東京都港区芝5丁目23-1 Mita 3Kビル101。
- 神田住所: 東京都千代田区神田須田町1-12-9 富士第一ビル4階。
- 神田アクセス: 小川町駅徒歩1分、淡路町駅徒歩1分、神田駅徒歩3〜5分、秋葉原駅徒歩8分。
- 田町の地図は2026-11-10支給のGoogle Maps埋め込みコードに変更済み。店舗識別子は `0x60188b3abaf7a74f:0x5edf28bafd5d561`。外部リンクも同店舗です。旧PARADISE指定へ戻さないでください。
- 両店舗の口コミ4件とGoogle評価表示は同内容です。田町には「※神田店データ」があります。口コミ全体の出典として十分明確かは本番反映前に確認します。
- Before & Afterは既存のパーソナル指導事例3件。「ピラティス単独の効果ではない」「結果には個人差がある」の注記を削除しないでください。
- 神田側でも田町撮影素材を暫定使用するよう依頼されています。神田店舗で撮影した写真と断定しないでください。

## 画像と元素材

元素材フォルダ（元の作業PCのみ）: `C:/Users/kanat/Downloads/Resole田町店_素材_20261110`

| 用途 | 元写真 | 設置画像（`resole/images/` 内） |
| --- | --- | --- |
| コンセプト見出し下・両店舗 | DSC04474.jpg | `tamachi-concept-counseling.webp` |
| 理由1・両店舗 | DSC04586.jpg | `tamachi-reason01-counseling.webp` |
| 理由2・両店舗 | DSC04762.jpg | `tamachi-reason02-reformer.webp` |
| 理由3・両店舗 | DSC04780.jpg | `tamachi-reason03-posture.webp` |
| 理由4・両店舗 | DSC04853.jpg | `tamachi-reason04-personal-support.webp` |
| 理由5・両店舗 | DSC04479.jpg | `tamachi-reason05-communication.webp` |
| 田町FV・徒歩分数更新版 | 既存FVを画像生成で文字修正 | `fv-tamachi-pilates-access.webp` |
| 神田FV | 既存素材 | `fv-kanda-pilates-reformer.webp` |
| 共通オファーバナー | 既存生成素材 | `kanda-trial-plus-bonus-transparent.webp` |

- 上記撮影写真は長辺1200px・WebP品質85で変換。元ファイルは削除していません。別PCには元素材がない可能性がありますが、設置WebPはGitに含まれます。
- FVとオファーの文字は画像に焼き込まれています。HTMLだけ直しても画像内の文字は変わりません。
- 共通バナーはファイル名にkandaが入っていても田町も参照します。片店舗だけ直す場合は別名画像を作り、参照先を限定してください。
- 透過はバナーデザインの外側のみ。バナー内側のアイボリー背景は残してください。
- 理由1の写真はPCでのカウンセリングです。「自律神経測定中」と断定するaltにはしないでください。
- 画像生成では人物の肌に不自然な模様、線、ノイズ、まだら、シミ状のテクスチャを入れないこと。肌と顔は清潔感のある自然な写真風を保ちます。

## 比較用の技術仕様と本番化の注意

- `resole/compare-scroll.js` と比較ページのpostMessageで同時スクロールします。子ページは埋め込み時かつ `?compare=scroll` の場合だけ動作します。
- 確認用HTMLには `<base href="../">` があり、画像やスクリプトを `resole/` 起点で読み込みます。検査ツールもbaseを考慮する必要があります。
- 注意: `href="#shop"` などの相対アンカーもbaseの影響を受けます。単独表示のサイドメニューは別URLへ移動する可能性があり、未修正です。アンカーの存在確認だけで動作確認済みとしないでください。
- 確認用は `noindex,nofollow`。GTM本体・noscript・外部LP計測スクリプトは読み込まない構成です。田町にはGTM IDの設定値だけ残っていますが、それだけでタグは動きません。
- 本番側の既存GTM IDは `GTM-KCVRX5PF`。本番化時は既存タグと店舗別計測設定を保持し、確認用HTMLを丸ごと上書きしないでください。
- 本番へ移す場合はbase・robots・計測・パス・CTAを個別に確認し、必要な変更だけを適用します。本番でのモバイル/PC表示と計測確認は別途必要です。
- HTMLはUTF-8です。PowerShellで読む場合は `Get-Content -Encoding UTF8`。既定エンコーディングでの読み書きや一括置換は文字化けの原因になります。

## Gitと公開手順

リポジトリ: https://github.com/designdecathlete-stack/dec-site

- 公開設定は `netlify.toml`。`npm run build` が `scripts/build-site.mjs` を実行し、`dist` を公開します。`resole/` はコピー対象です。この資料は `docs/` に置き、現行ビルドでは公開対象外です。
- 2026-11-10時点の元の作業PCは変更・未追跡ファイルが多数あります。本番HTML2件と `site-map/README.md` も変更済みのままです。今回の比較用公開とは別なので取り消したり一括ステージしたりしないでください。
- 同PCのローカルmainとorigin/mainは分岐しています。過去の公開で同じ変更を別worktreeからcherry-pickした履歴があるためです。`git pull`、force push、resetで安易にそろえないでください。
- 新しい作業者はクリーンなorigin/mainから `codex/` 接頭辞の作業ブランチを作るのが基本です。既存PCで続ける場合はfetch後、対象差分を確認し、origin/main起点の別worktreeへ対象コミットだけcherry-pickして公開する方式を使ってきました。重複適用や競合がないか確認します。
- `git add .` は使わず、対象HTML・参照画像・関連スクリプト・資料だけを明示的にステージします。`git diff --cached --check` と差分一覧を確認します。
- mainへのpush前に公開範囲の依頼を確認します。比較用公開で通常LPや本番ピラティスLPを含めないでください。
- push成功は公開完了ではありません。Netlify反映後の実URLでHTMLと画像が更新されたことを確認します。反映待ち・失敗を公開済みと報告しないでください。
- 一時worktreeは作業終了後にクリーンなことを確認して削除し、元の未コミット変更を保持します。

## 修正後チェック

1. 対象店舗・通常/ピラティス・確認用/本番を再確認する。
2. PCとスマートフォン幅で、文字・写真の切れや重なり、固定CTAの表示を確認する。
3. 店舗別CTA全6か所を確認する。コピー時の別店舗リンク残りに注意する。
4. FV画像内の駅・徒歩分数、本文の住所・地図・料金・オファーを照合する。
5. 画像とスクリプトの参照先、ページ内アンカーの実動作、同時スクロールを確認する。
6. 公開範囲だけをコミット・pushし、公開URLで再確認する。
7. 依頼者に確認用URL、本番反映の有無、未確認事項を分けて伝える。

本番公開前の要確認: 無料特典の条件、口コミ全体の出典表示、神田での田町撮影素材の暫定使用、アンカー実動作、LINE登録後の配信・流入計測。
