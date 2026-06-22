# プロモ動画 撮影・編集ランブック

Kanji-Verse の `?demo=1` シネマティックモードから、Product Hunt / X 用の動画を作るための詳細手順。
環境前提: **Windows + WSL2**。アプリは WSL2 で配信し、**Windows 側のブラウザ/OBS で録画**する（localhost は WSL2→Windows に自動転送）。

---

## 0. 配信（WSL2 側）

```bash
npm run build
npx vite preview --port 4173
```

Windows のブラウザで疎通確認（末尾スラッシュ必須）:
- 単発のきれいな1サイクル: `http://localhost:4173/kanji-verse/?demo=1`
- ループ（X 用・アトラクト）: `http://localhost:4173/kanji-verse/?demo=1&loop=1`

> ソースを編集したら **必ず `npm run build` し直し**てからブラウザをハードリロード（Ctrl+Shift+R）。preview は `dist/` の静的配信なので、再ビルドしないと反映されない。

### タイムライン（現状: master = `T_END` 秒 / cinematic.ts の定数で変わる）
| 時間 | 内容 |
|---|---|
| 0〜`WELCOME_HIDE`(3.5s) | ウェルカム（タイトルカード）表示 → フェードアウト |
| 〜`T_EST`(5s) | 銀河全体をゆっくり回す掴み |
| `T_EST`〜`T_SEARCH` | 検索に `love` を自動入力 → 一致漢字が緑に発光 |
| `T_SEARCH`〜`T_DIVE` | `愛` へダイブ（漢字グリフが浮かぶ） |
| `T_DIVE`〜`T_HOLD` | 詳細パネルで読み・意味 |
| `T_HOLD`〜`T_END` | 引きで全体像へ（ループ継ぎ目=冒頭） |

---

## 1. 目標サイズ（先に決める）

| 用途 | 解像度 | 比 | 尺の目安 |
|---|---|---|---|
| Product Hunt（ギャラリー動画 / YouTube埋め込み） | **1920×1080** | 16:9 | 1サイクル（〜25s） |
| X フィード（正方形が占有面積大でおすすめ） | **1080×1080** | 1:1 | 15s ループ |
| X 横 | 1280×720 or 1920×1080 | 16:9 | 15s ループ |
| （任意）Shorts/Reels | 1080×1920 | 9:16 | 15s |

> `R_WIDE` は画面比から自動算出（縦長ほど引く）ので、**録画ウィンドウの比率を目的に合わせれば**構図は自動で収まる。

---

## 2. 録画 — 方法A: OBS Studio + ブラウザソース【推奨・ピクセル正確】

OBS の **ブラウザソース**は内部の Chromium で URL を直接描画する。OS のウィンドウ枠・DPI 拡大・コンポジット干渉が無く、指定解像度で 1:1 のきれいな映像が録れる。Intel UHD 620 なら QuickSync で軽くエンコードできる。

### 2-1. OBS の映像設定（設定 → 映像）
- 基本（キャンバス）解像度 = 出力（スケーリング）解像度 = **目的のサイズ**（例 1920×1080、X なら 1080×1080）
- 縮小フィルタ: **ランチョス**
- FPS: **60**

### 2-2. ブラウザソースを追加（ソース → ＋ → ブラウザ）
- URL: `http://localhost:4173/kanji-verse/?demo=1`（X ループなら `&loop=1`）
- 幅 / 高さ: **キャンバスと同じ**（1920×1080 など）
- カスタム FPS を使用: ON → **60**
- 「表示されていないときにソースをシャットダウン」: **OFF**
- 「シーンがアクティブになったらブラウザを更新」: **OFF**（更新は手動で行う）
- カスタム CSS は既定のまま（背景透過。アプリ側が `#05050f` を描くので問題ない）

### 2-3. 出力設定（設定 → 出力 → 出力モード: 詳細 → 録画タブ）
- 録画フォーマット: **mkv**（途中でクラッシュしても安全。後で mp4 にリマックス）
- 映像エンコーダ:
  - **QuickSync H.264**（あれば。CPU 負荷が軽い）→ レート制御 ICQ、品質 18 前後
  - もしくは **x264** → レート制御 **CRF=16〜18**、CPU プリセット `veryfast`〜`faster`、プロファイル high、キーフレーム間隔 2s
- グラデの banding を避けたいので**ビットレートはケチらない**（CRF16 推奨）。8bit/yuv420 で十分。

### 2-4. きれいな1サイクルを録る
1. ブラウザソースを読み込むと初回テクスチャ生成で **約14秒**は黒/ロード。プレビューに**ウェルカムが出る**まで待つ。
2. 余裕を持って録画を回す: 録画開始 → **40〜60秒**回す（最低でもウェルカム→…→引き が1周入る尺）→ 停止。
   - ループ運用（`&loop=1`）なら 25s ごとに繰り返すので、後段で「ウェルカム開始」から 25s を切り出す。
   - 1周だけ正確に欲しいなら、ソース右クリック →「更新」で先頭に戻せる（再び14秒ロードあり）。
3. mkv → mp4 リマックス（無劣化）:
   ```bash
   ffmpeg -i recording.mkv -c copy raw.mp4
   ```
- マウスカーソルはブラウザソースには映らない（気にしなくてよい）。

---

## 2'. 録画 — 方法C: ブラウザだけで完結（OBS不要・キャンバス直録り）

DevTools コンソールに貼るだけ。`canvas` のバックストアをそのまま録るので**ピクセル正確**（OS 合成を介さない）。出力は webm → ffmpeg で mp4 化。

