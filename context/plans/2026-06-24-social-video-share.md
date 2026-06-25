# 計画: ソーシャル動画シェア（ワンボタン）

## 最終更新
2026-06-24

## 目的（ユーザー発言の引用）
> ソーシャルシェアの機能をつけたい。動きのビジュアルがいいと思うので、ワンボタンで動画でシェアできるといいと思いつつ、UX的に成立する仕組みにできるか私の中で固まってない。
> - ユーザが自分でブラウザ機能などでスクリーンショット/録画するのではなく、このアプリ側での操作で録画する
> - それをソーシャルシェアできるようにする

合意済みの要件:
- **モバイルメイン**（デスクトップは壊れない程度のフォールバックでよい）
- **ランニングコスト0**（バックエンド不要で実現できるならそれが最良）
- **"動き"はフィードのプレビューで見えてほしい**（＝動画ファイルを投稿メディアとして渡す。リンク+OGPカードは不採用）
- クリップ中身: **選択中の漢字へ自動で寄るシネマティック**
- 比率: **正方形 1:1**
- 音: **BGM入り**

## 現状把握（関連する既存資産・制約）
- レンダリング: `scene.ts` の `WebGLRenderer({ canvas, antialias:true })`（`preserveDrawingBuffer` 無し）。`main.ts` の `animate()` が毎フレーム `composer.render()`（UnrealBloom）→ `proximityLabel.render(renderer)`（ラベル重ね描き）。
- カメラ演出: `cinematic.ts` の `startCinematic()` が球座標キーフレームでカメラを駆動。**ただし流用不可**: 漢字「愛」/語「love」ハードコード、25秒固定、`interaction.dispose()` で操作を恒久無効化、welcome カード前提。→ キーフレーム技法だけ流用し、**選択漢字を引数に取る短い・可逆な専用ディレクター**を新規に作る。
- ラベル（漢字グリフ）は **原点からのカメラ距離 < 2.5（`LABEL_FAR`）** で出る。寄りで初めてグリフが浮かぶ設計。クリップのダイブもこの距離に入れる。
- 音: `audio.ts` は `master.connect(ctx.destination)`。BGM をクリップに載せるには **master からキャプチャ用 `MediaStreamAudioDestinationNode` を分岐**させる小さな追加が要る。既定ミュートなので録画中は一時的に有効化（`persist:false`）してバッファ decode 完了を待つ。
- 詳細パネル: `index.html` の `#detail-panel` ＋ `ui.ts` の `onSelect`。漢字選択時に表示。**ここに Share ボタンを足す**。
- ディープリンク `?k=愛` と `history.replaceState` は既存。シェア文面の URL に使う。
- オーバーレイ作法: `.kv-overlay` / `.kv-board` の共通スタイルあり（welcome / info が共用）。クリップ生成モーダルもこれを再利用。

## 設計上の重要発見（UXを左右する2点）
1. **`navigator.share()` は「直近のユーザー操作（transient activation）」内でしか呼べない。** 録画に約7秒かかると、最初のタップの activation が切れて `share()` が `NotAllowedError` になる。
   → **2タップ方式にする**: ①「Share」タップ → 「クリップ生成中…」（録画7秒）→ ②生成したクリップをモーダル内で**プレビュー再生**し、「Share」ボタンを出す → ユーザーが押す（＝新しい activation）→ 共有シート。プレビューが付くぶん UX はむしろ向上する。
2. **形式は MP4(H.264) を狙う。** iOS Safari の MediaRecorder は標準で MP4 を吐く（◎）。**Android Chrome は webm になる端末があり**、X が webm を嫌う可能性が残る。→ v1 は `MediaRecorder.isTypeSupported('video/mp4;…')` で MP4 優先、ダメなら webm。**Android 実機での MP4 出力可否は実装後に実機検証**し、NG なら WebCodecs での MP4 確定生成にエスカレーション（別タスク）。

## アプローチの選択肢

### 選択肢A: リアルタイム MediaRecorder ＋ 2D合成キャンバス（採用）
録画中、レンダーループ末尾で WebGL canvas を **1080×1080 の 2D canvas へ中央クロップで drawImage**（＝1:1化）し、その上に**透かし（ワードマーク＋ディープリンクURL）を焼き込む**。この 2D canvas から `captureStream(30)` の映像トラック＋ audio の音声トラックを束ねて `MediaRecorder` に流す。
- メリット: 1:1化と透かし焼き込みを**ライブの renderer を変えずに**実現（`scene.ts` を触らない／全ユーザーへの常時コスト無し）。BGM の音声多重化は MediaRecorder が自動。実装が最短。同フレーム内で drawImage するため `preserveDrawingBuffer` 不要。
- デメリット: 実機性能でフレームが荒れうる（点群なのでモバイルでも軽い見込み）。形式が端末依存（上記②）。

