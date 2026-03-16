# ADR-0001: Embedding モデルの選定

## ステータス
accepted

## 日付
2026-03-16

## コンテキスト
- 漢字の意味的類似度を計算するためのEmbeddingモデルが必要
- データソース: KanjiDic2（意味は英語テキスト）
- 実行環境: ローカル（SentenceTransformer）

## 検討した選択肢

### 選択肢A: paraphrase-multilingual-mpnet-base-v2
- メリット: 多言語対応・有名
- デメリット: 入力が英語なのに多言語モデルを使うのは過剰。英語品質はA-2より劣る。サイズ ~1GB

### 選択肢B: all-mpnet-base-v2（採用）
- メリット: 英語特化で高品質。英語STS（Semantic Textual Similarity）ベンチマーク最高水準。~420MB
- デメリット: 日本語テキストには使えない（今回は不要）

### 選択肢C: all-MiniLM-L6-v2
- メリット: ~90MB と超軽量・高速
- デメリット: 品質はBより劣る。3000字の一回計算なら品質優先で良い

## 決定
all-mpnet-base-v2 を採用する。

## 理由
KanjiDic2の意味テキストが英語であるため、英語特化モデルの方が意味的クラスタリングの精度が高い。
計算は一回限りのオフライン処理なので、サイズ・速度より品質を優先する。

## 影響
- Python スクリプトで `SentenceTransformer("all-mpnet-base-v2")` を使用
- 初回実行時にモデル（~420MB）がダウンロードされる
