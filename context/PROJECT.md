# プロジェクトコンテキスト

## 最終更新
2026-06-26（検索タイトル書き換え対策: h1=title 一致 ／ ソーシャル動画シェア, ADR-0010+0011 ／ インタラクティブBGM, ADR-0009 ／ SEO, ADR-0008）

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

## プロモ動画用シネマティックモード（2026-06-22 追加）
- `?demo=1`（任意 `&loop=1`）で起動すると、UI 操作を無効化しカメラを自動操縦して約24秒の演出タイムラインを再生する（ヒーロー→`love`意味検索の発光→`愛`へダイブ→詳細表示→引き）。動画キャプチャ用。
- 実装は `src/three-3d/cinematic.ts` に隔離。`main.ts` は `?demo=1` 時のみ `startCinematic` を呼び、通常起動の挙動は一切変えない。OrbitControls を無効化し球座標キーフレームでカメラを駆動、検索は実 UI に文字を打ち込んで発火させる「本物のUI」駆動。
- 撮影・編集手順は `context/promo-capture-guide.md`（OBS 設定・各比率・ffmpeg）。チューニングは cinematic.ts 冒頭の定数。
- 注意: ラベル（漢字グリフ）表示は **原点からのカメラ距離 < 2.5**（`proximity-label.ts` の `LABEL_FAR`）で決まる。ヒーロー/検索は半径 > 2.5 に保ちラベルを消し、ダイブで初めて出す設計にしている。

## インタラクティブBGM（2026-06-24 追加, ADR-0009）
3層構成（すべて `src/three-core/audio.ts` に隔離・**依存ゼロ／Web Audio API のみ**。Tone.js 不採用＝必要な生成（パッド合成・ベル・旋律ウォーク）は素の Oscillator で足り、ライブラリ重量が不要）。
- **ベッド**: 単一音源 `public/audio/bgm.mp3`（**Gemini 生成**, 温かい脈動アンビエント, 192kbps / 約2:48 / 3.9MB。ライセンス問題なしとユーザー確認）をループ。操作度合い（`energy`）で lowpass cutoff／音量を動かし全体の緩急（操作中＝明るく前に／放置＝沈む）。
- **ドラッグ層(space)**: カメラ運動の速さ（`camera.getSpeed()`→`motion`）に連動する浮遊パッド（基音＋5度＋オクターブ＋上倍音）＋薄い空気ノイズ＋ゆっくり揺れる LFO。**非対称エンベロープ**で立ち上がりは即応・止めたら約1.4秒かけて減衰（急に切れない）。
- **クリック層(glass)**: 漢字選択のワンショット（非整数倍音のガラスベル＋合成IRリバーブの余韻）。ピッチは「**視点（カメラ）から漢字までの距離**」を音域バイアスにした**ペンタトニック旋律ウォーク**で決定（連続で同じ音にせず、クリックするほど小さなメロディに）。距離計算はクリック時1回のみ＝描画ループ非依存。
- **既定はミュート**。右下 `#sound-btn`（`#info-btn` 左隣）と welcome の `#welcome-sound` トグルで ON/OFF（同期, `localStorage(kv_sound)`）。ON にした時点で初めて遅延ロード（起動を汚さない）。`AudioContext` はジェスチャ内で resume、タブ非表示でダッキング＋suspend。
- `?demo=1`（プロモ）では **BGM 自動 ON**（pref は汚さない）。`cinematic.ts` で `#sound-btn` を非表示。
- 音色は反復チューニングの末に確定（途中 `?audiolab=1` の聴き比べパネルを使ったが**撤去済み**）。チューニングは `audio.ts` 冒頭の定数（`IDLE/ACTIVE_CUT`・`DRAG_*`・`MOTION_*`・`PENTA`・`BASE_VOLUME`）。
- 共有クリップ（ADR-0011）の音声は**この生成音ではなく**録画専用 mp3（`public/audio/share-clip.mp3`）を使う。ライブの Web Audio をオフライン再現しないための割り切り。

