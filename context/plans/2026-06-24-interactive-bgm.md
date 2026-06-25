# 計画: インタラクティブBGM

## 最終更新
2026-06-24

## 目的（ユーザ発言の引用）
> BGMをつけたい。できればインタラクティブに変化するようなもの。シーンを操作しているとき、していないときで緩急をわけるなど。

ヒアリングを経て確定した方向性:
- **ムード**: 温かく漂う“宇宙の憧れ”系メロディック・アンビエント。**和なし／畏怖なし／冷たさなし／ガラス感なし**。常時BGM感が強く、Photosynthesis 的な柔らかい脈動を持つ。
- **音源**: Suno で AI 生成した **静かな脈動ベッド1本**（用意済み）。
- **緩急**: **中間**（基本は一定の常時BGM。操作で「少し明るく・前に出る」がそれとわかる程度）。
- **既定**: ミュート。welcome ボードの「♪ Sound on」で解錠。`localStorage` で記憶。音は遅延ロード。

## 現状把握（フック箇所と制約）

実コードで確認したフック箇所:
- `src/three-core/camera.ts`
  - `controls.addEventListener("start", …)` = **ユーザーがシーンを掴んだ瞬間**（最良の「操作中」シグナル）。`mode="user"` に。
  - `controls.addEventListener("end", …)` = 操作終了 → `mode="inertia"`（慣性減衰）。
  - `mode: "user" | "inertia" | "fly"` と平滑化速度 `thetaVelSmooth/phiVelSmooth/radiusVelSmooth` が既にある。「ユーザー操作」と「自動航行/慣性ドリフト」を区別できる。
- `src/three-3d/main.ts`
  - レンダーループで `updateCamera(dt)` を毎フレーム呼ぶ → ここに `audio.update(dt)` を足せる。
  - welcome ボード（`#welcome` / `#welcome-btn`）の表示・dismiss を管理（demo 時は出さない）。→ **最初のユーザージェスチャ＝解錠点**。
  - 検索（`setupUI` の `search`/`searchByMeaning`）と選択（`interaction.onSelect`/`onFlyTo`）の発火点。
- `src/shared/ui.ts`：検索入力・選択パネル。トグルUIの追加先候補。

制約（Web/本プロジェクト固有）:
- **オートプレイ禁止**：ユーザージェスチャまで音は出せない（`AudioContext.resume()` を gesture 内で）。
- **起動が既に遅い（~16s, テクスチャ生成）**：音は**必ず遅延ロード**し起動をブロックしない。
- **ライセンス厳格（ADR-0006）**：Suno 生成物の商用/帰属条件を確認し明記する。
- **モバイル/iOS Safari**：AudioContext は gesture で resume が必要。
- **タブ非表示**：ダッキング/停止（電池・礼儀）。

## アプローチの選択肢

### 案A: Tone.js でフル生成ハイブリッド（当初案）
- メリット: 生成アルペジオ/ベル・無限変化・データ連動（クラスタ→音）。
- デメリット: **スコープが1本ベッド＋ガラスなしに固まり、生成要素がほぼ消えた**。ライブラリ重量（数百KB）の割に使わない。起動/バンドルに不利。

### 案B: 素の Web Audio API ＋ 単一ベッド ＋ adaptive DSP（採用）
- 構成: ベッドをループ再生し、`energy`（操作の指数減衰スカラー）で **lowpass cutoff ＋ master gain** を駆動。「薄いレイヤー追加」感は**広いフィルタスイープ**（＋任意で並列ブライト送り）で表現。
- メリット: **依存ゼロ・軽量・起動非ブロック**。「中間」の緩急に十分。本プロジェクトの軽量方針と整合。
- デメリット: 1本ループゆえ長時間で飽きの可能性（→ 緩急の動き＋フィルタ変化である程度緩和。足りなければベッド追加 or 軽い揺らぎLFO）。

### 案C: 既成ステム多層レイヤリング
- メリット: 音楽的クオリティ最高。
- デメリット: **音源が1本のみ**の現状と不一致。複数同期stemの調達コスト。

## 決定
**案B（素の Web Audio API ＋ 単一ベッド ＋ adaptive DSP）を採用する。**

理由: 音源1本・ガラスなしで生成要素が薄れた今、Tone.js は過剰。Web Audio のフィルタ＋ゲインで「中間」の緩急は十分表現でき、**依存追加ゼロ＝バンドル/起動に優しい**（既存の起動遅延問題に整合）。将来「操作で脈が速くなる」等の生成的要素が欲しくなったら Tone.js を再検討（ADR に申し送り）。

