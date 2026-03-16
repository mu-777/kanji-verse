import type { KanjiNode } from "../shared/types";

// クラスタ id (0〜19) → HSL 色相（宇宙感のある青紫〜赤紫帯を使用）
// 全クラスタに均等に hue を分配するが、暖色系（orange/yellow）は避けて宇宙らしい色域に絞る
function clusterHue(c: number, total: number): number {
  // 180°〜360°+180° = 180°〜540° → mod 360 = 青〜紫〜赤〜青
  return (180 + (c / total) * 360) % 360;
}

/**
 * KDE ネビュラをオフスクリーン canvas に描画して返す。
 * 各ノードの位置に、クラスタ色の放射グラジエント（Gaussian kernel）を積算する。
 * globalCompositeOperation = 'screen' で光の重畳。
 *
 * @param nodes   全漢字ノード（2D 正規化座標 [0,1]）
 * @param width   出力 canvas の幅（ワールドピクセル）
 * @param height  出力 canvas の高さ
 * @param bandwidth  ガウシアンカーネルの半径（px）
 */
export function buildNebulaCanvas(
  nodes: KanjiNode[],
  width: number,
  height: number,
  bandwidth: number = 80,
): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d")!;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const N_CLUSTERS = 20;

  // 各ノードにガウシアンブロブを描く
  for (const node of nodes) {
    const c = node.c ?? 0;
    const hue = clusterHue(c, N_CLUSTERS);
    const px = node.x * width;
    const py = node.y * height;

    // 大きなソフトグロー（ネビュラ雲）
    const grad = ctx.createRadialGradient(px, py, 0, px, py, bandwidth);
    grad.addColorStop(0,   `hsla(${hue}, 80%, 55%, 0.22)`);
    grad.addColorStop(0.4, `hsla(${hue}, 70%, 45%, 0.10)`);
    grad.addColorStop(1,   `hsla(${hue}, 60%, 35%, 0.00)`);

    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, bandwidth, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2 パス目: 密集エリアをさらに明るく（小カーネルで輝点を追加）
  const smallBw = bandwidth * 0.25;
  for (const node of nodes) {
    const c = node.c ?? 0;
    const hue = clusterHue(c, N_CLUSTERS);
    const px = node.x * width;
    const py = node.y * height;

    const grad = ctx.createRadialGradient(px, py, 0, px, py, smallBw);
    grad.addColorStop(0,   `hsla(${hue}, 90%, 80%, 0.15)`);
    grad.addColorStop(1,   `hsla(${hue}, 80%, 60%, 0.00)`);

    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, smallBw, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  return offscreen;
}
