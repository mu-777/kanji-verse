# テスト用バリアントの削除とルート3Dのみ有効化

## 目的
ユーザ発言を引用:
> 「以下のバリアントはテスト用だったのでもう消してしまって、ルートの3Dのだけを有効にして
> pages/2d-bloom/index.html / pages/2d/index.html / pages/three-nebula/index.html」

比較検討のために並列実装していたバリアントの役目が終わり、ルートの three-3d を本命として確定。
不要バリアントとそのデッドコードを削除し、構成をシンプルにする。

## 現状把握
- ルート: `index.html` → `src/three-3d/main.ts` → `src/three-core/*` + `src/shared/*`
- 削除対象バリアントと専用 src:
  - `pages/2d/` → `src/base/`
  - `pages/2d-bloom/` → `src/bloom/`
  - `pages/three-nebula/` → `src/three-nebula/`
- `src/three-core/` は three-3d / three-nebula が共用。three-3d が使うため残す。
- `src/shared/` は全バリアント共用。three-3d が使うため残す。
- `src/three-core/`・`src/shared/` は base/bloom/three-nebula を import していない（一方向依存）ため、削除しても残るコードは壊れない。
- 関連: ADR-0003（マルチバリアント並列デプロイ）の方針を転換する。

## アプローチの選択肢
### 選択肢A: ページ＋専用src も削除（採用）
- メリット: デッドコードを残さずクリーン。「ルート3Dのみ」という意図と完全に一致。
- デメリット: 削除ファイルが多い（が git で復元可能）。

### 選択肢B: ページのみ削除
- メリット: 後で参照する可能性を残せる。
- デメリット: 未使用の src/base・bloom・three-nebula が残りノイズになる。

→ ユーザ確認の上、選択肢A を採用。

## 作業ステップ
- [x] `pages/2d/`, `pages/2d-bloom/`, `pages/three-nebula/` を削除
- [x] `src/base/`, `src/bloom/`, `src/three-nebula/` を削除
- [x] `vite.config.ts` のエントリをルートのみに（マルチページ設定を撤去）
- [x] `context/PROJECT.md` を更新（バリアント表・ファイル構成・課題）
- [x] ADR-0004 を作成し ADR-0003 を superseded に
- [ ] `npm run build` で検証

## 検証方法
- `npm run build`（tsc + vite build）が成功する＝型エラー・未解決 import がない。
- grep で削除パスへの参照が残っていないこと。
