# Kanji-Verse

人名に使える漢字（常用漢字 + 人名用漢字 ≈ 3000字）を、意味の近さで配置した夜空風ビジュアライゼーション。

https://mu-777.github.io/kanji-verse/

## 機能

- 約3000字を意味的な近さで配置（AI Embedding + UMAP）
- パン・ズームで自由に探索
- 漢字をクリック → 意味を表示
- 1文字検索 → 宇宙の中でその漢字を発見
- 常用漢字 / 人名用漢字のフィルタ切替

---

## セットアップ

### 前提

- [nvm](https://github.com/nvm-sh/nvm)
- [uv](https://docs.astral.sh/uv/) （Python パッケージマネージャ）

### 1. データ生成（初回のみ）

漢字の意味データを取得し、Embedding → UMAP で2D座標を計算して `public/data/kanji.json` を生成します。

```bash
cd scripts
uv sync                       # 仮想環境を作成・依存をインストール
uv run python generate_data.py
```

**所要時間の目安:**
- 依存インストール + モデルダウンロード（初回のみ）: 5〜10分
- Embedding 計算（3000字）: 1〜3分
- UMAP 計算: 1〜2分

完了すると `public/data/kanji.json`（約200KB）が生成されます。

### 2. Webアプリ起動

```bash
# プロジェクトルートに戻る
cd ..
nvm install   # .nvmrc のバージョンをインストール（初回のみ）
nvm use       # バージョンを切り替え
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

---

## GitHub Pages へのデプロイ

`main` ブランチへのプッシュで GitHub Actions が自動的にビルド・デプロイします。

### 1. `vite.config.ts` のベースパスを確認

```ts
// vite.config.ts
export default defineConfig({
  base: "/kanji-verse/",  // ← GitHubリポジトリ名に合わせる
});
```

### 2. GitHub リポジトリの設定

Settings → Pages → Source を **"GitHub Actions"** に変更する。

### 3. `public/data/kanji.json` をコミットしてプッシュ

```bash
git add public/data/kanji.json
git commit -m "add kanji data"
git push origin main
# → GitHub Actions が自動でビルド・デプロイ
```

---

## ディレクトリ構成

```
kanji-verse/
├── scripts/
│   ├── pyproject.toml       # Python依存定義
│   └── generate_data.py     # データ生成スクリプト
├── src/
│   ├── renderer.ts          # Canvas描画・インタラクション
│   └── main.ts              # データ読み込み・UI制御
├── public/
│   └── data/
│       └── kanji.json       # 生成データ（要生成・要コミット）
├── index.html
├── vite.config.ts
└── package.json
```

## データの仕組み

```
KanjiDic2（無料XML）
  ↓ 意味テキスト（英語）を抽出
SentenceTransformer（all-mpnet-base-v2）
  ↓ 768次元の意味ベクトルを生成
UMAP
  ↓ 2次元座標に圧縮
kanji.json
  ↓ ブラウザで読み込み
Canvas 2D でレンダリング
```

意味が近い漢字ほど近くに配置されます（例：「木」「森」「林」は近くに集まる）。
