# Pokemon Card Sourcing PWA

トレカショップ店頭でカードを検索し、特定カードを選んでから仕入れ判断を行うスマートフォン向けPWAです。AirShare本体とは独立しています。

## 起動

```powershell
node pokemon-market/server.js
```

- PC: `http://127.0.0.1:4174/`
- スマートフォン: 起動時に表示される `Pokemon Market phone` のURL

スマートフォンとPCは同じWi-Fiへ接続してください。LAN上のHTTP URLでは通常ブラウザ利用はできますが、Service Workerやホーム画面へのインストールは制限される場合があります。PWAの実機確認にはGitHub PagesなどのHTTPS配信を使います。

## 店頭での使い方

1. カード名または番号を検索します。
2. 一覧から対象カードを1枚選択します。
3. 仕入れ金額を円で入力します。
4. eBay実売価格が登録されている場合だけ、通常・ミラー・PSA10の利益とROIを確認します。

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

- カード検索: TCGdex日本語全件索引（現在6,246件）
- 画像、レアリティ、市場参考価格: TCGdex日本語カードAPI
- 日本語検索の既知の不足: 独自の小規模な検索補完データ（公式画像や本文は複製しない）
- 価格: eBay Product Researchや許可された情報から作成した参考スナップショット
- 必須識別: `setCode + localNumber + language + rarity + variant.code`
- Master Ball、Poke Ball、通常、プロモ、初版、別言語は別レコード

同梱のTCGdex日本語索引と検索補完データを先に表示し、TCGdexオンライン検索を最大6秒だけ追加します。ひらがな・カタカナは同じ検索語として扱います。検索結果は最初の24件を表示し、必要な場合だけ続きを展開します。TCGplayer、Cardmarket、PriceChartingは海外参考価格として円換算し、仕入れ額入力後に「参考利益」とROIを表示します。`sold-comparable`として検証済みのeBay実売価格だけを「利益」と表示します。

カード選択時は、eBay Sold、国内相場、海外参考価格、価格推移、更新日時、取得元の順に表示します。自動取得できない場合は、未接続、外部確認、収集中、接続失敗を区別します。国内相場はYahoo!オークション落札相場と「みんなのポケカ相場」への確認リンクを表示しますが、利用許諾のない価格スクレイピングや転載は行いません。

eBay Soldの公式自動取得には利用資格が限定されたMarketplace Insights系データまたは許可済みデータ契約が必要です。静的なGitHub Pagesへクライアントシークレットを置けないため、現状は許可済み`eBay Product Research`スナップショットを優先し、未接続時はeBay Sold検索へ案内します。カード詳細は選択時にバックグラウンド更新し、成功結果を最大500件・30日、失敗結果を6時間キャッシュします。画像は同一の日本語TCGdexカードについて高画質、低画質の順で補完します。

TCGdexに未登録の日本語カードを完全網羅するには、再配布と商用利用が許可されたカードDB契約が別途必要です。公式サイト掲載データの一括複製や公式画像のホットリンクは行いません。

同梱の `data/latest.json` は画面動作確認用のPriceCharting手動参考サンプルです。eBay実売比較として使う場合は、許可された方法で確認したデータを `sold-comparable` スナップショットとして作成し、検証後に取り込んでください。

## JSON更新

同梱データは `pokemon-market/data/latest.json` です。取込形式は `pokemon-market/data/snapshot.example.json` を参照してください。

```powershell
node pokemon-market/tools/validate-snapshot.mjs pokemon-market/data/latest.json
node pokemon-market/tools/build-tcgdex-ja-index.mjs
```

TCGdexカードDBはMITライセンスです。索引はTCGdex REST APIが返す名前、ID、番号、画像URLだけを圧縮保存し、カード画像ファイル自体は同梱しません。店頭画面には管理者向けのJSON取込を置いていません。APIキー、トークン、Cookieなどの秘密情報をJSONへ含めないでください。

GitHub Pagesの公開ワークフローは毎日TCGdex日本語索引を再生成してから配信します。更新APIが失敗した場合は、直前にリポジトリへ保存された索引を使って公開を継続します。

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

ブラウザ検証は375px、390px、430px、1365px幅で、ひらがな検索、レアリティ絞り込み、価格出所、横スクロール、44px操作領域、コンソールエラーを確認します。
