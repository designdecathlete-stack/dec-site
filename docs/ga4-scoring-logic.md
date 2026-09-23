# GA4 scoring logic

このファイルは、GTMイベントが入る前でもGA4標準指標だけでLP状態を判断するためのスコアリングノウハウを管理する。クライアントと一緒に育てる前提で、閾値、重み、GTM導入後の差し替え指標をここに追記していく。

実装上の現在の呼び出し元は `AILP/front/public/app.js` の `standardGa4Scores()`。このmdは、画面表示ロジックとAI提案ロジックを育てるための原本として扱う。

## 目的

GTMが未設定でも、GA4の標準取得項目から最低限のLP診断を本番運用できるようにする。

現段階で使う標準指標:

- sessions
- total_users
- screen_page_views
- conversions
- event_count
- engagement_rate
- source_medium

GTM導入後に追加する指標:

- CTAクリック
- LINEクリック
- Hot Pepperクリック
- 電話クリック
- Google Mapクリック
- 予約意向クリック
- 25% / 50% / 75% / 90% スクロール到達

## 現段階の3スコア

### Interest Score

ユーザーがLP冒頭に興味を持てているかを見る。GTM前は `engagement_rate` を中心に、補助として `PV/User` を使う。

現在の重み:

- engagement_rate: 70%
- PV/User: 30%

目安:

| engagement_rate | 評価 |
| --- | --- |
| 60%以上 | 高い |
| 45%以上 | 良い |
| 25%以上 | 注意 |
| 10%以上 | 低い |
| 1%以上 | 要確認 |

補助指標として、PV/User が高いほど興味スコアを少し上げる。ただし、PV/Userだけで高評価にはしない。

### Read Proxy Score

GTM前は正確なスクロール深度が取れないため、`screen_page_views / total_users` を読了の代替指標として使う。

これはあくまで代替指標であり、GTM導入後はスクロール到達率へ差し替える。

目安:

| PV/User | 評価 |
| --- | --- |
| 2.5以上 | 高い |
| 1.8以上 | 良い |
| 1.3以上 | 注意 |
| 1.0以上 | 低い |
| 0.5以上 | 要確認 |

### Action Score

ユーザーが目的行動に進んでいるかを見る。GTM前はGA4標準の `conversions / sessions` を使う。

目安:

| CVR | 評価 |
| --- | --- |
| 5%以上 | 高い |
| 3%以上 | 良い |
| 1%以上 | 注意 |
| 0.1%以上 | 低い |
| 0% | 要確認 |

CVが0の場合は、LP改善だけでなく、コンバージョン設定の確認を必ず提案に含める。

## LPヘルススコア

総合スコアは、GTM前の暫定値として以下の重みで出す。

- Interest Score: 35%
- Read Proxy Score: 25%
- Action Score: 40%

理由:

- LPは最終的に行動が重要なのでActionを重めにする。
- ただしGTM前はActionの精度が低いため、InterestとRead Proxyも合わせて見る。
- スコアは絶対評価ではなく、改善優先度を決めるための判断材料とする。

## 診断文の出し方

- Action Score が低い場合: 行動改善と計測確認を優先
- Interest Score が低い場合: ファーストビュー改善を優先
- Read Proxy Score が低い場合: 読み進めやすさを改善
- 全体が一定以上の場合: 小さく検証しながら改善

## GTM導入後の差し替え方

GTMが入ったら、以下のようにスコアを更新する。

### Interest Score

- engagement_rate
- 25%スクロール到達率
- ファーストビューCTAクリック率

### Read Score

- 50%スクロール到達率
- 75%スクロール到達率
- 90%スクロール到達率
- 中盤CTAクリック率

### Action Score

- CTAクリック率
- LINEクリック率
- Hot Pepperクリック率
- 電話クリック率
- 予約意向クリック率
- conversions

GTM導入後は、`Read Proxy Score` という名前を `Read Score` に変えてよい。

## 注意点

- GA4標準の `conversions` が0でも、実際に予約がないとは限らない。計測設定の不備を疑う。
- `engagement_rate` が低い場合、ページ内容の問題だけでなく、広告流入の質や流入元とのズレも見る。
- `source_medium` が `(not set)` や `(data not available)` に偏る場合、UTMや広告連携も確認する。
- PV/Userは読了の代替であり、スクロール深度そのものではない。
- スコアだけで修正を決めず、必ずLPのHTML/CSSと照合する。
