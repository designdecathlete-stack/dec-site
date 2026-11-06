LPスキルセット v1.0.1 / 2026-11-06

最初に START.html を開いてください。

■ 収録した4スキル
1. mobile-first-lp-template：スマホ中心のLPテンプレート
2. lp-template-copy-design：原稿流し込み・配色・デザインシート出力
3. lp-design-final-polish：制作済みLPの仕上げ
4. lp-quality-checker：静的検査・目視確認の手順

■ 導入（プロジェクト単位）
ZIPを展開し、skills/ 内の4つのフォルダを、制作プロジェクトの .agents/skills/ にコピーしてください。
例：制作プロジェクト/.agents/skills/lp-template-copy-design/SKILL.md
同名スキルがある場合は先に差分を確認し、既存版をバックアップしてから更新してください。
このZIPを展開しただけでは、スキルの導入は行われません。
導入後はCodexでスキル名を指定し、利用できることを確認してください。
公式の配置先案内：https://developers.openai.com/api/reference/cli

■ 最初の依頼文
lp-template-copy-design を使ってLPを作ってください。
原稿：［ファイル］
テンプレート：［フォルダ］
出力先：［フォルダ］
配色・雰囲気：［希望。未定部分はおまかせ］
写真：［フォルダ］
予約URL：［URL／未設定］
原稿・価格・条件を保ち、不明な情報を追加しないでください。
スマホ・PCの実画面を確認し、デザインシート画像・HTML・設定JSONも出力してください。

■ テンプレート
skills/mobile-first-lp-template/assets/template/ を案件用フォルダへ複製します。
元のテンプレートは直接書き換えず、完成原稿を流し込んで使います。

■ 検査スクリプト
Python 3の標準ライブラリだけを使用します。
この展開フォルダを作業ディレクトリにして実行：
python skills/lp-quality-checker/scripts/check_static_lp.py "対象LPのフォルダ"
静的検査だけでは、実画面の表示や予約動作を保証できません。
ブラウザでスマホ・PCの表示、FAQ、CTAなども確認してください。

■ 必要な環境・補足
HTML/CSS/JavaScriptを編集できる環境と、ブラウザ表示を確認・撮影できる環境が必要です。
デザインシートPNGはブラウザから書き出します。画像生成やデプロイのサービス・認証は同梱しません。
原本のSKILL.md内にある C:\Users\kanat や .codex/skills 等のパスは、配布元の例です。
利用先では実際に導入したスキルのパスに読み替えます。
mobile-first-lp-template内のfrontend design skillの併用案内は、その追加スキルを同梱している意味ではありません。
4つの収録スキル以外の追加スキル・外部サービスはこのパッケージに含みません。
スキル本体は配布元から内容を変更せず収録しています。

■ 守る条件
提供原稿・価格・条件・使用写真を維持。口コミや実績を捏造しない。
人物生成時は自然で滑らかな清潔感のある肌とし、不自然な模様・線・ノイズ・まだら・シミ状のテクスチャを入れない。
見本の架空店舗情報や予約URLを、本番の情報として使わない。
公開先・公開フォルダを確認し、公開依頼がある場合に公開する。

■ 同梱資料
manual/lp-skill-manual.html：依頼文・制作フロー・GitHubとNetlifyの説明
manual/design-sheet.txt：デザイン希望の記入シート
manual/sample-copy/：架空サロンの練習用原稿
manual/lume-eyelash-photo-sample/：LPとデザインシートの見本
MANIFEST.json：全収録ファイルのサイズとSHA-256
