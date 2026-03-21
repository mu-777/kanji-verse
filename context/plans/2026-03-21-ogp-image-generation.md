# OGP画像生成

## 目的
ルートページ（3D漢字ビジュアライゼーション）のOGP画像を作成し、SNSシェア時にプロジェクトの世界観が伝わるようにする。

## アプローチ
Node.js Canvasスクリプトで `kanji-2d.json` の座標データを使い、夜空風の画像をプログラマティックに生成する。

## 作業ステップ
- [ ] `@napi-rs/canvas` を devDependency に追加
- [ ] `scripts/generate-ogp.mts` を作成（座標データ読み込み → 描画 → PNG出力）
- [ ] `public/ogp.png` を生成
- [ ] `index.html` に OGP メタタグを追加
- [ ] 動作確認

## 検証方法
- 生成された画像ファイルが存在し、1200x630 であること
- index.html に必要な OGP タグが含まれていること
