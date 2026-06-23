# ADR-0008: 検索エンジンへのインデックス対策（sitemap + meta robots + GSC、project robots.txt は不採用）

## ステータス
accepted

## 日付
2026-06-24

## コンテキスト
- ユーザの要求（引用）: 「https://mu-777.github.io/kanji-verse/ のWebアプリがGoogle検索に引っかかるようにするにはどうしたらいい？」
- 現状確認: `site:mu-777.github.io/kanji-verse` で0件 → **未インデックス**。`mu-777` 関連で拾われているのは GitHub プロフィールのみ。
- 制約・前提:
  - デプロイは GitHub Actions（Vite build → `dist` を `upload-pages-artifact`）。**Jekyll は走らない**ため `public/_config.yml`（`jekyll-sitemap`）はデッド。sitemap は未生成だった。
  - `https://mu-777.github.io/robots.txt`（ホストルート）は存在しない（ルートのユーザーページrepoが無い）＝**ホストレベルのrobots.txtが無い＝クロール許可（デフォルト）**。
  - robots.txt はホストルートでしか効かない。プロジェクトページ（サブパス `…/kanji-verse/`）に置いた robots.txt はクローラに読まれない。
  - 本体は WebGL canvas。クロール可能な実テキストが乏しい（`<h1>`/canonical/構造化データ/`<noscript>` なし、`lang="ja"` だが表示は全英語）。

## 検討した選択肢

### 選択肢A: sitemap.xml + ページ単位 meta robots + GSC送信（project robots.txt は置かない）
- メリット: サブパスでも**実際に効く手段**だけで構成。meta robots はページ単位で確実に効き、sitemap は GSC で明示送信すれば発見される。誤解を生むファイルを置かない。
- デメリット: robots.txt が無いことに違和感を持つ人がいるかも（→ ADR で意図を明記して解消）。

### 選択肢B: project直下に robots.txt を置き、jekyll-sitemap を活かす
- メリット: 一見「定石どおり」。
- デメリット: robots.txt はサブパスでは**無視される**＝無意味。jekyll-sitemap は Actions デプロイでは**動かない**＝無意味。動かないものを「対応済み」と誤認させる。

## 決定
選択肢Aを採用する。
- 追加: `public/sitemap.xml`（URL 1本 + lastmod）。
- 追加（`index.html`）: canonical / `<meta name="robots" content="index,follow,max-image-preview:large">` / JSON-LD(WebApplication) / 視覚的に隠した `<h1>`(sr-only) / `<noscript>` 説明。`lang`・`og:locale` を英語(en / en_US)に整合。
- 削除: デッドな `public/_config.yml`。
- 追加しない: project直下の robots.txt（サブパスで無効なため）。

## 理由
「robots.txt はホストルートのみ有効」「jekyll は Actions デプロイで走らない」という2つの事実に基づき、**実際に効く手段に集約**するのがスタッフエンジニアとして正しい。動かないファイルを置くのは将来の自分や他者を誤認させる負債。
クロール材料は夜空ビジュアルの世界観を壊さない範囲（アクセシビリティ準拠の sr-only 見出し・noscript・構造化データ）で最小限に足す。

## 影響
- インデックスの発見性は、最終的に **Google Search Console での所有権確認 → URL検査でインデックス登録リクエスト → sitemap 送信**（①、ユーザ操作）で確定させる。本ADRはそのための器を整える。
- 今後ページ（URL）が増えたら sitemap.xml に追記する。
- ブランド名 "Kanjiverse" は既存商用サービス `kanjiverse.com` と競合。指名検索の上位化は困難で、独自キーワード（kanji visualization / kanji by meaning 3D など）や被リンクでの流入を前提にする。
