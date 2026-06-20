# kanji-2d.json の削除とスクリプト更新

## 目的
ユーザ発言を引用:
> 「別タスクとしてkanji-2d.json の削除とスクリプトの更新を実施して」

three-3d 単一構成への確定（ADR-0004）に伴い、アプリ未使用になった `public/data/kanji-2d.json`
を削除し、これを生成・参照するスクリプトを 3D 専用に更新する。

## 現状把握
- アプリ（`src/three-3d/main.ts`）は `kanji-3d.json` のみロード。`kanji-2d.json` はアプリ未使用。
- `scripts/generate_data.py`: `--dim`（2/3/both, デフォルト both）で 2D/3D を生成。2D 生成あり。
- `scripts/generate-ogp.mts`: **`kanji-2d.json` を読んで** OGP 画像を生成。← 削除すると壊れる。
- `kanji-3d.json` は x, y, z, t, c を持つ（2D が使う x,y,t,c を内包）。OGP は x,y のみ使用。
- 別件の旧ファイル `public/data/kanji.json`（630KB, 未使用）と README の陳腐化は本タスクのスコープ外。

## アプローチ
1. `generate_data.py` を 3D 専用化（`--dim`/argparse 撤去、2D 生成削除、`save_json` 簡素化、docstring 更新）。
2. `generate-ogp.mts` の参照を `kanji-2d.json` → `kanji-3d.json` に付け替え（x,y をそのまま使用）。
   - 注: 3D UMAP の x,y は 2D UMAP と配置が異なるため OGP の見た目は変わる。ただし当スクリプトは
     現行 `public/ogp.png`（テキスト基調の別デザイン）を再現していない既知の状態のため許容。
   - スクリプトは**実行しない**（実行すると現行 ogp.png を上書きしてしまうため）。
3. `public/data/kanji-2d.json` を削除。
4. ドキュメント更新（PROJECT.md データ構成・課題、ADR-0004 影響）。

## 作業ステップ
- [ ] generate_data.py 3D専用化
- [ ] generate-ogp.mts 参照付け替え
- [ ] kanji-2d.json 削除
- [ ] PROJECT.md / ADR-0004 更新
- [ ] 検証（py_compile、参照 grep、kanji-3d.json のフィールド確認）

## 検証方法
- `python3 -m py_compile generate_data.py` が通る。
- アクティブなコード（scripts/・src/・config）に `kanji-2d.json` 参照が残らない（grep）。
- `kanji-3d.json` が generate-ogp が必要とする k,x,y,t,c を持つことを確認。
- `kanji-2d.json` が削除されていることを確認。
