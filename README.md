# Kanji-Verse

*English · [日本語](README.ja.md)*

A starfield-like 3D visualization of the kanji usable in Japanese names (2,136 Jōyō + 649 Jinmei = 2,785 characters), arranged so that characters with similar meanings sit close together.

https://mu-777.github.io/kanji-verse/

Kanji with related meanings cluster together in space (e.g. 木 "tree", 森 "forest", and 林 "woods" end up near each other).

## Features

- ~2,800 kanji placed in 3D space by semantic similarity (AI embeddings + UMAP 3D)
- Drag to rotate, scroll to zoom, and freely explore (an intro zoom plays on load)
- Click a star (kanji) to see its on'yomi / kun'yomi readings (with romaji) and meanings
- One search box, two modes:
  - Type a kanji → the camera flies to that character (e.g. `愛`)
  - Type English → kanji whose meanings match light up (e.g. `love`)
- Toggle filters for Jōyō and Jinmei kanji
- URL sharing: opening `?k=愛` jumps straight to and selects that kanji
- A welcome overlay on first visit, plus an ⓘ button (bottom-right) that reopens an About / controls / analytics-disclosure board

---

## Tech stack

- **Rendering**: [Three.js](https://threejs.org/) (point cloud + UnrealBloomPass glow)
- **Dimensionality reduction**: UMAP (768-dim meaning vectors → 3D coordinates)
- **Build**: Vite + TypeScript
- **Data generation**: Python (SentenceTransformer / UMAP / scikit-learn)
- **Hosting**: GitHub Pages (auto-deployed via GitHub Actions)

---

## Setup

### Prerequisites

- [nvm](https://github.com/nvm-sh/nvm)
- [uv](https://docs.astral.sh/uv/) (Python package manager — only needed to regenerate data)

### 1. Generate the data (first time only)

This fetches kanji meanings and readings from KanjiDic2 and runs them through
Embedding → UMAP (3D) → K-means to produce `public/data/kanji-3d.json`.

```bash
cd scripts
uv sync                       # create the virtual env and install dependencies
uv run python generate_data.py
```

**Rough timings:**
- Installing dependencies + downloading the model (first time only): 5–10 min
- Embedding computation (2,785 characters): 1–3 min
- UMAP + K-means: 1–2 min

When it finishes, `public/data/kanji-3d.json` (~400 KB) is generated.
(The generated data is already committed to the repo, so you can skip this step if you just want to view the app.)

### 2. Run the web app

```bash
# back to the project root
cd ..
nvm install   # install the version from .nvmrc (first time only)
nvm use       # switch to it
npm install
npm run dev
```

Open **http://localhost:5173/kanji-verse/** in your browser.

> **The trailing `/kanji-verse/` is required** (it's the `base` setting in `vite.config.ts`). Without it the page won't load.
>
> The dev server can be slow on the first load (especially under WSL2 with the project on `/mnt/c`). For a quick, stable preview, `npm run build` → `npm run preview` is faster.

---

## Deploying to GitHub Pages

Pushing to the `master` branch triggers GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)),
which builds and deploys automatically.

### Required configuration

- **Base path**: set `base: "/kanji-verse/"` in `vite.config.ts` to match your repository name
- **Pages source**: in the GitHub repo, Settings → Pages → Source → **"GitHub Actions"**
- **Generated data**: commit `public/data/kanji-3d.json`, since it's part of the build output

```bash
git add public/data/kanji-3d.json
git commit -m "update kanji data"
git push origin master
# → GitHub Actions builds and deploys automatically
```

> The public site uses Google Analytics (GA4) to understand usage trends. No personal data is collected.

---

## Directory layout

```
kanji-verse/
├── scripts/
│   ├── pyproject.toml          # Python dependency definitions
│   ├── generate_data.py        # data generation (KanjiDic2 → Embedding → UMAP 3D → K-means)
│   ├── generate-ogp.mts        # OGP image generation
│   └── generate-favicon.mts    # favicon generation
├── src/
│   ├── shared/                 # types / data loader / UI / romaji conversion
│   ├── three-core/             # shared Three.js modules
│   │   ├── scene.ts            #   scene & renderer
│   │   ├── camera.ts           #   camera control (intro zoom / flyTo)
│   │   ├── points.ts           #   kanji point cloud
│   │   ├── composer.ts         #   post-processing (UnrealBloom)
│   │   ├── interaction.ts      #   hover / click / search
│   │   └── proximity-label.ts  #   labels shown when zoomed in
│   └── three-3d/
│       └── main.ts             # entry point for the root index.html
├── public/
│   └── data/
│       └── kanji-3d.json       # generated data (must be generated & committed)
├── index.html
├── vite.config.ts
└── package.json
```

## How the data works

```
KanjiDic2 (free XML)
  ↓ extract English meanings and on/kun readings (Jōyō: grade 1-6,8 / Jinmei: grade 9)
SentenceTransformer (all-mpnet-base-v2)
  ↓ generate 768-dimensional meaning vectors
UMAP (3D, cosine)
  ↓ reduce to 3D coordinates, normalized to [0,1]
K-means (k=20)
  ↓ cluster in 3D space → store a cluster ID per kanji
kanji-3d.json (~400 KB)
  ↓ loaded in the browser
rendered with Three.js + UnrealBloom
```

Each entry has `k` (kanji), `m` (meanings), `on`/`kun` (readings), `x`/`y`/`z` (3D coordinates),
`t` (0 = Jōyō / 1 = Jinmei), and `c` (cluster ID — generated but not currently used for rendering).
The closer two kanji are in meaning, the closer they sit in space.
