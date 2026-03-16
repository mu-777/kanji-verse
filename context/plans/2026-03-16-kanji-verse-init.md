# 計画: kanji-verse 初期実装

## 目的
人名に使える漢字（常用漢字2136 + 人名用漢字863 = 約3000字）を、AI embeddingによる意味的類似度で配置した夜空風インタラクティブビジュアライゼーションWebアプリを作る。

## アーキテクチャ

```
[事前計算 Python スクリプト]
漢字リスト + KanjiDic2（意味・読み）
→ SentenceTransformer でテキスト記述をEmbedding
→ UMAP で2D座標化
→ data/kanji.json 出力

[静的Webアプリ (Vite + TypeScript)]
kanji.json → Canvas 2D でレンダリング → GitHub Pages
```

## 作業ステップ

### Phase 1: データ準備
- [ ] KanjiDic2 XMLをダウンロード・パース
- [ ] 常用漢字・人名用漢字リストを用意
- [ ] 各漢字の「意味テキスト」を生成（例: 「木: 樹木、き。訓: き。音: モク」）
- [ ] SentenceTransformer (paraphrase-multilingual-mpnet-base-v2) でEmbedding
- [ ] UMAP で2D座標化
- [ ] kanji.json 出力（kanji, x, y, meanings, readings, type）

### Phase 2: Webアプリ
- [ ] Vite + TypeScript プロジェクト初期化
- [ ] Canvas 2D での星空風レンダリング（ノード = 小さな光点）
- [ ] パン・ズーム実装
- [ ] ホバー時にラベル表示（漢字文字）
- [ ] クリックで詳細パネル表示（漢字・読み・意味・type）
- [ ] 検索機能（漢字入力 → 該当ノードをハイライト・フォーカス）
- [ ] 常用漢字/人名用漢字のフィルタ表示切替

### Phase 3: デプロイ
- [ ] GitHub Pages 設定（Vite base path）
- [ ] README

## 技術選定

| 要素 | 選択 | 理由 |
|---|---|---|
| フロントエンド | Vite + TypeScript | シンプル・軽量 |
| レンダリング | Canvas 2D | 3000ノード・エッジなし → WebGLは過剰 |
| Embedding | paraphrase-multilingual-mpnet-base-v2 | 日本語対応・ローカル実行可 |
| 次元削減 | UMAP | t-SNEより高速・クラスタ保持性が良い |
| 漢字データ | KanjiDic2 | 無料・包括的・意味/読み含む |

## 検証方法
- 意味的に近い漢字（木・森・林、水・海・川 など）が近くに配置されているか目視確認
- 3000ノードで60fps 程度のパン・ズームが動作するか
- 検索でハイライトが正しく動作するか
