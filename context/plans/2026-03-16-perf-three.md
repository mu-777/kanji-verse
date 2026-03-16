# パフォーマンス最適化: three-3d / three-nebula

## 目的
> 「three-nebulaとthree-3dのレンダリングが重い。軽くなる方法を検討して」

## 検証した問題と対応

### 1. Raycasting が O(n) でマウス移動のたびに走る（interaction.ts）
- **問題**: 2785ノード全部を毎 mousemove でループ + `new Vector3()` を毎回生成
- **対応**: RAF ベースのスロットリング（1フレームに1回のみ hitTest を実行）+ `proj` をクロージャ外に移動

### 2. 全ノードのバッファをフル更新（points.ts）
- **問題**: ハイライトが1ノード変わるだけで 2785ノード分の `setXYZ/setX` が走る
- **対応**: `prevHovered/prevSelected/prevSearched` を保持し、変化があったノードのインデックスのみ更新する差分更新

### 3. カメラ更新で毎フレーム `new THREE.Spherical()` 生成（camera.ts）
- **問題**: 60fps × `new Spherical()` で GCプレッシャー、`Math.pow` も毎フレーム実行
- **対応**: `curSph` をクロージャレベルで確保して使い回し、`INERTIA_DECAY_RATE` を定数として事前計算し `Math.exp` で代用

### 4. Bloom threshold が低すぎる（composer.ts）
- **問題**: threshold=0.05 でほぼ全ピクセルがブルーム対象 → 全画面ブラーが毎フレーム走る
- **対応**: threshold を 0.05 → 0.2 に引き上げ

## スコープ外（今回やらなかったこと）
- Volumetric Nebula の GRID 縮小（起動時のみの一回コスト）
- Gaussian Splat の InstancedMesh 化（効果は限定的で難易度高め）
- 空間分割（Octree / BVH）によるレイキャスト高速化（現状の RAF スロットリングで十分と判断）

## ステータス
完了 — 2026-03-16
