# Kanji-Verse

*[English](README.md) · 日本語*

人名に使える漢字（常用漢字2,136字 + 人名用漢字649字 = 2,785字）を、意味の近さで配置した夜空風の3Dビジュアライゼーション。

https://mu-777.github.io/kanji-verse/

意味が近い漢字ほど近くに集まります（例：「木」「森」「林」は近くに配置される）。

## 機能

- 約2,800字を意味的な近さで3D空間に配置（AI Embedding + UMAP 3D）
- ドラッグで回転・スクロールでズームして自由に探索（起動時は自動でイントロズーム）
- 星（漢字）をクリック → 音読み・訓読み（ローマ字併記）・意味を表示
- 検索バー1つで2種類の検索
  - 漢字を入力 → その1字へカメラが飛ぶ（例：`愛`）
  - 英語を入力 → 意味に一致する漢字を発光（例：`love`）
- 常用漢字 / 人名用漢字のフィルタ切替
- URL 共有：`?k=愛` で起動すると即座にその漢字へジャンプ・選択
- 初回訪問時のウェルカム表示、右下 ⓘ から再表示できる About / 操作ヒント / アクセス解析の開示

---

## 技術スタック

- **描画**: [Three.js](https://threejs.org/)（点群 + UnrealBloomPass による発光表現）
- **次元削減**: UMAP（768次元の意味ベクトル → 3D座標）
- **ビルド**: Vite + TypeScript
- **データ生成**: Python（SentenceTransformer / UMAP / scikit-learn）
- **ホスティング**: GitHub Pages（GitHub Actions で自動デプロイ）

---

## セットアップ

### 前提

- [nvm](https://github.com/nvm-sh/nvm)
- [uv](https://docs.astral.sh/uv/) （Python パッケージマネージャ。データ生成時のみ必要）

### 1. データ生成（初回のみ）

KanjiDic2 から漢字の意味・読みを取得し、Embedding → UMAP（3D）→ K-means で
`public/data/kanji-3d.json` を生成します。

```bash
cd scripts
uv sync                       # 仮想環境を作成・依存をインストール
uv run python generate_data.py
```

**所要時間の目安:**
- 依存インストール + モデルダウンロード（初回のみ）: 5〜10分
- Embedding 計算（2,785字）: 1〜3分
- UMAP + K-means 計算: 1〜2分

完了すると `public/data/kanji-3d.json`（約400KB）が生成されます。
（生成済みデータはリポジトリにコミット済みのため、表示を確認するだけならこの手順はスキップ可能です）

### 2. Webアプリ起動

```bash
# プロジェクトルートに戻る
cd ..
nvm install   # .nvmrc のバージョンをインストール（初回のみ）
nvm use       # バージョンを切り替え
npm install
npm run dev
```

ブラウザで **http://localhost:5173/kanji-verse/** を開きます。

> **末尾の `/kanji-verse/` は必須です**（`vite.config.ts` の `base` 設定）。付けないと表示されません。
>
> dev サーバは初回ロードが遅い場合があります（特に WSL2 + `/mnt/c` 配下）。素早く確認したいときは `npm run build` → `npm run preview` の方が安定して速いです。

---

## GitHub Pages へのデプロイ

`master` ブランチへのプッシュで GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が
自動的にビルド・デプロイします。

### 前提設定

- **ベースパス**: `vite.config.ts` の `base: "/kanji-verse/"` をリポジトリ名に合わせる
- **Pages の Source**: GitHub リポジトリの Settings → Pages → Source を **"GitHub Actions"** に設定
- **生成データ**: `public/data/kanji-3d.json` はビルド成果物に含まれるため、コミットしておく

```bash
git add public/data/kanji-3d.json
git commit -m "update kanji data"
git push origin master
# → GitHub Actions が自動でビルド・デプロイ
```

> 公開サイトでは Google Analytics（GA4）でアクセス傾向を計測しています（個人データは収集しません）。

---

## ディレクトリ構成

```
kanji-verse/
├── scripts/
│   ├── pyproject.toml          # Python 依存定義
│   ├── generate_data.py        # データ生成（KanjiDic2 → Embedding → UMAP 3D → K-means）
│   ├── generate-ogp.mts        # OGP 画像生成
│   └── generate-favicon.mts    # favicon 生成
├── src/
│   ├── shared/                 # 型定義 / データローダー / UI / ローマ字変換
│   ├── three-core/             # Three.js 共有モジュール
│   │   ├── scene.ts            #   シーン・レンダラ
│   │   ├── camera.ts           #   カメラ制御（イントロズーム・flyTo）
│   │   ├── points.ts           #   漢字の点群
│   │   ├── composer.ts         #   ポストプロセス（UnrealBloom）
│   │   ├── interaction.ts      #   ホバー・クリック・検索
│   │   └── proximity-label.ts  #   ズームイン時のラベル表示
│   └── three-3d/
│       └── main.ts             # ルート index.html のエントリ
├── public/
│   └── data/
│       └── kanji-3d.json       # 生成データ（要生成・要コミット）
├── index.html
├── vite.config.ts
└── package.json
```

## データの仕組み

```
KanjiDic2（無料XML）
  ↓ 英語の意味・音/訓読みを抽出（常用: grade 1-6,8 / 人名用: grade 9）
SentenceTransformer（all-mpnet-base-v2）
  ↓ 768次元の意味ベクトルを生成
UMAP（3D, cosine）
  ↓ 3次元座標に圧縮し [0,1] に正規化
K-means（k=20）
  ↓ 3D座標上でクラスタリング → 各漢字にクラスタIDを付与
kanji-3d.json（約400KB）
  ↓ ブラウザで読み込み
Three.js + UnrealBloom でレンダリング
```

各エントリは `k`（漢字）, `m`（意味）, `on`/`kun`（読み）, `x`/`y`/`z`（3D座標）,
`t`（0=常用 / 1=人名用）, `c`（クラスタID。生成はするが現状の描画では未使用）を持ちます。
意味が近い漢字ほど近くに配置されます。
