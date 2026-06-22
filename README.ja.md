# Kanji-Verse

*[English](README.md) · 日本語*

<p align="center">
  <a href="https://mu-777.github.io/kanji-verse/">
    <img src="public/ogp.png" alt="Kanji-Verse — 漢字でできた夜空" width="680">
  </a>
</p>

<p align="center"><b><a href="https://mu-777.github.io/kanji-verse/">✨ Kanji-Verse を開く →</a></b></p>

**Kanji-Verse は、漢字でできた夜空です。** 人名に使える約2,800字の漢字が3D空間を漂い、意味が近い漢字どうしほど近くに集まっています。星の海をたゆたいながら、「この漢字とこの漢字は意味がご近所なんだ」という発見を楽しめます。

<p align="center">
  <video src="https://github.com/mu-777/kanji-verse/raw/master/kanji-verse_720p.mp4" controls muted loop width="680">
    <a href="https://github.com/mu-777/kanji-verse/raw/master/kanji-verse_720p.mp4">▶ デモ動画を見る</a>
  </video>
</p>

<p align="center"><sub>ざっと一巡り — 銀河を漂い、意味で検索し、漢字へダイブ。</sub></p>

### できること

- 🌌 **漢字の銀河を散策** — ドラッグで見回し、スクロールでズームして、数千の発光する漢字の間を進む
- ✨ **意外なご近所を発見** — 意味が近い漢字が自然と寄り集まる（「木」「森」「林」が隣どうしに並ぶ）
- 🔍 **漢字へジャンプ** — 「愛」など1字を入力すると、カメラがその漢字まで飛ぶ
- 💬 **意味で検索** — 「love」など英単語を入力すると、一致する漢字がいっせいに発光する
- ⭐ **星をタップして詳細** — 音読み・訓読みと意味を表示
- 🎚️ **種類でフィルタ** — 常用漢字だけ／人名用漢字だけに絞り込む

ブラウザだけで動きます。インストール不要・登録不要。どの漢字にも専用の共有リンク（`?k=愛`）があります。

---

<sub>📦 ここから下は、プロジェクトを動かす・作り直す開発者向けの説明です。</sub>

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

## ライセンス

本プロジェクトは2つのライセンスで構成されています。

- **アプリケーションコード** — [Apache License 2.0](LICENSE)
- **生成データ**（`public/data/`） — [CC BY-SA 4.0](public/data/LICENSE)。漢字の意味・音訓読みは [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) 辞書ファイル（[電子辞書研究開発グループ (EDRDG)](https://www.edrdg.org/edrdg/licence.html) の所有物）に由来し、同グループのライセンスに従って利用しています。データを再配布する場合は、この出典表示を保持し CC BY-SA 4.0 を継承する必要があります。

Embedding モデル [all-mpnet-base-v2](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)（Apache-2.0）はデータ生成（ビルド時）にのみ使用し、再配布はしていません。
