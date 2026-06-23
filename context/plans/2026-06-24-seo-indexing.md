# 計画: Google 検索にインデックスさせるための SEO 整備（②③）

## 最終更新
2026-06-24

## 目的
ユーザの発言を引用:
> 「https://mu-777.github.io/kanji-verse/ のWebアプリがGoogle検索に引っかかるようにするにはどうしたらいい？」
> 「②③を進めて」

`site:mu-777.github.io/kanji-verse` で1件もヒットせず、現状 Google に**未インデックス**であることを確認済み。
今回はそのうち、コード側で対応できる **② sitemap/robots 系** と **③ クロール可能性の改善** を実装する。
（① Google Search Console 登録・インデックス登録リクエストはユーザのGoogleアカウント操作のため対象外。所有権確認ファイル設置は別途支援可能。）

## 現状把握（事実確認済み）
- デプロイは GitHub Actions（`npm run build` → `dist` を `upload-pages-artifact`）。**Jekyll は走らない**。
  → `public/_config.yml`（`jekyll-sitemap`）は `dist/` にコピーされるだけの**デッドコード**。sitemap は生成されていない。
- `https://mu-777.github.io/robots.txt`（ホストルート）は「Site not found」。
  ルートのユーザーページrepoが無いため**ホストレベルのrobots.txtは存在しない＝クロール許可（デフォルト）**。
  robots.txt はホストルートでしか効かないため、`public/robots.txt`（→ `…/kanji-verse/robots.txt`）は**クローラに無視される＝無意味**。
- `dist/` は `.gitignore` 済み・git未追跡。編集対象は `index.html` と `public/` のソースのみ。
- `index.html` 現状: `<title>` と meta description / OGP / Twitter Card はあるが、
  `<h1>` なし・canonical なし・構造化データなし・`<noscript>` なし。`lang="ja"` だが**表示コンテンツは全て英語**。
- 本体は WebGL canvas。クロール可能な実テキストが welcome/info ボードの英文程度しかなく薄い。
- 補足: ブランド名 "Kanjiverse" は既存商用サービス `kanjiverse.com` と競合。指名検索の上位化は困難という前提。

## アプローチの選択肢

### ② robots/sitemap
- **選択肢A（採用）**: sitemap.xml を `public/` に追加し GSC で送信する前提にする。robots.txt は**追加しない**（サブパスでは無効なため）。代わりにページ単位の `<meta name="robots" content="index,follow,…">` を付与する。デッドな `_config.yml` は削除。
- 選択肢B: `public/robots.txt` も形式的に置く。→ クローラが読まない位置に置く誤解を生むため不採用。意図を残すコストに見合わない。

### ③ クロール可能性
- **選択肢A（採用）**: 視覚的に隠した `<h1>`（sr-only）+ `<noscript>` 説明 + canonical + meta robots + JSON-LD(WebApplication) + `lang`/`og:locale` を英語に整合。
- 選択肢B: 本文に見える形でテキストを大量追加。→ 夜空ビジュアルの世界観を壊すため不採用。隠しテキストはアクセシビリティ準拠の範囲（ページ目的と一致する正当な見出し）に留める。

## 採用アプローチと理由
- robots.txt はサブパスで無効という事実に基づき、**実際に効く手段（meta robots + sitemap + GSC送信）に集約**する。
- クロール材料は、世界観を壊さない範囲で「正しい見出し(h1)・noscript・構造化データ」を足し、Googlebot のレンダリング/非レンダリング双方に最低限の意味を渡す。
- `lang` は表示言語（英語）に合わせるのが正確。容易に戻せる変更。

## 作業ステップ
- [ ] `public/sitemap.xml` を追加（URL 1本 + lastmod）
- [ ] `public/_config.yml` を削除（デッド設定）
- [ ] `index.html`: `lang="ja"`→`"en"`、`og:locale` `ja_JP`→`en_US`
- [ ] `index.html`: canonical / `<meta name="robots">` 追加
- [ ] `index.html`: JSON-LD（WebApplication）追加
- [ ] `index.html`: `.sr-only` CSS + 視覚的に隠した `<h1>` + `<noscript>` 説明
- [ ] `npm run build` で検証（dist に sitemap が出る / `_config.yml` が消える / head に各タグが入る）
- [ ] PROJECT.md / learnings.md 更新、ADR-0008 作成

## 検証方法
- `npm run build` 後、`dist/sitemap.xml` の存在、`dist/index.html` に canonical / meta robots / JSON-LD / h1.sr-only / noscript が含まれること、`dist/_config.yml` が無いことを確認。
- 反映（デプロイ後）の最終確認はユーザ側: GSC で URL 検査 → インデックス登録リクエスト、sitemap 送信。
