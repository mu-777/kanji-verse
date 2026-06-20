# プロジェクトコンテキスト

## 最終更新
2026-06-21

## プロジェクトの目的
人名に使える漢字（常用漢字2136字 + 人名用漢字649字 = 2785字）を
AI embeddingによる意味的類似度で配置した、夜空風インタラクティブビジュアライゼーションWebアプリ。
「この漢字とこの漢字は意味的に近いんだ」という発見ができる体験を提供する。

## 現在の方針
- 比較検討フェーズを終え、Three.js UMAP 3D（ルート）を本命として単一構成に確定（2026-06-21）
- 単一ページアプリ（ルート `index.html` のみ）
- Python スクリプトで 3D データ生成 → ルート3Dで使用

## 構成

エントリは `index.html`（Vite デフォルトエントリ）のみ。

| URL | エントリ | 実装 | 概要 |
|---|---|---|---|
| `/kanji-verse/` | `index.html` | Three.js UMAP 3D | 3D空間, UnrealBloom, 自動航行カメラ |

> 注: 2D / 2D-bloom / three-nebula のテスト用バリアントは 2026-06-21 に削除済み（ADR-0004）。

## ローカル実行・動作確認
（WSL2 + VSCode 環境。Windows 側のブラウザで開く前提。ポートは WSL2→Windows localhost に自動転送される）

- **開発（HMR あり）**: リポジトリルートで `npm run dev` → **http://localhost:5173/kanji-verse/**
- **高速・安定な動作確認（推奨）**: `npm run build` → `npx vite preview --port 4173` → **http://localhost:4173/kanji-verse/**
- 注意点:
  - URL 末尾の `/kanji-verse/` は必須（`vite.config.ts` の `base`）。付けないと表示されない。
  - dev は初回ロードが遅い（`/mnt/c` のコールド最適化＋テクスチャ生成で最大~70秒、2回目以降は速い）。素早く見たいだけなら build+preview の方が安定して速い（表示まで ~16秒）。

## 主要な決定事項
- ADR-0001: Embedding モデルとして `all-mpnet-base-v2`（英語特化）を採用
- ADR-0002: 2D/3D 座標を事前計算してJSONに焼き込む方式
- ADR-0003: マルチページ Vite 構成で複数バリアントを並列デプロイ → **ADR-0004 で廃止**
- ADR-0004: 比較完了によりテスト用バリアントを削除し three-3d 単一構成に確定
- エッジなし（夜空の星のような点のみ配置）
- 1漢字 = 1ノード（複数意味は連結してEmbedding）
- 意味テキスト = 英語意味のみ

## ブランドアセット
- OGP: `public/ogp.png`（`scripts/generate-ogp.mts`。※実画像とスクリプトに乖離あり。下記課題参照）
- favicon: `public/favicon.svg`（主・ベクター） / `favicon.ico`（16/32/48） / `apple-touch-icon.png`（180） / `icon-512.png`。
  - `scripts/generate-favicon.mts` で再生成（`npx tsx scripts/generate-favicon.mts`）。
  - 意匠: 「Kanji-Verse」の語源 **漢字＋宇宙** の4文字を、深宇宙背景に発光する星のクラスタとして配置。白で統一し、回転なし（端正）、大小（対角に大⇔小）でリズムを作り、大きい字はタイルから少しはみ出させてダイナミックに。多層グローで星の発光感を出す。グリフは游明朝 Light（Windows同梱 `yuminl.ttf`、OGP の Inter Light の細線に合わせた）のアウトラインをベクター化し、SVG/PNG/ICO を同一配置から出力。
  - 注: opentype.js は `.ttc` 非対応のため plain TTF（游明朝）を使用。游ゴシック等の `.ttc` は使えない。

## データ構成
- `public/data/kanji-3d.json`: x, y, z, t, c（three-3d 用。`scripts/generate_data.py` が生成）
- `c` = K-means クラスタ ID（0〜19、UMAP 3D 座標上で計算）
- 旧 `kanji-2d.json` は 2026-06-21 に削除（2D バリアント廃止に伴い未使用化。`generate_data.py` は 3D 専用に、`generate-ogp.mts` は kanji-3d.json 参照に更新済み）。
- `public/data/kanji.json`（旧・別系統の生成物）は未使用のまま残存。README とともに整理候補。

## ファイル構成（主要）
```
src/
  shared/          # 型定義, データローダー, UI共通処理, romanize
  three-core/      # Three.js 共有モジュール（scene/camera/points/composer/interaction/proximity-label）
  three-3d/        # Three.js 3D バリアント（ルート index.html のエントリ）
```

## 現在の課題・未解決事項
- **初期ロードが遅い（本番でも ~16秒）**: 起動時に2,785漢字のテクスチャを全数先行生成している（実測 約14秒, `src/three-core/proximity-label.ts`）。JSON ロードは無関係（402KB / ~0.4秒）。ラベルはズームイン時のみ表示されるため遅延生成すればほぼ0秒にできるが、2026-06-21 時点でユーザー判断により実装は見送り。詳細は learnings.md（2026-06-21）参照。
- **dev サーバが `/mnt/c` 上で遅い**: WSL2 が Windows ドライブを 9P 越しに読むため、Vite のコールド最適化・モジュール変換が極端に遅い（初回数十秒）。根本対策は WSL2 ネイティブFS（`~/...`）への移設。
- GitHub Pages デプロイ設定（base: "/kanji-verse/"）は仮。リポジトリ名に合わせて要変更
- `scripts/generate-ogp.mts` は現行の `public/ogp.png` を再現しない（コミット版は `bold 64px IPAGothic`・和文サブタイトルだが、実画像は Inter ExtraLight の大文字「KANJI-VERSE」＋横罫＋英語タグライン）。画像は別バージョンで生成されたままスクリプトが更新されていない。OGP を作り直す際は要同期。なお参照データは 2026-06-21 に kanji-3d.json（x,y 平面）へ変更済みのため、再生成時の星空配置は旧 2D とは異なる。
- README.md が旧 2D Canvas アプリ（`kanji.json`・Canvas 2D・存在しない `src/renderer.ts`/`src/main.ts`）の記述のまま陳腐化。3D 単一構成に合わせた全面更新が必要。
  - 関連: ウェルカムオーバーレイ（index.html）はこの実画像の世界観（Inter 18pt ExtraLight）に合わせて2026-06-21に刷新済み。

## スコープ外（明示的にやらないこと）
- ノード間のエッジ表示
- ブラウザ上でのリアルタイムEmbedding計算
- 漢字の読み情報の表示（詳細パネルには表示するが検索には使わない）
