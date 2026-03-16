# プロジェクトコンテキスト

## 最終更新
2026-03-17

## プロジェクトの目的
人名に使える漢字（常用漢字2136字 + 人名用漢字649字 = 2785字）を
AI embeddingによる意味的類似度で配置した、夜空風インタラクティブビジュアライゼーションWebアプリ。
「この漢字とこの漢字は意味的に近いんだ」という発見ができる体験を提供する。

## 現在の方針
- ビジュアライゼーションのバリエーションを複数実装・デプロイして比較できる構成
- Vite マルチページアプリ（4 バリアント）
- Python スクリプトで 2D/3D データ生成 → 各バリアントで使い分け

## バリアント構成

vite.config.ts の `build.rollupOptions.input` が正とする。

| URL | エントリ | 実装 | 概要 |
|---|---|---|---|
| `/kanji-verse/` | `index.html` | Three.js UMAP 3D | 3D空間, UnrealBloom, 自動航行カメラ |
| `/kanji-verse/pages/2d/` | `pages/2d/index.html` | Canvas 2D（オリジナル） | pan/zoom, 検索, フィルタ |
| `/kanji-verse/pages/2d-bloom/` | `pages/2d-bloom/index.html` | Canvas 2D + KDE ネビュラ | クラスタ密度からネビュラ生成, twinkling, bloom |
| `/kanji-verse/pages/three-nebula/` | `pages/three-nebula/index.html` | Three.js + Gaussian nebula | three-3d に加えてシェーダーネビュラ |

> 注: ルート (`/kanji-verse/`) は three-3d バリアント。ナビゲーションページは現在存在しない。

## 主要な決定事項
- ADR-0001: Embedding モデルとして `all-mpnet-base-v2`（英語特化）を採用
- ADR-0002: 2D/3D 座標を事前計算してJSONに焼き込む方式
- ADR-0003: マルチページ Vite 構成で複数バリアントを並列デプロイ（ADR作成予定）
- エッジなし（夜空の星のような点のみ配置）
- 1漢字 = 1ノード（複数意味は連結してEmbedding）
- 意味テキスト = 英語意味のみ

## データ構成
- `public/data/kanji-2d.json`: x, y, t, c（base/bloom 用）
- `public/data/kanji-3d.json`: x, y, z, t, c（three-3d/three-nebula 用）
- `c` = K-means クラスタ ID（0〜19、UMAP 3D 座標上で計算）

## ファイル構成（主要）
```
src/
  shared/          # 型定義, データローダー, UI共通処理, romanize
  base/            # Canvas 2D オリジナル
  bloom/           # Canvas 2D + KDE/twinkling/bloom
  three-core/      # Three.js 共有モジュール（scene/camera/points/composer/interaction/proximity-label）
  three-3d/        # Three.js 3D バリアント
  three-nebula/    # Three.js + Gaussian splat nebula
  # ※ src/ 直下の main.ts / renderer.ts / romanize.ts は旧ファイル（未使用、削除候補）
```

## 現在の課題・未解決事項
- GitHub Pages デプロイ設定（base: "/kanji-verse/"）は仮。リポジトリ名に合わせて要変更
- ルート直下に旧エントリフォルダ `base/`, `bloom/`, `three-3d/` が残存（`2d/`, `2d-bloom/`, root への移行後の残骸。削除候補）
- `src/` 直下に旧ファイル `main.ts`, `renderer.ts`, `romanize.ts` が残存（未使用。削除候補）

## スコープ外（明示的にやらないこと）
- ノード間のエッジ表示
- ブラウザ上でのリアルタイムEmbedding計算
- 漢字の読み情報の表示（詳細パネルには表示するが検索には使わない）
