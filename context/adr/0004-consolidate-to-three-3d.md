# ADR-0004: テスト用バリアントを削除し three-3d 単一構成に確定

## ステータス
accepted

## 日付
2026-06-21

## コンテキスト
- ADR-0003 で「実装して見てみないと判断がつかない」という理由から、複数のビジュアライゼーション
  バリアント（Canvas 2D / 2D-bloom / Three.js 3D / three-nebula）を Vite マルチページで並列デプロイし、
  比較できる構成にしていた。
- 比較検討の結果、ルートの Three.js UMAP 3D（three-3d）を本命として採用することが確定。
- ユーザー発言:
  > 「以下のバリアントはテスト用だったのでもう消してしまって、ルートの3Dのだけを有効にして
  > pages/2d-bloom/index.html / pages/2d/index.html / pages/three-nebula/index.html」

## 検討した選択肢

### 選択肢A: ページ＋専用 src も削除（採用）
- メリット: デッドコードを残さずクリーン。「ルート3Dのみ有効」という意図と完全に一致。
- デメリット: 削除ファイルが多い（が git 履歴から復元可能）。

### 選択肢B: ページのみ削除（src は残す）
- メリット: 後で参照する可能性を残せる。
- デメリット: 未使用の src/base・bloom・three-nebula が残りノイズになる。比較フェーズは終了済みで残す理由が薄い。

## 決定
選択肢A を採用。以下を削除し、ルート `index.html`（three-3d）単一構成に確定する。
- ページ: `pages/2d/`, `pages/2d-bloom/`, `pages/three-nebula/`（`pages/` ディレクトリごと）
- 専用 src: `src/base/`, `src/bloom/`, `src/three-nebula/`
- `vite.config.ts` のマルチページ入力定義（ルートの Vite デフォルトエントリに一本化）

残すもの:
- `src/three-3d/`（ルートのエントリ）
- `src/three-core/`（three-3d が使用）
- `src/shared/`（three-3d が使用）

## 理由
- 依存は一方向で、`three-core`・`shared` は削除対象（base/bloom/three-nebula）を import していないため、
  削除しても残るコードは壊れない。
- 比較フェーズが完了し本命が確定したため、複数バリアントを並列維持する ADR-0003 の前提が消滅した。

## 影響
- ADR-0003 を廃止（superseded）。マルチページ Vite 構成は採らない。
- ビルドエントリはルート `index.html` のみ。`vite.config.ts` から `build.rollupOptions.input` を撤去。
- `public/data/kanji-2d.json` は未使用化。同日（2026-06-21）に削除し、`scripts/generate_data.py` を 3D 専用化、`scripts/generate-ogp.mts` を kanji-3d.json 参照へ更新した。
- GitHub Actions の deploy.yml は変更不要（dist/ をそのまま配信）。
