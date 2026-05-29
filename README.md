# AirShare

iPhone と Windows 11 の間で、同じ Wi-Fi 内から QR 参加してファイルとメッセージを共有する Web アプリです。

## いまの実装方針

AirShare は Windows 側で小さなローカルサーバーを起動し、スマートフォンが QR コードからそのサーバーへアクセスする方式です。

この方式にした理由:

- GitHub Pages だけでは端末間の状態共有ができない
- QR コードだけでは通信路そのものにはならない
- Cloudflare / Firebase などの外部ログインや課金設定なしで動かせる
- 同じ Wi-Fi 内なら、Windows とスマートフォン間で最短に動作確認できる

## 起動方法

Windows 側でこのフォルダを開き、以下を実行します。

```powershell
node airshare-server.js
```

起動すると、次のようなURLが表示されます。

```text
AirShare local: http://127.0.0.1:4173/index.html
AirShare phone: http://192.168.x.x:4173/index.html
```

Windowsでは `AirShare local` を開きます。スマートフォンは、アプリ内のQRコード、または `AirShare phone` のURLから参加します。

## 使い方

1. Windows 側で `node airshare-server.js` を起動
2. Windows ブラウザで `http://127.0.0.1:4173/index.html` を開く
3. 「QRコードを発行する」を押す
4. スマートフォンでQRコードを読み取る
5. 同じルームに入ったら、ファイルやメッセージを共有する

## 注意

- Windows とスマートフォンは同じ Wi-Fi に接続してください。
- Windows Defender ファイアウォールで Node.js の通信許可が必要な場合があります。
- 現在のファイル保存はメモリ上です。サーバーを終了すると共有中のファイルとメッセージは消えます。
- 50MBまでのファイルを想定しています。

## 構成

- `index.html`: アプリ本体
- `css/style.css`: UI
- `js/app.js`: ルーム、ファイル、チャット同期
- `airshare-server.js`: Windows側で起動するローカル共有サーバー
- `vendor/jsQR.js`: QR読み取り
- `vendor/qrcode.js`: QR生成

## 公開ページについて

GitHub Pages のURLはデモ表示用です。実際に端末間共有をする場合は、Windows側で `airshare-server.js` を起動して使います。
