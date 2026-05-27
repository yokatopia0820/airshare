# AirShare

iPhone と Windows 11 の間で、AirDrop 風にファイルとメッセージを共有する Web アプリです。

## 構成

- `index.html`: アプリ本体
- `css/style.css`: ダーク / ライト対応 UI
- `js/app.js`: ルーム作成、QR、ファイル共有、チャット
- `worker/worker.js`: Cloudflare Workers + D1 用の最小 API
- `worker/schema.sql`: D1 テーブル定義

## ローカル確認

静的ファイルだけで起動できます。

```powershell
py -m http.server 4173
```

ブラウザで `http://localhost:4173/index.html` を開きます。

## バックエンド接続

GitHub Pages だけでは、別デバイス間で永続的にファイルやチャットを同期できません。実運用では Cloudflare Workers + D1 などの API を接続してください。

1. Cloudflare D1 に `worker/schema.sql` を適用
2. `worker/worker.js` を Workers にデプロイ
3. `js/config.example.js` を参考に `window.AIRSHARE_API_URL` を設定
4. `index.html` で `js/app.js` より前に `js/config.js` を読み込み

## GitHub Pages

リポジトリを GitHub に push したあと、Settings → Pages で `main` / root を公開元に指定します。
