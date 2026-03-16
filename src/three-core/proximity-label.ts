import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import { WORLD_SCALE } from "./points";

const WORLD_THRESHOLD  = 1.2;   // world units
const SCREEN_THRESHOLD = 0.25;  // NDC distance from center（-1〜1 の空間）
const ZOOM_OUT_MAX     = 2.5;   // camera が原点からこの距離より遠いとき全非表示
const MAX_LABELS       = 8;     // 同時表示数
const SIZE_FACTOR      = 30;    // px·units（fontSize = SIZE_FACTOR / worldDist）
const MIN_FONT_PX      = 14;
const MAX_FONT_PX      = 110;

export interface ProximityLabel {
  update(dt: number): void;
  dispose(): void;
}

export function createProximityLabel(
  camera: THREE.Camera,
  nodes: KanjiNode[],
): ProximityLabel {
  // ── 要素プール作成（#proximity-label を親コンテナとして使う）──
  const container = document.getElementById("proximity-label")!;
  container.innerHTML = "";

  const pool = Array.from({ length: MAX_LABELS }, () => {
    const item    = document.createElement("div");
    item.className = "pl-item";
    const kanji   = document.createElement("div");
    kanji.className = "pl-kanji";
    const meaning = document.createElement("div");
    meaning.className = "pl-meaning";
    item.append(kanji, meaning);
    container.appendChild(item);
    return { el: item, kanji, meaning };
  });

  // ── top-N を GCゼロで管理する scratch 領域 ──
  // 挿入ソートで常にスコア昇順を維持する
  const topScore  = new Float32Array(MAX_LABELS).fill(Infinity);
  const topWDist  = new Float32Array(MAX_LABELS);
  const topNdcX   = new Float32Array(MAX_LABELS);
  const topNdcY   = new Float32Array(MAX_LABELS);
  const topNodes: (KanjiNode | null)[] = new Array(MAX_LABELS).fill(null);
  let topCount = 0;

  const nodePos   = new THREE.Vector3();
  const screenPos = new THREE.Vector3();

  function update(_dt: number) {
    // ズームアウト時は全非表示
    if (camera.position.length() > ZOOM_OUT_MAX) {
      for (const p of pool) p.el.style.opacity = "0";
      return;
    }

    // ── top-N リセット ──
    topCount = 0;
    topScore.fill(Infinity);

    // ── 全ノードをスコアリングして top-N を更新 ──
    for (const node of nodes) {
      nodePos.set(
        (node.x - 0.5) * WORLD_SCALE,
        (node.y - 0.5) * WORLD_SCALE,
        node.z !== undefined ? (node.z - 0.5) * WORLD_SCALE : 0,
      );

      const worldDist  = camera.position.distanceTo(nodePos);
      const worldScore = worldDist / WORLD_THRESHOLD;

      screenPos.copy(nodePos).project(camera);
      const screenScore = screenPos.z > 1
        ? Infinity
        : Math.sqrt(screenPos.x * screenPos.x + screenPos.y * screenPos.y) / SCREEN_THRESHOLD;

      const score = Math.min(worldScore, screenScore);
      if (score >= 1.0) continue;

      // 挿入ソート: スコアが worst より良ければ差し込む
      if (topCount < MAX_LABELS || score < topScore[topCount - 1]) {
        // 挿入位置を探す
        let pos = topCount < MAX_LABELS ? topCount : MAX_LABELS - 1;
        for (let j = 0; j < (topCount < MAX_LABELS ? topCount : MAX_LABELS - 1); j++) {
          if (score < topScore[j]) { pos = j; break; }
        }
        // pos 以降を右にシフト
        const end = Math.min(topCount, MAX_LABELS - 1);
        for (let j = end; j > pos; j--) {
          topScore[j] = topScore[j - 1];
          topWDist[j] = topWDist[j - 1];
          topNdcX[j]  = topNdcX[j - 1];
          topNdcY[j]  = topNdcY[j - 1];
          topNodes[j] = topNodes[j - 1];
        }
        topScore[pos] = score;
        topWDist[pos] = worldDist;
        topNdcX[pos]  = screenPos.x;
        topNdcY[pos]  = screenPos.y;
        topNodes[pos] = node;
        if (topCount < MAX_LABELS) topCount++;
      }
    }

    // ── プール要素を更新 ──
    for (let i = 0; i < MAX_LABELS; i++) {
      const p = pool[i];
      const node = topNodes[i];
      if (i >= topCount || node === null) {
        p.el.style.opacity = "0";
        continue;
      }

      const opacity  = Math.max(0, 1 - topScore[i]);
      const fontSize = Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, SIZE_FACTOR / topWDist[i]));
      const x = (topNdcX[i] *  0.5 + 0.5) * window.innerWidth;
      const y = (topNdcY[i] * -0.5 + 0.5) * window.innerHeight;

      p.kanji.textContent       = node.k;
      p.meaning.textContent     = node.m[0] ?? "";
      p.kanji.style.fontSize    = `${fontSize}px`;
      p.el.style.opacity        = String(opacity);
      p.el.style.left           = `${x}px`;
      p.el.style.top            = `${y}px`;
    }
  }

  return {
    update,
    dispose() { container.innerHTML = ""; },
  };
}
