# ADR-0011: 共有クリップのエンコーダを WebCodecs オフライン生成にする

## ステータス
accepted（ADR-0010 のエンコーダ選択＝MediaRecorder を superseded）

## 日付
2026-06-25

## コンテキスト
ADR-0010 でソーシャル動画シェアをリアルタイム MediaRecorder＋2D合成キャンバスで実装した。実機（Windows）検証で2つの問題が出た:
- **Windows 標準プレイヤーで終端エラー＋1回しか再生できない**。ffprobe 解析の結果、コンテナ自体は健全（moov 先頭・デコードエラーなし・H.264 Constrained Baseline）だが、**音声(6.84s)が映像(6.52s)より長い A/V 長不一致**が原因と特定（fix1: 音声を映像長にトリムしたらエラー解消をユーザー確認）。加えて **キーフレームが先頭1枚のみ（GOP=全尺）/ 可変フレームレート**という MediaRecorder 特有のクセ。
- **実測 ≒12fps でカクつく**。1080p の H.264 をリアルタイムにエンコードしきれずフレーム落ち（弱い GPU で顕著）。

ユーザー要求（引用）:
> 12fpsのかくつきは気になるので、WebCodecs方式に切り替えたい。音声はアプリのインタラクティブな結果ではなく、録画用のmp3をオフラインで作っておいてそれを割り当てるのでOK

## 検討した選択肢

### 選択肢A: MediaRecorder を維持し A/V 長だけ揃える（不採用）
- メリット: 変更が最小。Windows エラーは直る。
- デメリット: **12fps のカクつきは直らない**（リアルタイムエンコードが根本原因）。VFR/単一キーフレームも残る。

### 選択肢B: WebCodecs + mp4-muxer のオフライン生成（採用）
1フレームずつオフラインでレンダリング → `VideoEncoder`(H.264) でエンコード。音声は**録画専用 mp3**（`public/audio/share-clip.mp3`）を decode → clip 長へループ＋終端フェード → `AudioEncoder`(AAC) でエンコード。両者を `mp4-muxer`（fastStart='in-memory'）で 1本の MP4 に多重化。
- メリット: **CFR 30fps（なめらか）／1秒ごとキーフレーム（シーク・ループ可・Windows 正常）／A/V 同尺（終端エラーなし）**。端末性能から切り離れる（生成に多少時間がかかってもフレームは落ちない）。**Android でも MP4 確定**（ADR-0010 の Android-MP4 リスクも解消）。
- デメリット: recorder.ts の作り直し＋音声のオフライン用意＋依存追加（`mp4-muxer`, wasm なし数KB）。WebCodecs 非対応の古い端末では使えない。

## 決定
**選択肢B を採用**。音声は「アプリの生成音そのまま」ではなく**録画専用 mp3 を事前に用意して割り当てる**方針（ユーザー合意）。これにより、ライブ Web Audio グラフをオフラインに再現する複雑さを排除できる。`audio.ts` に入れていた録画キャプチャ用 API（`beginCapture/endCapture/fadeCaptureOut`）は不要になり**撤去**した。

WebCodecs 非対応ブラウザでは Share ボタンを**隠す**（`clipEncodingSupported()` で判定）。MediaRecorder フォールバックは持たない（劣化した動画を出すより出さない方が良いと判断）。

## 影響
- `src/three-core/recorder.ts`: WebCodecs エンコーダに全面置換。`encodeClip()`（フレーム駆動・透かしは静的オフスクリーンを1回だけ描いて drawImage）と `clipEncodingSupported()` を公開。MediaRecorder/`captureStream` は廃止。
- `src/three-3d/share-clip.ts`: 実時計 `update(dt)` から**絶対時刻 `apply(t)/fadeAt(t)`** に変更（オフライン駆動向け）。可逆性（dispose で復帰）は維持。
- `src/three-3d/main.ts`: 生成中は通常レンダーループを止め（`generating` フラグ）、エンコーダが `renderFrame(t)` で各フレームを描画。進捗% をモーダルに表示。
- `src/three-core/audio.ts`: 録画キャプチャ用 API を撤去（クリップ音声は静的 mp3）。
- 新規アセット `public/audio/share-clip.mp3`（bgm.mp3 から12秒抜粋。差し替え可能）。依存 `mp4-muxer` 追加。
- クリップ尺は約10秒、終端2秒フェードアウト（映像は黒オーバーレイ、音声は PCM 段階でランプ）。寄りのタイミング（1.8→4.3s）は据え置き。
- **未検証**: 生成 MP4 の実機再生（次の検証で、生成→DL したファイルを ffprobe で CFR/キーフレーム間隔/A-V 同尺を客観確認予定）。