## ソーシャル動画シェア（2026-06-25 追加, ADR-0010 → エンコーダは ADR-0011 で WebCodecs に刷新）
- 漢字の詳細パネルの **Share ボタン**から、選択漢字へ自動で寄る**約7秒**のシネマティック・クリップ（1:1 / BGM入り / ワードマーク＋ディープリンクURL を焼き込み / **終端1.4秒フェードアウト**）を**アプリ側で生成**し、モバイルの **Web Share API でワンタップ共有**する。動画"ファイル"を投稿メディアとして渡すのでフィードで動画が再生される（ダウンロード不要）。**バックエンド不要＝ランニングコスト0**。尺は処理時間とのトレードオフで 10秒→7秒に短縮（動きの比率は維持、`share-clip.ts` 冒頭で調整可）。
- **2タップ方式**: ①Share→「生成中(%)」→ ②プレビューの Share ボタン（新しいタップ）で `navigator.share`。`navigator.share` は直近のユーザー操作内でしか呼べないため。デスクトップ等 `canShare(files)` 不可の環境は「保存＋X投稿画面」へフォールバック。
- **生成方式は WebCodecs オフライン（ADR-0011）**: 1フレームずつレンダリング→`VideoEncoder`(H.264, **CFR30 / 1秒ごとキーフレーム**)、音声は録画専用 `public/audio/share-clip.mp3` を decode→ループ＋終端フェード→`AudioEncoder`(AAC)、`mp4-muxer`(fastStart=in-memory) で MP4 に多重化。これで「リアルタイム MediaRecorder の 12fps カクつき・単一キーフレーム・A/V長不一致(Windows終端エラー)」を一掃。Android でも MP4 確定。
- 実装: `src/three-core/recorder.ts`（`encodeClip()`／`clipEncodingSupported()`。透かしは静的オフスクリーンを1回描いて drawImage）、`src/three-3d/share-clip.ts`（**絶対時刻 `apply(t)/fadeAt(t)`** の可逆ディレクター。dispose で通常操作へ完全復帰）、`main.ts`（生成中は `generating` で通常ループ停止＋進捗%）。
- demo（`?demo=1`）/ WebCodecs 非対応環境では Share ボタンを隠す（フォールバックの MediaRecorder は持たない）。チューニングは `share-clip.ts`（尺・フェード・半径・周回）/ `recorder.ts`（解像度・ビットレート・透かし）の冒頭定数。`share-clip.mp3` は差し替え可能。
- **未検証（実機）**: 生成 MP4 の各実機での Web Share→動画添付。次の検証で、生成→DL したファイルを ffprobe で CFR/キーフレーム間隔/A-V 同尺を客観確認する。IG は汎用共有シート経由が不安定で best-effort（X/LINE が対象）。

## 主要な決定事項
- ADR-0001: Embedding モデルとして `all-mpnet-base-v2`（英語特化）を採用
- ADR-0002: 2D/3D 座標を事前計算してJSONに焼き込む方式
- ADR-0003: マルチページ Vite 構成で複数バリアントを並列デプロイ → **ADR-0004 で廃止**
- ADR-0004: 比較完了によりテスト用バリアントを削除し three-3d 単一構成に確定
- ADR-0005: Google アナリティクス(GA4 `G-E6F07KS3MG`)導入。プライバシー開示は右下 ⓘ の info ボードに集約（welcome と意匠を `.kv-*` 共通クラスで共有。常時表示の zoom-hint は廃止し操作ヒントも info へ統合）
- ADR-0006: デュアルライセンス採用。コード = Apache-2.0（`LICENSE`）/ `public/data/` のデータ = CC BY-SA 4.0（`public/data/LICENSE`）。KanjiDic2(EDRDG) が CC BY-SA 4.0 で出典表示+継承を要求するため。info ボードに出典謝辞を常設し EDRDG の画面表示要件を満たす
- ADR-0007: welcome ボードを毎回表示（demo 除く）。`localStorage`(`kv_welcomed`) による初回限定ガードを撤去。再訪ユーザーにも操作ヒントを届け discoverability を安定させる（ADR-0005 の「初回のみ」前提を更新）
- ADR-0009: インタラクティブBGM。Web Audio API のみ（Tone.js 不採用）。ベッド(Gemini 生成 mp3 ＋ energy 緩急)＋ドラッグ層(space: motion 連動・非対称減衰)＋クリック層(glass: 視点距離→ペンタトニック旋律ウォーク)の3層。既定ミュート＋ジェスチャ解錠＋遅延ロード。demo は自動 ON
- ADR-0008: 検索インデックス対策。`public/sitemap.xml` 追加＋`index.html` に canonical/`<meta name="robots">`/JSON-LD/sr-only `<h1>`/`<noscript>` を追加し `lang`/`og:locale` を英語に整合。**project直下の robots.txt は不採用**（サブパスでは無効）。デッドな `public/_config.yml`（jekyll-sitemap, Actionsデプロイでは動かない）を削除。最終的な発見性は GSC でのインデックス登録リクエスト（ユーザ操作, 未実施）で確定
- ADR-0010: ソーシャル動画シェア。選択漢字のシネマティック(1:1/BGM入り/透かし)をアプリ側生成し、モバイルの Web Share API で動画ファイルを直接共有（コスト0・バックエンド不要）。2タップ方式（activation 対策）。**エンコーダ方式は ADR-0011 で刷新**
- ADR-0011: 共有クリップのエンコーダを WebCodecs オフライン生成に刷新（ADR-0010 の MediaRecorder を superseded）。CFR30＋定期キーフレーム＋A/V同尺で、12fpsカクつき・Windows終端エラー・Android MP4不可を一掃。音声は録画専用 mp3 を AAC 合成（`audio.ts` のキャプチャAPIは撤去）。非対応端末は Share 非表示
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

