# AirShare

iPhone と Windows 11 の間で、AirDrop 風にファイルとメッセージを共有する Web アプリです。

公開ページ: https://yokatopia0820.github.io/airshare/

## 重要: 端末間同期について

GitHub Pages は静的ホスティングなので、ページ単体では別端末間のデータ同期はできません。

AirShare で実際に Windows とスマートフォン間のやり取りを反映するには、別途同期 API が必要です。現在のフロントエンドは `window.AIRSHARE_API_URL` に API URL が設定されていない場合、画面上に「同期サーバー未設定」と表示し、ファイル送信やチャットを成功扱いにしないようにしています。

## 構成

- `index.html`: アプリ本体
- `css/style.css`: ダーク / ライト対応 UI
- `js/config.js`: 同期 API URL 設定
- `js/app.js`: ルーム作成、QR、ファイル共有、チャット
- `worker/worker.js`: Cloudflare Workers + D1 用の最小 API
- `worker/schema.sql`: D1 テーブル定義
- `worker/wrangler.example.toml`: Wrangler 設定テンプレート

## ローカル確認

```powershell
node dev-server.js
```

ブラウザで `http://127.0.0.1:4173/index.html` を開きます。

## 同期 API の接続

`js/config.js` にデプロイ済み API URL を設定します。

```js
window.AIRSHARE_API_URL = "https://your-worker.your-subdomain.workers.dev";
```

または、一時的に URL パラメータでも設定できます。

```text
https://yokatopia0820.github.io/airshare/?api=https%3A%2F%2Fyour-worker.example.workers.dev
```

この場合、QR 共有リンクにも `api` パラメータが引き継がれます。

## Cloudflare Workers + D1 の注意

`worker/worker.js` は小さなデータで同期の流れを確認するための最小 API です。

D1 は大きなファイル本体の保管に向きません。50MB 級のファイルを扱う本番版では、ファイル本体は Cloudflare R2 などのオブジェクトストレージに置き、D1 にはメタデータだけを保存する構成にしてください。
