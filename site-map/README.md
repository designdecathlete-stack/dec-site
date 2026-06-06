# dec-site map

dec-site のクライアントサイト、公開URL、ローカルパスを確認するための索引ページです。
各HTMLの `<head>` にGTMタグがあるかもページ単位で確認できます。

- ローカル: `http://127.0.0.1:4174/site-map/`
- 公開後: `https://dec-site.netlify.app/site-map/`
- 初期パスワード: `decsite`

## 更新

クライアントディレクトリやHTMLを追加・変更したら、リポジトリ直下で実行します。

```powershell
node tools/generate-site-map.mjs
```

生成されるファイル:

- `site-map/data.js`

## パスワード変更

`site-map/index.html` の `PASSWORD_HASH` を変更します。

```powershell
node -e "crypto=require('crypto'); console.log(crypto.createHash('sha256').update('新しいパスワード').digest('hex'))"
```
