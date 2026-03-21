import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import { WORLD_SCALE } from "./points";

const LABEL_NEAR = 1.5;
const LABEL_FAR  = 2.5;

const TEX_SIZE = 128;

// fontSize を小さめにしてキャンバス端の余白を確保し、shadowBlur が欠けないようにする
const FONT_RATIO  = 0.55;   // TEX_SIZE に対する文字サイズ比率
const GLOW_RATIO  = 0.5;    // fontSize に対するグロー半径比率

// SIZE_FACTOR(30) / focalLength_px(≈935) ≈ 0.032 が現行 fontSize 式と等価
const SPRITE_SCALE = 0.04;

export interface ProximityLabel {
  update(dt: number): void;
  /** composer.render() の直後に呼ぶ。bloom 対象外で上書き描画する。 */
  render(renderer: THREE.WebGLRenderer): void;
  /** ローディング中に呼んでGPUへテクスチャを事前転送する。初回zoom時のカクつきを防ぐ。 */
  warmup(renderer: THREE.WebGLRenderer, onProgress?: (done: number, total: number) => void): Promise<void>;
  dispose(): void;
}

/** イベントループに制御を返すユーティリティ */
const yieldToMain = () => new Promise<void>(r => setTimeout(r, 0));

function makeKanjiTexture(char: string, type: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width  = TEX_SIZE;
  c.height = TEX_SIZE;
  const ctx = c.getContext("2d")!;

  const fontSize = TEX_SIZE * FONT_RATIO;
  ctx.font         = `${fontSize}px "Hiragino Mincho ProN", "Yu Mincho", "Georgia", serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  const color   = type === 0 ? "#dce6ff" : "#ffd98e";
  const glowCol = type === 0 ? "#96aaff" : "#ffc864";
  const cx = TEX_SIZE / 2;
  const cy = TEX_SIZE / 2;

  // 外側グロー: shadowBlur でガウスぼかし + AdditiveBlending で自然な発光感
  ctx.shadowColor   = glowCol;
  ctx.shadowBlur    = fontSize * GLOW_RATIO;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle     = glowCol;
  ctx.globalAlpha   = 0.7;
  ctx.fillText(char, cx, cy);

  // シャープな本体 (薄いグローを残してエッジを際立たせる)
  ctx.shadowBlur  = fontSize * 0.06;
  ctx.fillStyle   = color;
  ctx.globalAlpha = 1.0;
  ctx.fillText(char, cx, cy);

  return new THREE.CanvasTexture(c);
}

const BATCH_SIZE = 64;

export async function createProximityLabel(
  camera: THREE.Camera,
  nodes: KanjiNode[],
  onProgress?: (done: number, total: number) => void,
): Promise<ProximityLabel> {
  // bloom から完全に分離した専用シーン
  const spriteScene = new THREE.Scene();

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

  // スプライト生成をバッチ非同期化（テクスチャ生成が重いため）
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const mat = new THREE.SpriteMaterial({
      map:         getTexture(node.k, node.t),
      transparent: true,
      opacity:     0,
      depthTest:   false,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      (node.x - 0.5) * WORLD_SCALE,
      (node.y - 0.5) * WORLD_SCALE,
      node.z !== undefined ? (node.z - 0.5) * WORLD_SCALE : 0,
    );
    sprite.scale.setScalar(SPRITE_SCALE);
    sprite.visible = false;
    spriteScene.add(sprite);
    sprites.push(sprite);

    if ((i + 1) % BATCH_SIZE === 0) {
      onProgress?.(i + 1, nodes.length);
      await yieldToMain();
    }
  }
  onProgress?.(nodes.length, nodes.length);

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

    if (!wasVisible) {
      for (const s of sprites) s.visible = true;
      wasVisible = true;
    }

    for (const s of sprites) {
      (s.material as THREE.SpriteMaterial).opacity = labelAlpha;
    }
  }

  function render(renderer: THREE.WebGLRenderer) {
    if (!wasVisible) return;
    // bloom 出力を消さずにスプライトだけ上書き
    renderer.autoClear = false;
    renderer.render(spriteScene, camera);
    renderer.autoClear = true;
  }

  async function warmup(renderer: THREE.WebGLRenderer, onProgress?: (done: number, total: number) => void) {
    const textures = [...textureCache.values()];
    for (let i = 0; i < textures.length; i++) {
      renderer.initTexture(textures[i]);
      if ((i + 1) % BATCH_SIZE === 0) {
        onProgress?.(i + 1, textures.length);
        await yieldToMain();
      }
    }
    onProgress?.(textures.length, textures.length);
  }

  return {
    update,
    render,
    warmup,
    dispose() {
      for (const s of sprites) {
        (s.material as THREE.SpriteMaterial).dispose();
      }
      for (const tex of textureCache.values()) tex.dispose();
    },
  };
}
