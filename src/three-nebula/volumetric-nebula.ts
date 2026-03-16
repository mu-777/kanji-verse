import * as THREE from "three";
import type { KanjiNode } from "../shared/types";
import type { NebulaEngine } from "./nebula-engine";

// ノード座標は [0,1] → WORLD_SCALE=2 で [-1,1] へ変換されるが、
// テクスチャのUV計算では [0,1] 範囲のまま扱えるので WORLD_SCALE 不要

const GRID      = 64;   // 3D テクスチャの解像度（64^3 = 262,144 ボクセル）
const SIGMA     = 2.5;  // Gaussian スプラットのシグマ（ボクセル単位）
const N_CLUSTERS = 20;

// クラスタ id → 宇宙らしい色相（青紫〜赤紫帯）
function clusterColor(c: number): THREE.Color {
  const hue = (180 + (c / N_CLUSTERS) * 360) % 360;
  return new THREE.Color().setHSL(hue / 360, 0.75, 0.55);
}

/**
 * ノードの UMAP 3D 座標から空間密度場を計算し、Data3DTexture に焼き込む。
 *
 * テクスチャ RGBA:
 *   RGB = ボクセルの密度加重平均クラスタ色
 *   A   = 正規化密度 [0, 1]（最大密度ボクセル = 1.0）
 */
function buildDensityTexture(nodes: KanjiNode[]): THREE.Data3DTexture {
  const G  = GRID;
  const G2 = G * G;
  const data = new Float32Array(G * G2 * 4); // RGBA float
  const R = Math.ceil(SIGMA * 3);            // カーネル半径
  const inv2s2 = 1 / (2 * SIGMA * SIGMA);

  for (const node of nodes) {
    // ノード座標 [0, 1] → ボクセル座標 [0, G-1]
    const gx = node.x          * (G - 1);
    const gy = node.y          * (G - 1);
    const gz = (node.z ?? 0.5) * (G - 1);

    const col = clusterColor(node.c ?? 0);

    const x0 = Math.max(0, Math.round(gx) - R);
    const x1 = Math.min(G - 1, Math.round(gx) + R);
    const y0 = Math.max(0, Math.round(gy) - R);
    const y1 = Math.min(G - 1, Math.round(gy) + R);
    const z0 = Math.max(0, Math.round(gz) - R);
    const z1 = Math.min(G - 1, Math.round(gz) + R);

    for (let iz = z0; iz <= z1; iz++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let ix = x0; ix <= x1; ix++) {
          const d2 = (ix - gx) ** 2 + (iy - gy) ** 2 + (iz - gz) ** 2;
          const w  = Math.exp(-d2 * inv2s2);
          if (w < 1e-7) continue;

          const base = (iz * G2 + iy * G + ix) * 4;
          data[base + 0] += col.r * w;
          data[base + 1] += col.g * w;
          data[base + 2] += col.b * w;
          data[base + 3] += w;
        }
      }
    }
  }

  // RGB を密度で割って「重み付き平均クラスタ色」にし、密度を [0,1] に正規化
  let maxDensity = 0;
  for (let i = 0; i < G * G2; i++) {
    const d = data[i * 4 + 3];
    if (d > maxDensity) maxDensity = d;
  }

  if (maxDensity > 0) {
    for (let i = 0; i < G * G2; i++) {
      const base = i * 4;
      const d    = data[base + 3];
      if (d > 1e-9) {
        data[base + 0] /= d;           // normalize RGB by weight
        data[base + 1] /= d;
        data[base + 2] /= d;
        data[base + 3] /= maxDensity;  // normalize density to [0,1]
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, G, G, G);
  tex.format        = THREE.RGBAFormat;
  tex.type          = THREE.FloatType;
  tex.minFilter     = THREE.LinearFilter;
  tex.magFilter     = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate   = true;
  return tex;
}

// ─── シェーダー ───────────────────────────────────────────────────

const VERT = /* glsl */`
varying vec3 vWorldPos;
void main() {
  vec4 wp   = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;

uniform sampler3D uDensityMap;
uniform float     uDensityScale;

varying vec3 vWorldPos;

const int N_STEPS = 96;

// Ray-AABB 交差判定（ワールド空間の箱 [-1, 1]^3）
vec2 rayBox(vec3 ro, vec3 rd) {
  vec3 invRd = 1.0 / rd;
  vec3 t0    = (-1.0 - ro) * invRd;
  vec3 t1    = ( 1.0 - ro) * invRd;
  vec3 tNear = min(t0, t1);
  vec3 tFar  = max(t0, t1);
  return vec2(
    max(max(tNear.x, tNear.y), tNear.z),
    min(min(tFar.x,  tFar.y),  tFar.z)
  );
}

void main() {
  vec3 ro = cameraPosition;                     // カメラ位置（Three.js 組み込み uniform）
  vec3 rd = normalize(vWorldPos - cameraPosition); // レイ方向

  // 箱との交差
  vec2 tb = rayBox(ro, rd);
  if (tb.x >= tb.y) discard;

  float tStart   = max(tb.x, 0.001);
  float tEnd     = tb.y;
  float stepSize = (tEnd - tStart) / float(N_STEPS);

  // ray marching — emission 積算（加算ブレンドで背景の星に重ねる）
  vec3 emission = vec3(0.0);

  for (int i = 0; i < N_STEPS; i++) {
    float t   = tStart + (float(i) + 0.5) * stepSize;
    vec3  pos = ro + rd * t;

    // ワールド [-1, 1] → テクスチャ UVW [0, 1]
    vec3 uvw = pos * 0.5 + 0.5;

    vec4  s       = texture(uDensityMap, uvw);
    float density = s.a * uDensityScale;

    // 各ステップの emission = color × density × stepLength
    emission += s.rgb * density * stepSize;
  }

  // 輝度が閾値未満のピクセルは捨てる（透明な空間を安価に処理）
  float lum = dot(emission, vec3(0.299, 0.587, 0.114));
  if (lum < 0.0005) discard;

  // Reinhard トーンマッピング: emission が大きくなっても 1.0 に圧縮
  emission = emission / (emission + vec3(1.0));
  lum      = dot(emission, vec3(0.299, 0.587, 0.114));

  // 加算ブレンド: gl_FragColor.rgb * gl_FragColor.a が背景に加算される
  gl_FragColor = vec4(emission, lum);
}
`;

// ─── VolumetricNebula クラス ─────────────────────────────────────

/** 3D 密度場を Data3DTexture に焼き込み、ray marching でボリューメトリックな雲を描画 */
export class VolumetricNebula implements NebulaEngine {
  private mesh: THREE.Mesh | null            = null;
  private tex:  THREE.Data3DTexture | null   = null;

  init(scene: THREE.Scene, nodes: KanjiNode[]): void {
    this.tex  = buildDensityTexture(nodes);

    const geo = new THREE.BoxGeometry(2, 2, 2); // ワールド空間 [-1, 1]^3 をカバー
    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uDensityMap:   { value: this.tex },
        uDensityScale: { value: 0.5 },   // 視覚的な密度の強さ（大きいほど濃い雲）
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.BackSide,        // カメラが内外どちらにいても正しく描画
      blending:    THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    scene.add(this.mesh);
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.parent?.remove(this.mesh);
      this.mesh = null;
    }
    this.tex?.dispose();
    this.tex = null;
  }
}
