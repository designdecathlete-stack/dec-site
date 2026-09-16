# AILP AI HTML edit prompt

このファイルは、AI改善案をdraft HTML/CSSへ反映するための指示プロンプト・編集ノウハウを管理する。クライアントと一緒に育てる前提で、HTML置換ルール、CSS調整ルール、差し込みに戻す条件、変更ログの残し方をここに追記していく。

実装上の現在の呼び出し元は `VPS/src/worker/openai.js` の `createDraftChangePlan()` と、`VPS/src/worker/git.js` の `applyTargetedHtmlEdits()`。このmdは、そのプロンプトとHTML編集処理を育てるための原本として扱う。

## 目的

AI提案を、既存LPのデザインと導線を壊さずにdraft HTMLへ反映する。反映は本番LPではなく `ailp-previews/{lp-folder}/{draft}` に対して行う。

このアプリの本質は、AIが「どこを直すべきか」を判断し、既存LPのHTML/CSSに自然な形で落とすことにある。差し込み型だけでは改善案の確認はできるが、実LPとしての完成度は上がりにくい。置換できる箇所は置換し、置換が危険な箇所だけ差し込みに戻す。

## 入力

HTML/CSS反映AIに渡す入力はLP単位に限定する。他のLP、他クライアント、秘密情報、VPS内の不要ファイルは渡さない。

- LP概要
- 最新AI分析結果
- 管理画面で保存された改善案
- route
  - `macro`
  - `micro`
  - `measurement`
- 現在のLP source context
  - section id / class
  - headings
  - links
  - CTA文言
  - CSS抜粋
  - text sample

## マクロ修正とミクロ修正のHTML反映方針

### マクロ修正: 別LPを新規制作

マクロ修正は、本来は別LPとして訴求軸・ターゲット・コンセプト・オファーを変えて検証する。ただし現段階では、本番 `/marr/` などへ直接反映せず、draft preview上で別訴求の方向性を確認する。

マクロ修正でHTMLへ反映するもの:

- hero内の新しい約束
- 誰向けか
- 選ばれる理由
- 差別化の補足
- 価格価値・オファーの見せ方
- CTA前の心理的不安の低減

マクロ修正で避けるもの:

- 本番LPフォルダの上書き
- URL構成の変更
- 外部リンクの変更
- 事実確認が必要な実績・口コミ・No.1表現の追加
- LP全体の無制限な作り替え

### ミクロ修正: 現LPを細かく改善

ミクロ修正は、既存LPの構造とデザインを維持しながら、テキスト・CTA・不安解消・情報順を改善する。

ミクロ修正でHTMLへ反映するもの:

- hero見出しとリード文の置換
- CTA文言の置換
- CTA周辺の補足文追加
- FAQの補強
- 比較・選ばれる理由の補足
- 料金・オファー前後の説明補強

ミクロ修正で避けるもの:

- 大きなレイアウト変更
- セクションの大幅な並び替え
- ブランドトーンの変更
- 画像や外部リンクの差し替え
- 計測不備をHTML改善で解決した扱いにすること

## draft反映ルール

当面のdraft反映は安全側で行う。

- `/marr/` など本番フォルダは触らない
- `main` への本番反映はしない
- `ailp-previews/{lp-folder}/{draft}` のみ更新する
- AIが変更した箇所と理由をログに残す
- 変更は1回のdraftで確認できる量に抑える
- 迷う場合は「提案のみ」に留め、HTML直接変更しない

UI確認用に `publish_preview_folder=true` の場合だけ、生成済みの `ailp-previews/...` フォルダをmainへ置く。この場合も本番LPフォルダは触らない。

## 出力フォーマット

HTML/CSS反映AIは、後続の編集処理が使いやすいように構造化したJSONを返す。

```json
{
  "headline": "draft全体の見出し",
  "lead": "draft全体のリード文",
  "route": "macro|micro|measurement",
  "changes": [
    {
      "title": "変更タイトル",
      "body": "実際にHTMLへ入れる文言、または編集方針",
      "target_area": "hero|cta|offer|proof|faq|measurement|other",
      "target_selector_or_text": "section/class/text",
      "edit_intent": "replace_copy|add_cta|add_section|reorder|measurement_check|other",
      "css_intent": "keep|minor_adjust|new_helper_class",
      "risk_note": "デザインや事実確認上の注意"
    }
  ],
  "cta_label": "安全なCTA文言",
  "self_review_summary": "現実的で検証可能な理由"
}
```