## 設計詳細

- **モジュール**: `src/three-core/audio.ts`（`cinematic.ts` 同様に隔離。通常起動の挙動を汚さない）。
- **オーディオグラフ**: `AudioBufferSourceNode(loop)` → `BiquadFilterNode(lowpass)` → `GainNode(master)` → `destination`。
  - 任意の「薄いレイヤー」: 同一ソースを並列の `BiquadFilterNode(highshelf/bandpass)` ＋ gain に通し、active 時のみ持ち上げて“ブライトな層が足される”感を出す（**第2音源不要・キー知識不要**）。
- **`energy`（0..1）**: `controls "start"`／wheel／検索／選択で bump し、毎フレーム指数減衰。`mode==="user"` の間は高めに維持。`inertia`/自動航行/`fly` では減衰。
  - `cutoff = lerp(≈600Hz, ≈7kHz, energy)`
  - `masterGain = lerp(idle, active, energy)`（差は控えめ＝中間）
  - パラメータ適用は `setTargetAtTime` で平滑化（段差を出さない）。
- **解錠**: `#welcome-btn` クリック（最初の gesture）で `AudioContext.resume()`。sound が on なら遅延ロード→再生。
- **遅延ロード**: sound を on にした時点で初めて `fetch(public/audio/…)` → `decodeAudioData`。起動をブロックしない。
- **トグルUI**: welcome ボードに「♪ Sound on/off」。常時トグルも用意（info ボード or 右下隅、`#info-btn` 付近）。`localStorage`(`kv_sound`、既定 `off`)。
- **タブ非表示**: `visibilitychange` で master を 0 へランプ（復帰で戻す）。
- **demo（`?demo=1`）**: welcome なし。既定はミュート維持。※プロモ動画用に自動ON化するかは要判断（オプション）。

## 作業ステップ（チェックリスト）
- [ ] 1. 音源を `public/audio/` に配置（web 向けエンコード／サイズ確認、ループ繋ぎ確認）
- [ ] 2. `src/three-core/audio.ts` 実装（グラフ・`energy`・解錠・遅延ロード・トグル・visibility）
- [ ] 3. `index.html` に Sound トグルUI（welcome ＋ 常時トグル）を追加
- [ ] 4. `main.ts` で配線（welcome-btn で解錠／`controls` start・end・wheel／検索・選択で bump／render loop で `audio.update(dt)`）
- [ ] 5. 必要なら `camera.ts` から `mode`/速度を最小限露出（結合を最小に）
- [ ] 6. `localStorage`(`kv_sound`) 永続化
- [ ] 7. Suno ライセンス確認 → アセットのライセンス表記（`public/audio/` にライセンスメモ ＋ info ボードのクレジット、ADR-0006 整合）
- [ ] 8. build + preview で検証

## 検証方法
build + preview（速い・安定）→ Windows 側ブラウザで:
- [ ] 既定でミュート（音が出ない）
- [ ] welcome で Sound on → ループ再生開始・AudioContext unlocked・コンソールに autoplay 警告なし
- [ ] 放置（自動航行）= 暗め・静か／ドラッグ・ズーム・検索・選択 = 明るく前に出る（**中間の緩急がそれとわかる**）
- [ ] リロードで on/off 選択が保持される
- [ ] タブ非表示でダッキング、復帰で戻る
- [ ] 起動時間が悪化しない（音は遅延ロード）
- [ ] 可能ならモバイル/Safari で AudioContext resume を確認
- 自問: **スタッフエンジニアはこれを承認するか？**（依存ゼロ／起動非ブロック／オートプレイ尊重／ライセンス明記）

## 完了後のコンテキスト更新
- ADR-0009: BGM 方式（Web Audio 単一ベッド＋adaptive DSP／AI生成音源／ミュート既定）を記録。
- PROJECT.md: BGM 機能を追記。
- learnings.md: 学びがあれば追記。

## 未確定・要確認（実装前にユーザーへ）
- 音源ファイルの**置き場所/ファイル名/形式/サイズ**（`public/audio/` に何を置くか）。
- Suno の**ライセンス/プラン**（商用利用・帰属の要否）。
- **demo モードで BGM を自動ON**にするか（プロモ動画用）。