### 選択肢B: WebCodecs でオフライン MP4 生成（不採用・将来の保険）
ディレクターを実時計から切り離して1フレームずつレンダリング→ `VideoEncoder`(H.264) ＋ `mp4-muxer` で MP4 確定生成。
- メリット: 端末性能に依存せず滑らか。MP4 を全環境で保証。
- デメリット: 音声は `AudioEncoder`(AAC) で別途エンコードして手動 mux する必要があり、**BGM入り要件だと実装が重い**。WebCodecs は iOS Safari 16.4+ 必要。v1 には過剰。

→ **A を採用**。理由: 要件（モバイル/BGM入り/1:1/コスト0）に最短で噛み合い、ライブ描画と `scene.ts` に副作用が無い。Android で MP4 が出ない問題が実機で確認されたときだけ B へ部分的にエスカレーションする（YAGNI）。

## 透かし（動画に焼き込む情報）
フィードのミュート再生でも「何のアプリか／どこで見られるか」が伝わるよう最小限を焼き込む:
- アプリ名（`Kanji-Verse`、OGP と同じ Inter ExtraLight 風・ワイドトラッキング）
- ディープリンクURL（`mu-777.github.io/kanji-verse/?k=愛` 程度。短く）
- （任意）漢字の英語意味を1語

グリフ自体はシーン内に大きく映るので、文字情報は下部に控えめに。世界観（夜空・グロー）を壊さないトーンで。

## 作業ステップ
- [x] `audio.ts`: `beginCapture/endCapture` を追加（録画中だけ一時有効化＆ロード待ち、`master` を `MediaStreamAudioDestinationNode` へ分岐して音声トラックを返す。終了で原状復帰）。※audiolab で進化した現行版に加算的に実装。
- [x] `share-clip.ts`（新規, three-3d）: 選択ノードを引数に取る**可逆な短尺ディレクター**（約7s, ワイド→ダイブでグリフ出現→ホールド＋周回。dispose で完全復帰）。
- [x] `recorder.ts`（新規, three-core）: 1080² 2D 合成 canvas＋中央クロップ drawImage＋透かし、`captureStream(30)`＋音声トラックで `MediaRecorder`（MP4優先/webm フォールバック）。
- [x] `main.ts`: レンダーループ末尾の合成フック＋Share フローのオーケストレーション（ディレクター開始→録画→停止→復元）。demo/非対応で Share ボタン非表示。
- [x] UI: `#detail-panel` に Share ボタン（`index.html`＋`ui.ts` の `onShare`）。共有モーダル（`.kv-overlay` 再利用）＝「生成中…」→「プレビュー＋Share/Download」。
- [x] シェア実行: `File`(mp4) ＋ `navigator.canShare({files})` → `navigator.share({files, text, url})`。**②タップ目**で呼ぶ。
- [x] フォールバック（デスクトップ/`canShare` 不可）: ダウンロード＋X投稿インテント。
- [x] ドキュメント: ADR-0010 追加 ＋ PROJECT.md 更新。
- [x] 静的検証: `tsc --noEmit` パス、`vite build` パス（30 modules）。
- [ ] **実機検証（残・ユーザー）**: iOS/Android で Web Share→動画添付、Android の MP4 出力可否、黒フレーム有無。

## 検証方法
- [ ] **iOS Safari 実機**: 漢字選択→Share→生成→プレビュー→Share→共有シート→**Xに動画添付された投稿画面**が開く（ダウンロード不要）。投稿後フィードで動画再生＆1:1。BGM がタップ展開で鳴る。
- [ ] **Android Chrome 実機**: 同上。特に **MP4 で出力されるか**を確認（webm なら X 添付可否も確認し、NG なら選択肢B 検討メモを残す）。
- [ ] LINE 共有でも動画が添付されること（X/LINE は対象、IG は best-effort と明記）。
- [ ] 透かし（アプリ名/URL）が読めること、グリフが映っていること（ラベル距離 < 2.5 に入っている）。
- [ ] 録画後に通常操作へ完全復帰（controls 復活、カメラ/ハイライト/音声 mute 状態が元通り、`?demo=1` 等への副作用なし）。
- [ ] デスクトップでフォールバック（ダウンロード＋投稿インテント）が動く。
- [ ] 「スタッフエンジニアはこの成果物を承認するか？」: 副作用ゼロ・可逆・既存世界観と整合・コスト0、を満たすか自問。

## スコープ外
- WebCodecs オフライン生成（Android で MP4 が出ない場合のみ別タスクで検討）
- Instagram への確実な動画添付（汎用共有シートの制約。best-effort）
- デスクトップでの完全ワンボタン動画共有（プラットフォーム制約。フォールバックで対応）
- ライブ録画モード（今回はシネマティック自動生成のみ）
