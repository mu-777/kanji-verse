import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import { WORLD_SCALE } from "./points";

// カメラ距離がこれ以下になると漢字表示開始（フェードイン開始）
const LABEL_NEAR = 1.5;
// カメラ距離がこれ以上だと非表示
const LABEL_FAR  = 2.5;

const SIZE_FACTOR = 30;   // px·units（fontSize = SIZE_FACTOR / worldDist）
const MIN_FONT_PX = 8;
const MAX_FONT_PX = 110;

export interface ProximityLabel {
  update(dt: number): void;
  dispose(): void;
}

export function createProximityLabel(
  camera: THREE.Camera,
  nodes: KanjiNode[],
): ProximityLabel {
  const canvas = document.getElementById("proximity-label") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const nodePos   = new THREE.Vector3();
  const screenPos = new THREE.Vector3();

  function update(_dt: number) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const camDist = camera.position.length();

    // ズームアウト時は全非表示
    if (camDist >= LABEL_FAR) return;

    // labelAlpha: LABEL_FAR → 0, LABEL_NEAR以下 → 1
    const labelAlpha = Math.min(1, Math.max(0,
      (LABEL_FAR - camDist) / (LABEL_FAR - LABEL_NEAR),
    ));

    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    for (const node of nodes) {
      nodePos.set(
        (node.x - 0.5) * WORLD_SCALE,
        (node.y - 0.5) * WORLD_SCALE,
        node.z !== undefined ? (node.z - 0.5) * WORLD_SCALE : 0,
      );

      const worldDist = camera.position.distanceTo(nodePos);

      screenPos.copy(nodePos).project(camera);

      // カメラ後方 or 画面外はスキップ
      if (screenPos.z > 1) continue;
      if (Math.abs(screenPos.x) > 1.1 || Math.abs(screenPos.y) > 1.1) continue;

      const x = ( screenPos.x * 0.5 + 0.5) * w;
      const y = (-screenPos.y * 0.5 + 0.5) * h;

      const fontSize = Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, SIZE_FACTOR / worldDist));

      ctx.font = `${fontSize}px "Hiragino Mincho ProN", "Yu Mincho", "Georgia", serif`;

      const color    = node.t === 0 ? "#dce6ff" : "#ffd98e";
      const glowCol  = node.t === 0 ? "rgba(150,170,255,0.8)" : "rgba(255,200,100,0.8)";

      ctx.globalAlpha  = labelAlpha * 0.9;
      ctx.shadowColor  = glowCol;
      ctx.shadowBlur   = fontSize * 0.5;
      ctx.fillStyle    = color;
      ctx.fillText(node.k, x, y);
    }

    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  return {
    update,
    dispose() {
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
