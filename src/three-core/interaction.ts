import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import { WORLD_SCALE } from "./points";

export interface InteractionBundle {
  hoveredNode:  KanjiNode | null;
  selectedNode: KanjiNode | null;
  searchNode:   KanjiNode | null;
  search(kanji: string): boolean;
  clearSearch(): void;
  setFilter(joyo: boolean, jinmei: boolean): void;
  onSelect: (node: KanjiNode | null) => void;
  dispose(): void;
}

/**
 * Three.js Points に対する raycasting ベースのインタラクション。
 * Points の組み込み raycaster は threshold が粗いため手動で最近傍を計算する。
 */
export function createInteraction(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  nodes: KanjiNode[],
  onHighlightChange: () => void,
): InteractionBundle {
  const mouse = new THREE.Vector2(-9999, -9999);
  const raycaster = new THREE.Raycaster();

  let hoveredNode:  KanjiNode | null = null;
  let selectedNode: KanjiNode | null = null;
  let searchNode:   KanjiNode | null = null;
  let filterJoyo   = true;
  let filterJinmei = true;

  let dragStartX = 0;
  let dragStartY = 0;

  const bundle: InteractionBundle = {
    get hoveredNode()  { return hoveredNode; },
    get selectedNode() { return selectedNode; },
    get searchNode()   { return searchNode; },
    onSelect: () => {},

    search(kanji: string): boolean {
      if (!kanji) { searchNode = null; onHighlightChange(); return false; }
      const node = nodes.find((n) => n.k === kanji);
      if (!node) { searchNode = null; onHighlightChange(); return false; }
      searchNode = node;
      onHighlightChange();
      return true;
    },

    clearSearch() { searchNode = null; onHighlightChange(); },

    setFilter(joyo: boolean, jinmei: boolean) {
      filterJoyo   = joyo;
      filterJinmei = jinmei;
      // フィルタ変更は points.updateFilter 側で処理するため onHighlightChange 経由で通知
      onHighlightChange();
    },

    dispose() {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("click", onClick);
    },
  };

  function isVisible(node: KanjiNode): boolean {
    if (node.t === 0 && !filterJoyo)   return false;
    if (node.t === 1 && !filterJinmei) return false;
    return true;
  }

  // ループ外で使い回す一時ベクトル
  const proj = new THREE.Vector3();

  function hitTest(): KanjiNode | null {
    raycaster.setFromCamera(mouse, camera);
    const ray = raycaster.ray;

    // 各ノードとレイの距離を計算し最近傍を返す
    const SCREEN_THRESHOLD = 0.04; // NDC 単位の当たり判定半径
    let best: KanjiNode | null = null;
    let bestDist = Infinity;

    for (const node of nodes) {
      if (!isVisible(node)) continue;
      proj.set(
        (node.x - 0.5) * WORLD_SCALE,
        (node.y - 0.5) * WORLD_SCALE,
        node.z !== undefined ? (node.z - 0.5) * WORLD_SCALE : 0,
      );
      const dist = ray.distanceToPoint(proj);
      // スクリーン距離に換算（近いほど閾値は大きく）
      const camDist = proj.distanceTo(raycaster.ray.origin);
      const screenDist = dist / camDist;
      if (screenDist < SCREEN_THRESHOLD && camDist < bestDist) {
        bestDist = camDist;
        best = node;
      }
    }
    return best;
  }

  // RAF ベースのスロットリング — 1フレームに1回だけ hitTest を実行
  let rafPending = false;
  let pendingMouseX = -9999;
  let pendingMouseY = -9999;

  function onMouseMove(e: MouseEvent) {
    pendingMouseX = e.clientX;
    pendingMouseY = e.clientY;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      mouse.x =  (pendingMouseX / window.innerWidth)  * 2 - 1;
      mouse.y = -(pendingMouseY / window.innerHeight) * 2 + 1;
      const prev = hoveredNode;
      hoveredNode = hitTest();
      if (prev !== hoveredNode) onHighlightChange();
    });
  }

  function onMouseDown(e: MouseEvent) {
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  }

  function onClick(e: MouseEvent) {
    const moved = Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY);
    if (moved > 4) return;
    // タッチ時は RAF より click が先に発火するため、ここで mouse を更新してから hitTest する
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    const hit = hitTest();
    selectedNode = hit;
    bundle.onSelect(hit);
    onHighlightChange();
  }

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("click", onClick);

  return bundle;
}
