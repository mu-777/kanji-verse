# ADR-0010: ソーシャル動画シェア（ワンボタン）

## ステータス
accepted

## 日付
2026-06-25

## コンテキスト
- 実現したかったこと: 漢字の「動き」をソーシャルに共有してもらい、発見＝流入につなげたい。
- ユーザーの要求（プロンプト引用）:
  > ソーシャルシェアの機能をつけたい。動きのビジュアルがいいと思うので、ワンボタンで動画でシェアできるといいと思いつつ、UX的に成立する仕組みにできるか私の中で固まってない。
  > - ユーザが自分でブラウザ機能などでスクリーンショット/録画するのではなく、このアプリ側での操作で録画する
  > - それをソーシャルシェアできるようにする
- ヒアリングで合意した要件: **モバイルメイン** / **ランニングコスト0（バックエンド不要が最良）** / **"動き"はフィードのプレビューで見えてほしい** / クリップは選択漢字へのシネマティック / 比率 1:1 / BGM入り。
- 制約: 静的サイト（GitHub Pages）。サーバを持たない。`scene.ts` の renderer は `preserveDrawingBuffer` 無し。`cinematic.ts` は `?demo=1` 専用でカメラを奪い interaction を恒久破棄するため流用不可。ラベル（グリフ）は `camera.position.length() < 2.5` で全数表示（WORLD_SCALE=2.0 で全ノードは原点から最大√3≈1.73）。

## 検討した選択肢

### 選択肢A: リアルタイム MediaRecorder ＋ 2D 合成キャンバス（採用）
録画中、レンダーループ末尾で WebGL canvas を 1080×1080 の 2D canvas へ中央クロップ drawImage（1:1化）し、透かし（ワードマーク＋ディープリンクURL）を焼き込む。この 2D canvas の `captureStream(30)` ＋ BGM 音声トラックを `MediaRecorder` に流す。共有は `navigator.share({ files })`。
- メリット: ライブ描画と `scene.ts` を変えずに 1:1化・透かし・音声多重化を実現（全ユーザーへの常時コスト無し）。同フレーム内 drawImage で `preserveDrawingBuffer` 不要。BGM の mux は MediaRecorder が自動。最短実装。バックエンド不要＝コスト0。
- デメリット: 出力形式が端末依存（iOS=MP4◎ / Android は webm の端末あり）。実機性能で稀にフレームが荒れる。

### 選択肢B: WebCodecs でオフライン MP4 生成（不採用・将来の保険）
1フレームずつレンダリング → `VideoEncoder`(H.264) ＋ `mp4-muxer`。
- メリット: 端末性能非依存で滑らか、MP4 を全環境で保証。
- デメリット: 音声は `AudioEncoder`(AAC) で別途エンコードして手動 mux が必要で、BGM入り要件だと実装が重い。iOS Safari 16.4+ 必須。v1 には過剰。

## 決定
**選択肢A を採用**。Android で MP4 が出ない実機問題が確認された場合のみ、B へ部分的にエスカレーションする（YAGNI）。

UX の要となる発見:
1. **`navigator.share()` は直近のユーザー操作（transient activation）内でしか呼べない**。録画に約7秒かかると activation が切れる。→ **2タップ方式**: ①Share→「生成中」（録画）→ ②プレビューの Share ボタン（新しいタップ）で共有。プレビューが付くぶん UX 向上。
2. **動画"ファイル"を投稿メディアとして渡す**ことで、フィードで動画が再生される（リンク+OGPカードは静止画なので不採用）。モバイルの Web Share はファイルを共有シートへ直接渡す＝**ダウンロード不要**。

## 影響
- 新規: `src/three-core/recorder.ts`（2D合成＋MediaRecorder, MP4優先/webmフォールバック）、`src/three-3d/share-clip.ts`（選択漢字を引数に取る可逆な短尺ディレクター, 約7s, 復帰可能）。
- 変更: `audio.ts` に `beginCapture()/endCapture()`（録画中だけ BGM を一時有効化し master を分岐, pref は汚さない）。`ui.ts` に `onShare`。`main.ts` にオーケストレーション（レンダーループ末尾の合成フック）。`index.html` に詳細パネルの Share ボタン＋共有モーダル＋CSS。
- demo（`?demo=1`）と非対応環境では Share ボタンを隠す（プロモ動画に写り込ませない）。
- ランニングコスト 0 を維持（バックエンドなし）。
- **未検証（実機必須）**: ① iOS/Android 実機での Web Share→動画添付 ② Android の MediaRecorder が MP4 を吐くか ③ 同フレーム drawImage で黒フレームにならないか（なれば `scene.ts` で `preserveDrawingBuffer:true`）。Instagram は汎用共有シート経由が不安定で best-effort、X/LINE が対象。
