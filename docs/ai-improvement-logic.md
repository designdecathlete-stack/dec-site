# AILP AI improvement logic

AILPの改善案ロジックは、クライアントと一緒に育てる運用ノウハウとしてこのファイルで管理する。VPS workerのAIプロンプトは、この考え方に沿って改善案を作る。

## 目的

AIは単なる文章生成ではなく、GA4の実績と現在のLPのHTML/CSSを見て、実際に成果改善につながる修正案を出す。提案はそのまま公開せず、draft側へ反映して確認する。本番LPとmainへの反映は別フローにする。

## 入力

AIに渡す入力はLP単位に限定する。他のLP、他クライアント、秘密情報、VPS内の不要ファイルは渡さない。

- LP概要
  - クライアント名
  - LP名
  - folder_path
  - public_url
  - GA4 page path
- GA4データ
  - 直近30日サマリ
  - 直近90日の合計
  - 流入 source / medium
  - sessions
  - users
  - page views
  - conversions
  - conversion rate
  - engagement rate
- 現在のLP構造
  - `index.html` のテキスト構造
  - 主要CTA文言
  - section id / class
  - 見出し
  - CTAリンクの数と位置
- CSSの状態
  - CTA、hero、section、responsiveに関係するCSS
  - 既存デザインのトーン

## 改善案生成の基本姿勢

AIはプロのマーケターとして判断する。デザインや文章の好みではなく、数値から見える課題とLP上の該当箇所を結びつけて提案する。

良い提案の条件:

- GA4の事実と結びついている
- 現在のHTML上のどこを変えるかが明確
- 実装範囲が現実的
- 1回のdraftで確認できる
- 本番公開前に良し悪しを判断できる
- 既存ブランド、トーン、導線を壊さない

悪い提案の例:

- 「CVRを改善しましょう」だけで具体箇所がない
- LP全体を作り直す前提になっている
- GA4から読み取れない断定をする
- 実装コストが大きすぎる
- デザイン思想を無視して派手な表現だけ足す
- GTMや計測未整備が原因なのにコピーだけ変える

## 改善判断の流れ

### 1. GA4から課題を分類する

まず数値を見て、課題を大きく分類する。

- 流入不足
  - sessionsが少ない
  - 広告・SNS・検索など流入チャネルの問題が強い
  - LP内改善だけで判断しすぎない
- 興味不足
  - engagement rateが低い
  - page viewsや滞在が弱い
  - ファーストビュー、訴求、対象者の明確さを疑う
- 読了不足
  - 中盤以降で離脱している可能性が高い
  - 長さ、順序、証拠、比較、料金前の納得材料を疑う
- 行動不足
  - 読まれているがconversionが弱い
  - CTA文言、CTA位置、予約前不安、オファー、フォーム導線を疑う
- 計測不備
  - conversionsが0または不自然
  - フォーム、LINE、電話、Hot Pepperなどのイベント設計を確認する

### 2. 現HTML/CSSから該当箇所を探す

GA4の課題を、HTML上の具体箇所に落とす。

見る場所:

- hero / first view
- CTAボタンとそのリンク
- 悩み訴求
- ベネフィット
- 実績・権威性
- before after
- 口コミ
- 比較表
- 料金
- FAQ
- 最後のCTA

判断例:

- CVが弱いのにCTAが下部中心なら、上部・中盤CTAを検討する
- engagementが低いなら、hero見出しと冒頭の対象者訴求を優先する
- 読了はあるがCVが弱いなら、料金前後と最後の不安解消を優先する
- クリックイベントがないなら、LP改善より計測確認を優先提案に含める

### 3. 変更案を優先順位付けする

1回のdraftでは最大3〜5件に絞る。多すぎると検証不能になる。

優先度の考え方:

1. CV導線の明確化
2. ファーストビュー訴求
3. CTA直前の不安解消
4. 比較・選ばれる理由
5. 料金・オファーの見せ方
6. 計測不備の確認

## 提案の自己レビュー

最初の提案をそのまま採用しない。必ずもう一度見直す。

レビュー観点:

- 限定的すぎないか
  - ボタン文言だけ、色だけ、1箇所だけの変更で終わっていないか
- 広すぎないか
  - LP全面改修や新LP制作になっていないか
