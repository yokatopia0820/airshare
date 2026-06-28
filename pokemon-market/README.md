# Pokemon Card Sourcing PWA

トレカショップ店頭でカードを検索し、通常・ミラー・PSA10の参考価格から利益を比較するスマートフォン向けPWAです。AirShare本体とは独立しています。

## 起動

```powershell
node pokemon-market/server.js
```

- PC: `http://127.0.0.1:4174/`
- スマートフォン: 起動時に表示される `Pokemon Market phone` のURL

スマートフォンとPCは同じWi-Fiへ接続してください。LAN上のHTTP URLでは通常ブラウザ利用はできますが、Service Workerやホーム画面へのインストールは制限される場合があります。PWAの実機確認にはGitHub PagesなどのHTTPS配信を使います。

## 店頭での使い方

1. カード名または番号を検索します。
2. 店頭価格を円で入力します。
3. 検索結果ごとの通常・ミラー・PSA10の利益を比較します。
4. カードを開き、販売価格、送料、直近1か月の実売件数、状態を確認します。

判定は参考値です。カード状態、バリアント、関税、配送条件、eBayの最新手数料を仕入れ前に再確認してください。

## 利益計算

```text
販売総額 = (販売価格 + 購入者送料) × USD/JPY
eBay手数料 = 販売総額 × 手数料率
為替余裕 = 販売総額 × 為替安全率
利益 = 販売総額 - eBay手数料 - 国際送料 - 梱包費 - 為替余裕 - 店頭価格
ROI = 利益 ÷ 店頭価格
```

USD/JPYとEUR/JPYはFrankfurterの日次レートを自動取得します。計算設定から手数料、送料、梱包費、為替余裕率、目標利益、目標ROIを変更でき、設定はブラウザ内にだけ保存されます。

## 価格データ

- カード識別、画像、市場参考価格: TCGdex日本語カードAPI
- 価格: eBay Product Researchや許可された情報から作成した参考スナップショット
- 必須識別: `setCode + localNumber + language + rarity + variant.code`
- Master Ball、Poke Ball、通常、プロモ、初版、別言語は別レコード

カード検索はTCGdexへオンデマンドで問い合わせます。TCGplayer市場価格を優先し、ない場合はCardmarketの直近30日平均を円換算します。検索結果は端末へ一時保存しますが、価格未登録のカードを0円として利益計算することはありません。TCGdexの市場価格はeBay実売件数ではないため、画面でも「市場参考価格」または「直近30日平均の参考価格」と区別します。

同梱の `data/latest.json` は画面動作確認用のPriceCharting手動参考サンプルです。eBay実売比較として使う場合は、許可された方法で確認したデータを `sold-comparable` スナップショットとして作成し、検証後に取り込んでください。

## JSON更新

同梱データは `pokemon-market/data/latest.json` です。取込形式は `pokemon-market/data/snapshot.example.json` を参照してください。

```powershell
node pokemon-market/tools/validate-snapshot.mjs pokemon-market/data/latest.json
```

店頭画面には管理者向けのJSON取込を置いていません。データ更新時はこのファイルを検証して差し替えます。APIキー、トークン、Cookieなどの秘密情報をJSONへ含めないでください。

## オフライン

初回オンライン表示後、アプリシェルと同一オリジンの最新スナップショットをService Workerが保存します。設定と検索済みカード情報はブラウザへ保存されます。未取得の外部カード画像はオフライン時に表示できないため、カード名と番号の代替表示を使います。

## 検証

```powershell
node --check pokemon-market/app.js
node --check pokemon-market/core.mjs
node --check pokemon-market/catalog.mjs
node --check pokemon-market/tcgdex.mjs
node --check pokemon-market/fx.mjs
node --check pokemon-market/storage.mjs
node --check pokemon-market/snapshot.mjs
node --check pokemon-market/sw.js
node --test
node pokemon-market/tools/validate-snapshot.mjs pokemon-market/data/latest.json
node pokemon-market/verify-browser.mjs
```

ブラウザ検証は375px、390px、430px、1365px幅で、通常・ミラー・PSA10の利益、実売表示、不要要素の不存在、横スクロール、44px操作領域、コンソールエラーを確認します。
