# ローディング進捗パーセント表示

## 目的
ルート3D表示の初回ロード時、スピナーではなく処理量ベースのパーセント表示にする。

## 現状
- `index.html` にスピナーアニメーション + "Loading Kanji-Verse..." テキスト
- `main.ts` で fetch → scene作成 → テクスチャ生成(2785個) → GPU warmup(2785個) → loading非表示
- テクスチャ生成・warmup は同期的に一括実行

## アプローチ
テクスチャ生成(2785個) + GPU warmup(2785個) = 合計5570処理を母数とし、完了数/総数でパーセント表示。
fetch・scene作成等の軽い処理はパーセント外で「初期化中...」程度の表示。

### 作業ステップ
- [ ] `proximity-label.ts`: `createProximityLabel` をバッチ非同期化。進捗コールバック付き
- [ ] `proximity-label.ts`: `warmup` をバッチ非同期化。進捗コールバック付き
- [ ] `main.ts`: 新APIを使い、進捗コールバックでUI更新
- [ ] `index.html`: スピナーをパーセント表示UIに変更

### バッチサイズ
1フレームあたり50〜100個程度でバッチ処理し、`requestAnimationFrame` or `setTimeout(0)` でイベントループに返す。

## 検証
- ブラウザで開いて0%→100%が確認できること
- パーセントが処理量に比例して進むこと