## ライセンス（2026-06-22 整備, ADR-0006）
- **デュアルライセンス**: コード = Apache-2.0（ルート `LICENSE`）/ 生成データ `public/data/` = CC BY-SA 4.0（`public/data/LICENSE`、データと同梱）。
- 理由: データソース KanjiDic2 が EDRDG の CC BY-SA 4.0。**BY（出典表示）+ SA（継承）** が義務。`kanji-3d.json` は意味・読みを含む派生物のため SA 対象。
- 画面表示義務は info ボード（About 相当）の出典謝辞で充足（`index.html`、ビルド出力で確認済み）。
- 注意: 新たなデータソースを足す時は BY/SA 互換性を都度確認。`LICENSE` の権利者表記は暫定「Kanji-Verse contributors」。

## ファイル構成（主要）
```
src/
  shared/          # 型定義, データローダー, UI共通処理, romanize
  three-core/      # Three.js 共有モジュール（scene/camera/points/composer/interaction/proximity-label）
  three-3d/        # Three.js 3D バリアント（ルート index.html のエントリ）
```

## 現在の課題・未解決事項
- **ソーシャル動画シェア（ADR-0010/0011）: モバイル実機で確認OK（2026-06-26）**。スマホで「漢字選択→Share→生成→プレビュー→Share→共有シートにX/LINEで動画添付（DL不要）」が快適に動作。生成は約7秒クリップ＋**生成時のみ 1080² 正方形レンダリング＋`latencyMode:"realtime"`** で高速化済み（従来はウィンドウ全体×DPRを描いて中央クロップしていて重かった）。録画用 `public/audio/share-clip.mp3` は仮（bgm 抜粋）で要差し替え検討。
- **【既知の課題・保留】デスクトップの Web Share が遅い／実用性が低い（2026-06-26 記録、当面このまま）**: デスクトップ(Windows)では、プレビューの Share を押すと **OS ネイティブ共有シート（白いウインドウ）が出るまで 4〜5秒、共有先アプリが出揃うまで ~10秒**かかる。原因は **Windows のOS共有ダイアログが共有先アプリを列挙するのが遅い**こと（OS側の挙動でこちらのコードでは速くできない／ファイルサイズ無関係）。加えて**デスクトップの共有シートには X/Instagram が並ばず SNS 投稿には実用にならない**。モバイルは一瞬で X/LINE に直行でき問題なし。**直すときの方針**: 非タッチ環境（`navigator.maxTouchPoints === 0` または `!matchMedia('(pointer: coarse)').matches`）では `navigator.share` を呼ばず、最初から **Download＋X投稿画面(intent)直行**に切り替える。モバイルは現状のネイティブ共有を維持。実装ポイントは `src/three-3d/main.ts` の `showSharePreview()` 内 `canShareFiles` 分岐。
- **検索インデックス: ユーザ操作が未実施（最重要の残作業）**。コード側の器（sitemap/meta robots/JSON-LD等, ADR-0008）は整備済み。あとは ① Google Search Console に `https://mu-777.github.io/kanji-verse/` をURLプレフィックスで登録 → 所有権確認（`public/` に確認用HTMLを置く方式が楽）→ URL検査でインデックス登録リクエスト → sitemap 送信、が必要。これをやるまで Google には載らない見込み。ブランド名 "Kanjiverse" は `kanjiverse.com`（既存商用）と競合し指名検索は不利。
- **検索結果のタイトル/サイト名表示（2026-06-26 調査・一部対応）**: 検索結果が見出し「explore ~2800 …」（"Kanji-Verse —" が剥がれた）＋サイト名「GitHub Pages documentation」になっていた。原因は別々の2点で、(a) タイトルリンクのブランド除去（Google の書き換え。`Brand — 説明`の先頭ブランドが剥がれやすい）、(b) サイト名はドメイン単位で1つ＝**サブディレクトリ `/kanji-verse/` では制御不能**（独自ドメイン化が唯一の手段、本件はやらない方針）。**対応済み**: sr-only `<h1>` を `<title>` と完全一致に変更（書き換え抑止の最有力レバー）。**未対応/受容**: サイト名は構造的に変えられないため受容。タイトルは70字で末尾 truncation の可能性ありだが先頭ブランドの可視性には無害なので現状維持。**残作業**: 反映確認＝GSC でのインデックス登録リクエスト（上項と同じユーザ操作）。詳細は learnings.md（2026-06-26）。
- **ローカルビルドが `vite-plugin-compression` 段階で ENOMEM（exit 1）**: WSL2 `/mnt/c` 9P のメモリ起因（learnings.md 2026-06-21 系）。コアビルド（生JS/HTML/sitemap）は成功しており、CI(ubuntu)では発生しない。なお GitHub Pages は配信時に独自gzipするため事前圧縮 `.gz/.br` は実配信に使われず、この圧縮プラグイン自体がこのデプロイ先では実益が薄い（整理候補）。
- **初期ロードが遅い（本番でも ~16秒）**: 起動時に2,785漢字のテクスチャを全数先行生成している（実測 約14秒, `src/three-core/proximity-label.ts`）。JSON ロードは無関係（402KB / ~0.4秒）。ラベルはズームイン時のみ表示されるため遅延生成すればほぼ0秒にできるが、2026-06-21 時点でユーザー判断により実装は見送り。詳細は learnings.md（2026-06-21）参照。
- **dev サーバが `/mnt/c` 上で遅い**: WSL2 が Windows ドライブを 9P 越しに読むため、Vite のコールド最適化・モジュール変換が極端に遅い（初回数十秒）。根本対策は WSL2 ネイティブFS（`~/...`）への移設。
- GitHub Pages デプロイ設定（base: "/kanji-verse/"）は仮。リポジトリ名に合わせて要変更
- `scripts/generate-ogp.mts` は現行の `public/ogp.png` を再現しない（コミット版は `bold 64px IPAGothic`・和文サブタイトルだが、実画像は Inter ExtraLight の大文字「KANJI-VERSE」＋横罫＋英語タグライン）。画像は別バージョンで生成されたままスクリプトが更新されていない。OGP を作り直す際は要同期。なお参照データは 2026-06-21 に kanji-3d.json（x,y 平面）へ変更済みのため、再生成時の星空配置は旧 2D とは異なる。
- ~~README.md が旧 2D Canvas アプリの記述のまま陳腐化~~ → 2026-06-22 に現状の 3D 単一構成（Three.js + UMAP 3D + K-means、`kanji-3d.json`、デプロイは `master` ブランチ、URL末尾 `/kanji-verse/` 必須など）へ全面更新済み。
- **GA に localhost のテストアクセスが計上される**（ADR-0005。ガード不要の判断）。dev/preview での動作確認分も混ざるため、GA の数値は実数でなく傾向として扱う。気になったら GA4 の「内部トラフィック除外」フィルタで後から対処可能。
- **README が「K-means クラスタ20分類を色分け」を機能として記載しているが未実装**（2026-06-22 発見）。データ `node.c` と型定義はあるが `points.ts` は常用=青白/人名=金の2色＋ハイライトしか描画していない。クラスタ色分けを実装するか、README から当該記述を外すか、いずれか要対応。

## スコープ外（明示的にやらないこと）
- ノード間のエッジ表示
- ブラウザ上でのリアルタイムEmbedding計算
- 漢字の読み情報の表示（詳細パネルには表示するが検索には使わない）
