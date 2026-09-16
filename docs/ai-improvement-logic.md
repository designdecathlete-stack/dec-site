# AILP AI improvement logic

AILPの改善案ロジックとHTML反映ノウハウは、クライアントと一緒に育てる運用資産として管理する。

現在は役割ごとに以下の2ファイルへ分けている。

- [ai-proposal-prompt.md](./ai-proposal-prompt.md)
  - GA4と現在のHTML/CSSから改善案を提案するための判断ルール
  - マクロ修正とミクロ修正の分類
  - 提案JSONの出力形式
- [ai-html-edit-prompt.md](./ai-html-edit-prompt.md)
  - 改善案をdraft HTML/CSSへ反映するための編集ルール
  - hero / CTA の置換方針
  - CSS調整ルール
  - before / afterログの残し方

実装上の現在の呼び出し元は以下。

- `VPS/src/worker/openai.js`
  - `createImprovementProposal()`
  - `createDraftChangePlan()`
- `VPS/src/worker/git.js`
  - `applyTargetedHtmlEdits()`

mdを更新しただけでは実プロンプトやHTML編集処理は変わらない。運用ノウハウを実装へ反映する場合は、上記のworker側コードも更新する。
