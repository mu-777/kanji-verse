# Learnings

## 2026-03-16: Embedding モデル選定の再考
- **指摘内容**: 最初に提案した `paraphrase-multilingual-mpnet-base-v2` は、入力が英語テキストであるにもかかわらず多言語モデルを選んでいた。ユーザに「他の選択肢を踏まえて判断したのか」と指摘された。
- **一般化**: モデル選定時は入力言語と出力品質のトレードオフを必ず整理してから提案する。「有名だから」ではなく「このユースケースに合っているから」を説明できる状態で提示する。
- **適用範囲**: Embeddingモデル、LLM、ライブラリなど技術選定全般

## 2026-03-16: KanjiDic2 の意味言語フィルターは m_lang 属性を使う
- **指摘内容**: `generate_data.py` で `m.get("{http://www.w3.org/XML/1998/namespace}lang")` （xml:lang）を使って英語のみをフィルターしようとしていたが、KanjiDic2 の意味要素の言語属性は `m_lang` であり、`xml:lang` は存在しない。そのため常に全言語の意味が含まれていた（平均11.7語/字 → 正しくは4語前後）。
- **一般化**: KanjiDic2 の `<meaning>` 要素の言語属性は `m_lang`（省略時は英語）。`m.get("m_lang") is None` で英語のみに絞る。`xml:lang` は別のXML標準であり KanjiDic2 には存在しない。
- **適用範囲**: KanjiDic2 を扱うスクリプト全般。外部XMLデータを扱うときはスキーマ・DTDを確認してから属性名を使う。

## 2026-03-16: スクリプトのパスは実行ディレクトリに依存させない
- **指摘内容**: `generate_data.py` 内のファイルパスを `"scripts/kanjidic2.xml.gz"` のような相対パスで書いたため、`scripts/` ディレクトリから実行するとファイルが見つからないエラーが発生した。
- **一般化**: スクリプト内のファイルパスは常に `__file__` を基準にした絶対パスで定義する。実行ディレクトリに依存する相対パスは使わない。
- **適用範囲**: Pythonスクリプト全般。特にプロジェクト内の特定ディレクトリから実行されることが想定されるスクリプト。

## 2026-06-21: ロード遅延は計測で切り分ける（JSONは無実 / /mnt/c の dev は遅い）
- **背景**: 「ロードに70秒、JSONロードにそんなにかかる?」という問いを実測で調査。
- **判明した原因（実測値, 本番ビルド+実GPU Intel UHD 620）**:
  - JSON fetch+parse(402KB) = **0.4秒**（無実）/ scene setup = 0.15秒 / **テクスチャ生成 = 約14秒** / GPU warmup = 1.2秒 / 合計 約16秒。
  - dev サーバの初回はこれに数十秒上乗せ: WSL2 が `/mnt/c` を 9P 越しに読むため Vite のコールド依存最適化＋モジュール変換が激遅（index.html コールド **46秒** / ウォーム **24ms**）。→ ユーザーが見た70秒 ≈ dev初回オーバーヘッド + テクスチャ生成14秒。
  - テクスチャ生成の中身: 起動時に2,785漢字を1個ずつ canvas に `shadowBlur` 付きで2回 `fillText`（`src/three-core/proximity-label.ts`）。ラベルはズームイン時のみ表示（`camDist < LABEL_FAR`）なのに全数を先行生成している。
- **一般化**:
  1. 「ロードが遅い」は原因（ネットワーク/データ/CPU/GPU/ビルドツール）を決めつけず、フェーズ別に**実測して切り分ける**。
  2. WSL2 では Node プロジェクトを `/mnt/c` 配下に置くと dev サーバが極端に遅い。本来はネイティブFS（`~/...`）推奨。
  3. アプリ実行コストと dev サーバ固有コストの切り分けには、dev ではなく **build + preview（静的配信）** で測る。
- **適用範囲**: WSL2+Vite 等の開発環境全般、パフォーマンス調査全般。
- 関連: 遅延化（テクスチャの遅延生成）は有効な改善策だが、2026-06-21 時点でユーザー判断により実装は見送り。

## 2026-06-21: CJK アイコン生成の勘所（フォント入手 / .ttc 非対応 / 小サイズの潰れ）
- **背景**: favicon（漢字4文字の発光クラスタ）生成時に、CJK フォント入手とラスタライズで詰まった点・調整した点を一般化。
- **学び**:
  1. **WSL2 では CJK フォントを Windows 側から流用できる**。システムに CJK フォントが無くても `/mnt/c/Windows/Fonts/`（游ゴシック `YuGoth*.ttc`、游明朝 `yumin*.ttf`、BIZ UD `BIZ-UD*.ttc`、メイリオ等）が使える。
  2. **opentype.js は `.ttc`（TrueType Collection）非対応**（`Unsupported OpenType signature ttcf`）。グリフをベクターパス化したい場合は **plain `.ttf`** を使う（游明朝 `yumin.ttf` 等）。`.ttc` しかない書体はラスタ（@napi-rs/canvas の `GlobalFonts.registerFromPath`）でしか使えない。
  3. opentype.js v2 の `loadSync` は非推奨で undefined を返す。`opentype.parse(readFileSync(path).buffer.slice(...))` を使う。
  4. **favicon は 16/32px での見えを必ず実測する**。最初は文字を大きく・グロー強めにしたら 16/32px で煙状に潰れた。グリフを少し小さく・重なりを適度に・グローを抑える（shadowBlur/stdDeviation を下げる）と、小サイズでも「意図あるクラスタ」に見える。512px だけ見て判断しない。
  5. **ベクターパスを単一の真実にする**: opentype でアウトライン（SVG path data）を取り、SVG はそのまま、PNG/ICO は同じ path を `Path2D` で canvas に描く。配置定義を1箇所に集約すれば SVG とラスタがズレない。SVG の色は `stroke="rgba()"` ではなく `stroke` + `stroke-opacity` に分ける（属性互換性）。
- **適用範囲**: favicon / OGP / アプリ内テクスチャなど、CJK を含む画像アセット生成全般。WSL2 環境でのフォント調達。
