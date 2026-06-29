# Pokemon Search, Price Sources, and Rarity Design

## Finished behavior

The public mobile app finds Japanese cards such as `カスミのおねがい` and `カスミの元気` from either `カスミ` or `かすみ`, lets the user narrow results by rarity, and never presents an overseas reference price as a domestic or eBay price.

## Search architecture

- Keep TCGdex for card metadata and its TCGplayer/Cardmarket pricing fields.
- Add only a small independently maintained supplement for known TCGdex search gaps. It contains factual identifiers and text links, not copied official images or page content.
- Normalize comparison text with NFKC and hiragana-to-katakana conversion. Preserve the user's original text in the input.
- Search the supplement locally and TCGdex remotely, then merge the results. Supplement-only records remain selectable even when no price is available.
- Render at most 24 results initially and expose the next 24 only after an explicit action.

## Price architecture

- Price labels come from the actual provider: `国内価格`, `eBay価格`, `TCGplayer価格`, `Cardmarket価格`, or `海外参考価格`.
- Do not relabel TCGplayer, Cardmarket, or PriceCharting data as eBay or domestic data.
- Yahoo!オークションの落札相場を国内取引価格の確認先にする。国内サイトの数値自動取得は、対応する公開APIまたはデータ利用契約がないため行わない。
- eBay sold-search is linked for verification. Automatic eBay pricing requires a server-side OAuth integration and is excluded from a credential-free GitHub Pages release.

## Rarity controls

- Put a segmented rarity control directly to the right of the result count.
- Use at most six choices: `すべて`, `C/U`, `R/RR`, `AR`, `SR以上`, `その他`.
- Only show buckets represented in the current result set.
- Filtering is local, preserves result order, and does not repeat the network search.
- A new search resets the filter to `すべて`; returning from a selected card preserves it.

## Verification

- Automated tests prove kana normalization, supplement matching, rarity bucketing, progressive result rendering, and truthful market labels.
- Browser checks cover `カスミ`, `かすみ`, `カスミのおねがい`, `カスミの元気`, rarity filtering, selection, and 390px horizontal overflow.
- Public verification is performed against the deployed GitHub Pages URL after the Pages workflow succeeds.

## Residual constraints

- The official site's policy prohibits copying and public-network reuse of its page data, so the app does not publish a generated official-site index or hotlink official images.
- Full Japanese-card coverage requires a licensed, redistribution-safe database. TCGdex plus targeted supplements improves search but is not represented as complete coverage.
- Domestic and eBay numeric prices cannot be fetched safely from a static public page without an authorized API and server-side credentials.
