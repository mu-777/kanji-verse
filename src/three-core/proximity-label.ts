import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import { WORLD_SCALE } from "./points";

// カメラ距離がこれ以下になると漢字表示開始（フェードイン開始）
const LABEL_NEAR = 1.5;
// カメラ距離がこれ以上だと非表示
const LABEL_FAR  = 2.5;

// テクスチャサイズ（px）— 漢字1文字を高解像度で焼き付ける
const TEX_SIZE = 128;

// スプライトのワールドスペーススケール
// SIZE_FACTOR(30) / focalLength_px(≈935) ≈ 0.032 が現行 fontSize 式と等価
// 透視投影が自然に距離感を表現するため固定値でよい
const SPRITE_SCALE = 0.04;

export interface ProximityLabel {
  update(dt: number): void;
  dispose(): void;
}

function makeKanjiTexture(char: string, type: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width  = TEX_SIZE;
  c.height = TEX_SIZE;
  const ctx = c.getContext("2d")!;

  const fontSize = TEX_SIZE * 0.72;
  ctx.font         = `${fontSize}px "Hiragino Mincho ProN", "Yu Mincho", "Georgia", serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  const color   = type === 0 ? "#dce6ff" : "#ffd98e";
  const glowCol = type === 0 ? "#96aaff" : "#ffc864";
  const off = Math.max(1, fontSize * 0.06) | 0;

  ctx.fillStyle   = glowCol;
  ctx.globalAlpha = 0.35;
  ctx.fillText(char, TEX_SIZE / 2 - off, TEX_SIZE / 2);
  ctx.fillText(char, TEX_SIZE / 2 + off, TEX_SIZE / 2);
  ctx.fillText(char, TEX_SIZE / 2, TEX_SIZE / 2 - off);
  ctx.fillText(char, TEX_SIZE / 2, TEX_SIZE / 2 + off);

  ctx.fillStyle   = color;
  ctx.globalAlpha = 0.9;
  ctx.fillText(char, TEX_SIZE / 2, TEX_SIZE / 2);

  return new THREE.CanvasTexture(c);
}

export function createProximityLabel(
  camera: THREE.Camera,
  nodes: KanjiNode[],
  scene: THREE.Scene,
): ProximityLabel {
  // テクスチャキャッシュ — 同じ漢字・同じ種別はテクスチャを共有
  const textureCache = new Map<string, THREE.CanvasTexture>();

  function getTexture(k: string, t: number): THREE.CanvasTexture {
    const key = `${k}:${t}`;
    let tex = textureCache.get(key);
    if (!tex) {
      tex = makeKanjiTexture(k, t);
      textureCache.set(key, tex);
    }
    return tex;
  }

  // 各ノードに対応する Sprite を生成してシーンに追加
  const sprites: THREE.Sprite[] = nodes.map(node => {
    const mat = new THREE.SpriteMaterial({
      map:         getTexture(node.k, node.t),
      transparent: true,
      opacity:     0,
      depthTest:   false,
      depthWrite:  false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      (node.x - 0.5) * WORLD_SCALE,
      (node.y - 0.5) * WORLD_SCALE,
      node.z !== undefined ? (node.z - 0.5) * WORLD_SCALE : 0,
    );
    sprite.scale.setScalar(SPRITE_SCALE);
    sprite.visible     = false;
    sprite.renderOrder = 999;
    scene.add(sprite);
    return sprite;
  });

  // 前フレームの表示状態を保持して不要な一括書き換えを避ける
  let wasVisible = false;

  function update(_dt: number) {
    const camDist = camera.position.length();

    if (camDist >= LABEL_FAR) {
      if (wasVisible) {
        for (const s of sprites) s.visible = false;
        wasVisible = false;
      }
      return;
    }

    const labelAlpha = Math.min(1, Math.max(0,
      (LABEL_FAR - camDist) / (LABEL_FAR - LABEL_NEAR),
    ));

    // Three.js の Frustum カリングがスプライトごとの可視判定を担う
    if (!wasVisible) {
      for (const s of sprites) s.visible = true;
      wasVisible = true;
    }

    for (const s of sprites) {
      (s.material as THREE.SpriteMaterial).opacity = labelAlpha;
    }
  }

  return {
    update,
    dispose() {
      for (const s of sprites) {
        scene.remove(s);
        (s.material as THREE.SpriteMaterial).dispose();
      }
      for (const tex of textureCache.values()) tex.dispose();
    },
  };
}