### サイズの決め方（重要）
レンダラは `innerWidth×innerHeight × DPR(最大2)` で描く。**確実に目的解像度にする**には DevTools のデバイスツールバー（Ctrl+Shift+M）で:
- 「レスポンシブ」で **幅×高さ = 目的のCSSサイズ**を入力
- **DPR=1** にする（カスタムデバイス追加 or DPR欄）→ バックストア = そのままの px

例: 1080×1080 / DPR1 → 1080×1080 で録れる。

### コンソールに貼る録画スニペット
```js
(() => {
  const c = document.getElementById('canvas');
  const stream = c.captureStream(60);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 50_000_000 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = 'kanji-verse.webm'; a.click();
  };
  window.__rec = rec; rec.start();
  console.log('REC start. 止めるには __rec.stop()');
})();
```
ウェルカムが出た瞬間に開始したいので、リロード→ウェルカム表示を確認→上を実行、25秒後に `__rec.stop()`。
webm → mp4:
```bash
ffmpeg -i kanji-verse.webm -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart raw.mp4
```

> 方法A/C いずれも**実時間キャプチャ**。UHD 620 で 1080p60 がカクつくなら、解像度を 720p に下げる / FPS を 30 にする / Bloom 負荷を確認。どうしても無理なら最終手段として「固定タイムステップのオフライン連番レンダ」へ発展（cinematic.ts は dt 注入で駆動しているため拡張容易）。

---

## 3. 仕上げ（ffmpeg）

`raw.mp4` の中で**ウェルカムが出始める時刻**を確認し、そこを起点に切り出す（例では 00:00:12）。

```bash
# 1サイクル(25s)をきれいに切り出し（PH 用）。-ss を -i 前に置くと高速シーク。
ffmpeg -ss 00:00:12 -i raw.mp4 -t 25 -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart cycle.mp4

# X 用 15秒
ffmpeg -ss 00:00:12 -i raw.mp4 -t 15 -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart x15.mp4

# BGM を付ける（末尾2秒フェードアウト＋ SNS標準ラウドネス -14 LUFS に正規化）
ffmpeg -i x15.mp4 -i bgm.mp3 \
  -filter_complex "[1:a]afade=t=out:st=13:d=2,loudnorm=I=-14:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" -c:v copy -shortest x15_bgm.mp4

# テロップ（下部にタグライン）。フォントは Windows 同梱を流用可。
ffmpeg -i x15_bgm.mp4 -vf \
  "drawtext=fontfile=/mnt/c/Windows/Fonts/segoeui.ttf:text='2,785 kanji, arranged by meaning':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=h-110:alpha=0.92" \
  -c:a copy final_x15.mp4

# 16:9 素材から中央正方を切り出したいとき
ffmpeg -i cycle.mp4 -vf "crop=ih:ih" -c:a copy square.mp4

# README 用: 無音ループ webp（軽量・高画質）
ffmpeg -i x15.mp4 -vf "fps=24,scale=900:-1:flags=lanczos" -loop 0 -an demo.webp

# README 用: GIF（パレット最適化で色を保つ）
ffmpeg -i x15.mp4 -vf "fps=18,scale=720:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i x15.mp4 -i palette.png -lavfi "fps=18,scale=720:-1:flags=lanczos,paletteuse" demo.gif
```

---

## 4. プラットフォーム書き出し仕様（変わりうるので最新も確認）

### Product Hunt
- ギャラリー先頭はサムネ画像（**1270×760** 16:9 推奨）。動画は **YouTube/Vimeo/Loom リンク埋め込み**が確実。
- 動画は 1920×1080 / H.264 / mp4（`+faststart`）。長さは 30〜60s 目安。冒頭3秒で掴む（0sからきれいな銀河＋タイトルカードが出るのでそのまま頭出しに使える）。

### X（Twitter）
- mp4 / H.264 High / 音声 AAC。FPS ≤ 60。フィードは **1:1（1080×1080）** か 16:9（1280×720〜1920×1080）。
- 長さは短尺ループ推奨（〜15s）。ビットレート 6〜10Mbps 程度で十分きれい。
- ループ素材は `?...&loop=1` の1サイクルを切り出す。継ぎ目は冒頭と一致する設計。

---

## 5. BGM の入手とレベル
- 無料/商用可: YouTube オーディオ ライブラリ、Pixabay Music、Uppbeat（クレジット条件確認）。Epidemic Sound 等は契約があれば。
- アンビエント/シネマティックな静かな曲が銀河の世界観に合う。`loudnorm=I=-14` で SNS 標準ラウドネスに合わせる。

---

## 6. チューニング（cinematic.ts 冒頭の定数）
- `SEARCH_WORD` / `DIVE_KANJI`: 見せ語とダイブ先（既定 `love` / `愛`）。
- `WELCOME_HIDE`: タイトルカードを消す時刻。
- `T_EST / T_SEARCH / T_DIVE / T_HOLD / T_END`: 各ビートの尺。
- `R_CLOSE` / `ROT_SPEED` / `PHI0` / `THETA0`: 寄りの距離・回転速度・見下ろし角・初期方位。
- 広角半径 `R_WIDE` は画面比から自動算出。

---

## 7. 当日チェックリスト
- [ ] `npm run build` → `npx vite preview --port 4173`、Windows で URL 疎通
- [ ] 録画ウィンドウ/キャンバス = 目的解像度、DPR=1（方法C時）、60fps
- [ ] ウェルカム表示を待ってから録画（テクスチャ生成14s）
- [ ] 1サイクル＋αを録画 → mkv→mp4 リマックス
- [ ] ffmpeg で切り出し・BGM(-14LUFS)・テロップ・`+faststart`
- [ ] 各プラットフォーム仕様で書き出し、実機（スマホ）で見え方確認
