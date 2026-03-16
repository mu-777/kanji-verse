import * as THREE from "three";
import type { KanjiNode } from "../shared/types";

// 全ノードを [-0.5, 0.5]^3 のワールドにマップするスケール
export const WORLD_SCALE = 2.0;

// 常用: 青白, 人名: 金
const COLOR_JOYO   = new THREE.Color(0xc8d4ff);
const COLOR_JINMEI = new THREE.Color(0xffd98e);
const COLOR_HOVER  = new THREE.Color(0xffffff);
const COLOR_SEARCH = new THREE.Color(0x7fff7f);

const VERT = /* glsl */`
attribute float aSize;
attribute vec3  aColor;
varying   vec3  vColor;

void main() {
  vColor = aColor;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  // サイズをカメラ距離で補正（遠いほど小さく、でも一定以上は縮まない）
  float dist  = length(mvPos.xyz);
  float size  = aSize * (2.5 / max(dist, 0.5));
  gl_PointSize = clamp(size, 1.0, 18.0);
  gl_Position  = projectionMatrix * mvPos;
}
`;

const FRAG = /* glsl */`
varying vec3 vColor;

void main() {
  // 円形にクリップ
  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;

  // 中心が明るいガウシアン風フォールオフ
  float alpha = exp(-dist * dist * 8.0);
  gl_FragColor = vec4(vColor, alpha);
}
`;

export interface KanjiPoints {
  points: THREE.Points;
  /** hover/select/search 変更時に呼ぶ */
  updateHighlight(
    hovered:  KanjiNode | null,
    selected: KanjiNode | null,
    searched: KanjiNode | null,
  ): void;
  /** フィルタ変更時に呼ぶ */
  updateFilter(joyo: boolean, jinmei: boolean): void;
  dispose(): void;
}

export function createKanjiPoints(nodes: KanjiNode[]): KanjiPoints {
  const n = nodes.length;
  const positions = new Float32Array(n * 3);
  const colors    = new Float32Array(n * 3);
  const sizes     = new Float32Array(n);

  const nodeIndex = new Map<KanjiNode, number>();

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    nodeIndex.set(node, i);

    // 座標: [0,1] → [-WORLD_SCALE/2, WORLD_SCALE/2]
    positions[i * 3 + 0] = (node.x - 0.5) * WORLD_SCALE;
    positions[i * 3 + 1] = (node.y - 0.5) * WORLD_SCALE;
    positions[i * 3 + 2] = node.z !== undefined ? (node.z - 0.5) * WORLD_SCALE : 0;

    const c = node.t === 0 ? COLOR_JOYO : COLOR_JINMEI;
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = node.t === 0 ? 3.5 : 2.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor",   new THREE.BufferAttribute(colors,    3));
  geometry.setAttribute("aSize",    new THREE.BufferAttribute(sizes,     1));

  const material = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);

  // 前回の状態を保持（差分更新のため）
  let prevHovered:  KanjiNode | null = null;
  let prevSelected: KanjiNode | null = null;
  let prevSearched: KanjiNode | null = null;

  function applyNodeStyle(
    i: number,
    node: KanjiNode,
    hovered:  KanjiNode | null,
    selected: KanjiNode | null,
    searched: KanjiNode | null,
    colorAttr: THREE.BufferAttribute,
    sizeAttr:  THREE.BufferAttribute,
  ) {
    let c: THREE.Color;
    let s: number;
    if (node === searched)       { c = COLOR_SEARCH; s = 8; }
    else if (node === selected)  { c = COLOR_HOVER;  s = 8; }
    else if (node === hovered)   { c = COLOR_HOVER;  s = 6; }
    else {
      c = node.t === 0 ? COLOR_JOYO : COLOR_JINMEI;
      s = node.t === 0 ? 3.5 : 2.5;
    }
    colorAttr.setXYZ(i, c.r, c.g, c.b);
    sizeAttr.setX(i, s);
  }

  function updateHighlight(
    hovered:  KanjiNode | null,
    selected: KanjiNode | null,
    searched: KanjiNode | null,
  ) {
    const colorAttr = geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const sizeAttr  = geometry.getAttribute("aSize")  as THREE.BufferAttribute;

    // 変化があったノードのインデックスだけ収集
    const dirty = new Set<number>();
    for (const node of [prevHovered, prevSelected, prevSearched, hovered, selected, searched]) {
      if (node !== null) {
        const i = nodeIndex.get(node);
        if (i !== undefined) dirty.add(i);
      }
    }

    prevHovered  = hovered;
    prevSelected = selected;
    prevSearched = searched;

    if (dirty.size === 0) return;

    for (const i of dirty) {
      applyNodeStyle(i, nodes[i], hovered, selected, searched, colorAttr, sizeAttr);
    }
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate  = true;
  }

  function updateFilter(joyo: boolean, jinmei: boolean) {
    const sizeAttr = geometry.getAttribute("aSize") as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const visible = (node.t === 0 && joyo) || (node.t === 1 && jinmei);
      sizeAttr.setX(i, visible ? (node.t === 0 ? 3.5 : 2.5) : 0);
    }
    sizeAttr.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { points, updateHighlight, updateFilter, dispose };
}
