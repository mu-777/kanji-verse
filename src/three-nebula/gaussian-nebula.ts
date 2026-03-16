import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import type { NebulaEngine } from "./nebula-engine";
import { WORLD_SCALE } from "../three-core/points";

const N_CLUSTERS = 20;

// クラスタ id → 宇宙らしい色相（青紫〜赤紫帯）
function clusterColor(c: number): THREE.Color {
  const hue = (180 + (c / N_CLUSTERS) * 360) % 360;
  return new THREE.Color().setHSL(hue / 360, 0.75, 0.55);
}

// ─── シェーダー ───────────────────────────────────
const VERT = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vCenter;
uniform vec3 uCenter;

void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vCenter   = uCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vCenter;
uniform vec3  uColor;
uniform float uRadius;
uniform float uOpacity;

void main() {
  float dist = length(vWorldPos - vCenter);
  // Gaussian falloff
  float sigma = uRadius * 0.45;
  float g = exp(-(dist * dist) / (2.0 * sigma * sigma));
  float alpha = g * uOpacity;
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

/** クラスタごとにクラスタ重心＋分散を計算してガウシアンブロブを配置 */
export class GaussianSplatNebula implements NebulaEngine {
  private meshes: THREE.Mesh[] = [];

  init(scene: THREE.Scene, nodes: KanjiNode[]): void {
    // クラスタごとにノードを仕分け
    const clusters = new Map<number, KanjiNode[]>();
    for (const node of nodes) {
      const c = node.c ?? 0;
      if (!clusters.has(c)) clusters.set(c, []);
      clusters.get(c)!.push(node);
    }

    clusters.forEach((members, clusterId) => {
      // 重心
      let cx = 0, cy = 0, cz = 0;
      for (const n of members) {
        cx += (n.x - 0.5) * WORLD_SCALE;
        cy += (n.y - 0.5) * WORLD_SCALE;
        cz += (n.z !== undefined ? n.z - 0.5 : 0) * WORLD_SCALE;
      }
      cx /= members.length;
      cy /= members.length;
      cz /= members.length;
      const center = new THREE.Vector3(cx, cy, cz);

      // 分散（= ノード群の広がり）をネビュラ半径に使う
      let variance = 0;
      for (const n of members) {
        const dx = (n.x - 0.5) * WORLD_SCALE - cx;
        const dy = (n.y - 0.5) * WORLD_SCALE - cy;
        const dz = (n.z !== undefined ? n.z - 0.5 : 0) * WORLD_SCALE - cz;
        variance += dx * dx + dy * dy + dz * dz;
      }
      variance /= members.length;
      const stdDev = Math.sqrt(variance);

      const color = clusterColor(clusterId);

      // 大きなフワフワした雲（低不透明度）
      this.addBlob(scene, center, stdDev * 2.5, color, 0.045);
      // 小さくて輝く内側の核
      this.addBlob(scene, center, stdDev * 0.8, color, 0.12);
    });
  }

  private addBlob(
    scene: THREE.Scene,
    center: THREE.Vector3,
    radius: number,
    color: THREE.Color,
    opacity: number,
  ): void {
    const geo = new THREE.SphereGeometry(radius, 16, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCenter:  { value: center.clone() },
        uColor:   { value: color.clone() },
        uRadius:  { value: radius },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.BackSide,  // 内側からも見えるよう BackSide
      blending:    THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    scene.add(mesh);
    this.meshes.push(mesh);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.parent?.remove(mesh);
    }
    this.meshes = [];
  }
}