## HTML置換ルール

置換を優先する箇所:

- `hero`
  - `#top` セクション内の最初の `h1` / `h2`
  - 直後のリード文 `p`
  - 画像中心heroの場合は、hero内に短い補足コピーを重ねる
  - 目的は「誰向けか」「どんな変化を約束するか」「選ばれる理由」を短く伝えること
- `cta`
  - LINE / 相談 / 予約系CTAのボタン文言
  - CTA直後または周辺の補足文
  - 目的は「予約前に何ができるか」「相談から始められるか」を伝えて心理的ハードルを下げること

現在の実装で使う編集type:

- `replace_copy`
  - h1/h2やリード文を直接置換した場合
- `replace_hero_overlay`
  - 画像中心heroに補足コピーを追加した場合
- `replace_cta_copy`
  - CTA文言またはCTA周辺コピーを置換した場合
- `direct_block`
  - 置換できず、安全な補足ブロックを差し込んだ場合
- `direct_block_unplaced`
  - 置換も差し込みもできなかった場合

## CSS調整ルール

CSSは既存デザインを壊さない範囲に限定する。

許可するCSS:

- 補足コピー用の小さなhelper class
- 既存色・余白・フォントに合わせた微調整
- mobileで読めるサイズ調整
- draft確認用の最低限の装飾

現在使っているhelper class:

- `.ailp-hero-copy`
  - 画像中心heroに短いコピーを重ねる
- `.ailp-cta-support`
  - CTA直後の補足文
- `.ailp-direct-edit`
  - 置換できない場合の補足ブロック

避けるCSS:

- グローバルなbodyや全sectionへの大きな変更
- 既存CTA色の大幅変更
- レイアウト全体の組み替え
- 画像サイズや外部予約導線を壊す変更
- 既存LPのブランドトーンと合わない装飾

## 差し込みに戻す条件

- 対象セクションが見つからない
- 既存HTMLが画像中心で、見出しやテキストの置換先がない
- AI文言が長すぎる
- 「draft」「プレビュー」「改善案」など確認用の言葉が入っている
- 実績、No.1、口コミ、価格など事実確認が必要な内容を新規に言い切っている
- 置換すると既存デザインの意図や導線が崩れる

画像中心heroの場合は、完全な差し込みブロックではなく、hero内に `.ailp-hero-copy` を追加する。これも既存画像の意味を壊す場合は差し込みに戻す。

## CTA文言置換の安全条件

- 「プレビュー」「draft」「改善案」など確認用の文言はCTAに使わない
- 事実確認が必要な「No.1」「実績多数」などは使わない
- 既存リンク先は変更しない
- CTA文言を変える場合も、既存のLINE/予約導線の意味から外れない
- Hot PepperとLINEの役割を混同しない

## 変更ログ

反映ログは `lp_job_artifacts.metadata.applied_edits` に残す。

置換した場合:

- `type`
- `target_area`
- `target_section`
- `title`
- `before`
- `after`

差し込んだ場合:

- `type=direct_block`
- `target_area`
- `target_section`
- `title`
- `before=(new inserted block)`
- `after=追加した文言`

本番に触っていない証跡:

- `main_unchanged=true`
- `production_unchanged=true`
- `direct_html_edit_enabled=true`

## Before / After preview

現在できていること:

- 元LP URLを開く
- draft preview URLを開く
- `applied_edits.before` / `applied_edits.after` を保存する

次に作るべき表示:

- Before iframe: 現在の本番LP
- After iframe: draft preview
- 変更前後テキスト一覧
- `replace_copy` / `replace_cta_copy` / `direct_block` の種別表示

## 実プロンプトへ反映するときの注意

このmdを更新しただけでは、AIへの実プロンプトやHTML編集処理は変わらない。実装へ反映する場合は以下を更新する。

- `VPS/src/worker/openai.js`
  - `createDraftChangePlan()`
- `VPS/src/worker/git.js`
  - `applyTargetedHtmlEdits()`

更新時は、以下を守る。

- LP単位の情報だけを使う
- 外部リンクを勝手に変えない
- 本番フォルダを触らない
- 変更前後を必ずログに残す
- 置換できない場合は安全に差し込みへ戻す