- 現実的か
  - 今あるHTML/CSSでdraft反映できるか
- 検証可能か
  - 変更後にGA4で良し悪しを判断できるか
- 数値と対応しているか
  - GA4の事実から離れていないか
- 計測不備を無視していないか
  - CVが0の場合、まず計測確認も入れる
- 既存トーンを壊さないか
  - クライアントのブランドやLPの雰囲気に合っているか

レビュー後、採用する提案には `approved_for_draft=true` を付ける。落とした提案には理由を残す。

## 出力フォーマット

AI提案は、後続のdraft反映で使いやすいように構造化する。

```json
{
  "score": 0,
  "summary": "短い総評",
  "diagnosis": {
    "primary_issue": "traffic|interest|read|action|measurement",
    "reason": "GA4とHTMLから見た理由"
  },
  "findings": [
    {
      "title": "発見",
      "body": "数値とHTML上の根拠",
      "evidence": ["GA4の根拠", "HTML/CSSの根拠"]
    }
  ],
  "recommendations": [
    {
      "title": "改善案",
      "body": "具体的な変更内容",
      "priority": "high|medium|low",
      "target_area": "hero|cta|offer|proof|faq|measurement|other",
      "target_selector_or_text": "変更対象のsection/class/text",
      "expected_effect": "期待する効果",
      "implementation_scope": "small|medium|large",
      "approved_for_draft": true,
      "review_note": "自己レビュー結果"
    }
  ],
  "rejected_ideas": [
    {
      "title": "見送った案",
      "reason": "限定的すぎる、広すぎる、計測不能など"
    }
  ]
}
```

## draft反映ルール

当面のdraft反映は安全側で行う。

- `/marr/` など本番フォルダは触らない
- `main` への本番反映はしない
- `ailp-previews/{lp-folder}/{draft}` のみ更新する
- AIが変更した箇所と理由をログに残す
- 変更は1回のdraftで確認できる量に抑える
- 迷う場合は「提案のみ」に留め、HTML直接変更しない

## HTML直接反映ルール

AI提案の `target_area` と `target_selector_or_text` は、draft HTMLに反映するための編集指示として扱う。ただし、AIの文章を無制限に既存HTMLへ流し込まない。最初の実装では、既存LPの構造を壊しにくい差し込み型の編集を基本にする。

直接反映する対象:

- `hero`
  - ファーストビュー直後に改善ブロックを差し込む
  - 誰向けか、何が得られるか、予約前の不安解消を短く補強する
- `cta`
  - 上部CTA付近に補足ブロックを差し込む
  - LINE相談、無料相談、予約前確認など、行動前の心理的ハードルを下げる
  - CTA文言は安全な文言だけ置換する
- `offer`
  - 比較・料金・提案セクション付近に補足ブロックを差し込む
- `proof`
  - 実績、理由、口コミ、選ばれる理由の付近に補足ブロックを差し込む
- `faq`
  - FAQ付近に不安解消の補足を差し込む

直接反映しない対象:

- `measurement`
  - 計測不備はHTML改修ではなく、GTM/GA4設定確認として残す
- 既存HTML構造を大きく壊す変更
- フォーム、外部予約、LINE URLなどのリンク先変更
- 事実確認が必要な実績、数値、口コミの追加
- ブランドトーンを大きく変える表現

CTA文言置換の安全条件:

- 「プレビュー」「draft」「改善案」など確認用の文言はCTAに使わない
- 事実確認が必要な「No.1」「実績多数」などは使わない
- 既存リンク先は変更しない
- CTA文言を変える場合も、既存のLINE/予約導線の意味から外れない

反映ログ:

- 直接差し込んだ編集は `lp_job_artifacts.metadata.applied_edits` に残す
- job stepにも `applied_edits` を残す
- `direct_html_edit_enabled=true` をartifact metadataに残す
- 本番フォルダを触っていないことを `main_unchanged` / `production_unchanged` に残す

## 今後育てる項目

- 業種別の勝ちパターン
- CTA文言テンプレート
- FV診断ルール
- 料金・オファー改善ルール
- 口コミ・実績の見せ方
- LINE / Hot Pepper / 電話の導線ルール
- GA4イベント設計との連動
- クライアントレビューで採用・不採用になった理由
