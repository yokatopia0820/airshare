# Market Evidence and Cache Design

## Goal

カード選択直後に、取得可能な価格・画像・更新日時・取得元を理由付きで表示し、価格がない状態を不具合と取引履歴なしに分ける。

## Constraints

- eBay Marketplace Insightsは新規利用が制限され、Browse APIはSold価格を返さない。
- pokeca-chartは公開APIと価格再利用許諾を確認できないため、許諾取得まではリンクアウトだけにする。
- GitHub PagesへAPIキーや秘密情報を置かない。
- 公式ポケカ画像を無断で転載・再配信しない。
- 価格を推定・捏造せず、取得できない理由を表示する。

## Architecture

### Market evidence model

画面はカードの価格データを次の3系統へ正規化する。

1. `ebay`: 検証済みのeBay Soldスナップショット
2. `domestic`: 許可済み国内価格フィード
3. `reference`: TCGplayer、Cardmarket、PriceChartingの海外参考価格

既存の`card.market`を維持しつつ、将来は`card.markets[]`も読めるようにする。各市場データは`source`、`channel`、`observedAt`、`dataKind`を必須表示情報として扱う。

### Stale-while-revalidate cache

- 保存済みカード情報は即表示する。
- 価格は24時間、カード詳細・画像は7日を目安に再取得する。
- 価格・画像が取得できなかった結果は6時間だけ保存し、毎回同じ失敗通信を繰り返さない。
- 選択されたカードは保存価格を表示したままバックグラウンド更新する。
- API失敗で保存価格を消さない。

### Image fallback

1. TCGdex日本語の同一カード画像
2. 同じTCGdex日本語IDの詳細API再取得
3. 同一画像URLの`high.webp`失敗時に`low.webp`
4. 取得不可ならカード名・番号のプレースホルダー

別言語画像や公式画像を日本語カードの正確な画像として置き換えない。

### Background index refresh

GitHub Pagesワークフローを毎日実行し、公開前にTCGdex日本語索引を再生成する。これにより、新規カードと後日追加された画像URLをコード変更なしで反映する。

## UI

選択カード内を次の順番にする。

1. カード画像、名称、番号、レアリティ
2. eBay Sold
3. 国内相場
4. 海外参考価格（eBayまたは国内価格がない場合の補助）
5. 価格推移
6. 最終更新日時、取得元
7. 仕入れ金額、種類別利益

価格行は次の状態を使う。

- `available`: 価格、件数、状態を表示
- `collecting`: 「価格データを収集中です」
- `no-results`: 「eBay取引履歴は確認できませんでした」
- `external-only`: 「国内相場は外部サイトで確認できます」
- `unavailable`: 「価格サービスに接続できませんでした」
- `not-configured`: 「自動価格取得は未接続です」

単独の「価格なし」「価格未登録」は選択後の価格領域で使わない。

価格推移は履歴が2件以上ある場合だけ小型グラフと期間騰落率を表示する。履歴不足時は「価格推移を作成中です」と表示する。

## Security

- 外部URLはHTTPSの許可済みホストだけを表示する。
- APIキーは将来のサーバー側プロバイダーだけに保存する。
- 生の外部API応答を公開リポジトリへ保存しない。
- eBay Sold以外をeBay価格または確定利益として表示しない。
- pokeca-chart価格は書面許諾または公式API提供まで取得・保存しない。

## Verification

- eBay、国内、参考価格の表示を混同しない。
- 取得理由ごとの文言をテストする。
- 保存価格がAPI失敗で消えない。
- 画像候補がhighからlowへ安全に切り替わる。
- 価格履歴の有限値だけで推移を計算する。
- 375px、390px、430px、1365pxで横スクロール、重なり、コンソールエラーがない。
- 公開URLで検索、選択、背景更新、取得元、更新日時を確認する。
