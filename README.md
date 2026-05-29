# AirShare

AirShare は、iPhone と Windows の間でファイルとメッセージを共有するブラウザアプリです。

動作方式は 2 つあります。

- ローカル Wi-Fi 版: Windows 側で `airshare-server.js` を起動し、同じ Wi-Fi 内の端末で共有する
- インターネット版: Cloudflare Worker バックエンドを公開し、離れた場所の端末同士で共有する

## ローカル Wi-Fi 版

Windows 側でこのフォルダを開き、以下を実行します。

```powershell
node airshare-server.js
```

起動すると、次のような URL が表示されます。

```text
AirShare local: http://127.0.0.1:4173/index.html
AirShare phone: http://192.168.x.x:4173/index.html
```

Windows では `AirShare local` を開きます。スマートフォンは、アプリ内の QR コード、または `AirShare phone` の URL から参加します。

## インターネット版

インターネット版では以下を使います。

- GitHub Pages: 静的フロントエンド
- Cloudflare Workers: 公開 API
- Cloudflare D1: ルーム、チャット、参加者、ファイル情報
- Cloudflare R2: ファイル本体

これにより、同じ Wi-Fi にいない端末同士でも、QR コードやリンクから同じルームへ参加できます。

### 1. Cloudflare リソースを作成

Wrangler を使って D1 データベースと R2 バケットを作成します。

```powershell
npx wrangler d1 create airshare
npx wrangler r2 bucket create airshare-files
```

`worker/wrangler.example.toml` を `worker/wrangler.toml` にコピーし、作成時に表示された D1 の `database_id` を入れます。

```toml
name = "airshare-api"
main = "worker.js"
compatibility_date = "2026-05-28"

[[d1_databases]]
binding = "DB"
database_name = "airshare"
database_id = "replace-with-your-d1-database-id"

[[r2_buckets]]
binding = "FILES"
bucket_name = "airshare-files"
```

テーブルを作成します。

```powershell
npx wrangler d1 execute airshare --remote --file worker/schema.sql
```

Worker をデプロイします。

```powershell
cd worker
npx wrangler deploy
```

### 2. フロントエンドを Worker に接続

`js/config.js` を編集し、デプロイした Worker の URL を設定します。

```js
window.AIRSHARE_API_URL = "https://airshare-api.your-subdomain.workers.dev";
```

その後、変更を commit / push すると GitHub Pages 側から公開 API に接続できます。

## 現在の制限

- ファイル上限は 1 ファイル 50MB です。
- ルームはルーム ID を知っている人が参加できる簡易共有スペースです。
- 参加者表示は約 15 秒間通信がないと非アクティブ扱いになります。
- ファイルとメッセージは、ルームに再アクセスされたタイミングで約 24 時間後に削除対象になります。

## 注意

- QR コード自体がファイルを送っているわけではありません。QR はルーム URL を渡すためのものです。
- 離れた場所の端末同士で共有するには、必ず公開された中継バックエンドが必要です。このプロジェクトでは Cloudflare Worker がその役割です。
- `worker/wrangler.toml` には Cloudflare アカウント固有の ID が入るため、公開したくない場合は commit しないでください。

## 構成

- `index.html`: アプリ本体
- `css/style.css`: UI
- `js/app.js`: ルーム、ファイル、チャット、QR、同期処理
- `airshare-server.js`: ローカル Wi-Fi 版サーバー
- `worker/worker.js`: Cloudflare Workers 用の公開 API
- `worker/schema.sql`: D1 データベース定義
- `vendor/jsQR.js`: QR 読み取り
- `vendor/qrcode.js`: QR 生成
