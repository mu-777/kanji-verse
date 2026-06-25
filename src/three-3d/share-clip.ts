import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * ソーシャル共有用の短尺シネマティック・ディレクター（オフライン版）。
 *
 * 選択中の漢字（ワールド座標）を引数に取り、絶対時刻 t（秒）でカメラポーズを決める。
 * WebCodecs のオフライン生成（recorder.ts）から、各フレームの時刻について apply(t) で呼ぶ。
 *
 * タイムライン（約7秒。10秒版を一様に短縮＝動きの比率は同一）:
 *   0–1.26s   establish: 対象の少し外（ワイド）からゆっくり周回。原点距離 > 2.5 ならグリフは未表示
 *   1.26–3.01s dive:     対象へ寄る。原点距離が 2.5 を切ってグリフ（ラベル）が浮かび上がる
 *   3.01–5.6s hold:      近接でホールド＋ゆっくり周回。対象グリフが大きく中央に発光
 *   5.6–7.0s fade:       ホールドを続けつつ fade 0→1（recorder が黒オーバーレイ、音声も同尺でフェード）
 *
 * cinematic.ts（?demo=1 用）と異なり「可逆」: 開始時にカメラ/コントロール状態を退避し、dispose() で
 * 完全復帰する。interaction は破棄しない（通常操作へ戻せる）。
 *
 * ラベル表示は proximity-label.ts が camera.position.length()（原点距離）< 2.5 で全数を出す方式。
 * WORLD_SCALE=2.0 で全ノードは原点から最大 √3≈1.73。近接（R_CLOSE）すれば必ず 2.5 を切るので
 * 対象グリフは確実に出る。
 */

export interface ShareClip {
  /** クリップ尺（秒）。 */
  readonly duration: number;
  /** 終端フェードの長さ（秒）。 */
  readonly fadeDuration: number;
  /** 時刻 t（秒）のカメラポーズを適用する。 */
  apply(t: number): void;
  /** 時刻 t（秒）の終端フェード量 0..1（1=全黒）。 */
  fadeAt(t: number): number;
  /** カメラ/コントロールを開始前の状態へ完全復帰する。 */
  dispose(): void;
}

// 7秒版（10秒版の各タイミングを 0.7 倍、周回速度を 1/0.7 倍＝全体を一様に短縮。動きの比率は不変）
const DURATION     = 7.0;
const FADE_DUR     = 1.2;    // 終端フェードの長さ（秒）
const T_DIVE_START = 1.0;   // 寄り始め
const T_DIVE_END   = 2.8;   // 寄り到達
const R_WIDE       = 1.25;   // establish のカメラ〜対象距離（原点距離 > 2.5 になりグリフが隠れる領域）
const R_CLOSE      = 0.2;   // dive 到達時のカメラ〜対象距離
const PHI          = 1.12;   // 極角（やや上から）
const ROT_SPEED    = 0.2286; // 周回速度 (rad/s, = 0.16 ÷ 0.7。総回転量を10秒版と同じに保つ)

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function radiusAt(time: number): number {
  if (time < T_DIVE_START) return R_WIDE;
  if (time < T_DIVE_END) {
    const u = smoothstep((time - T_DIVE_START) / (T_DIVE_END - T_DIVE_START));
    return THREE.MathUtils.lerp(R_WIDE, R_CLOSE, u);
  }
  return R_CLOSE;
}

export function startShareClip(
  deps: { camera: THREE.PerspectiveCamera; controls: OrbitControls },
  targetPos: THREE.Vector3,
): ShareClip {
  const { camera, controls } = deps;

  // 復帰用に現状を退避
  const savedEnabled = controls.enabled;
  const savedPos     = camera.position.clone();
  const savedQuat    = camera.quaternion.clone();
  const savedTarget  = controls.target.clone();

  controls.enabled = false;

  // 開始時の視線方向（方位角）を引き継いで自然に始める
  const startSph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(targetPos));
  const theta0 = startSph.theta;

  const _sph = new THREE.Spherical();
  const _pos = new THREE.Vector3();

  return {
    duration: DURATION,
    fadeDuration: FADE_DUR,
    apply(t: number) {
      const radius = radiusAt(t);
      const theta = theta0 + ROT_SPEED * t;
      _sph.set(radius, PHI, theta);
      _pos.setFromSpherical(_sph).add(targetPos);
      camera.position.copy(_pos);
      camera.lookAt(targetPos);
      camera.updateMatrixWorld();
    },
    fadeAt(t: number) {
      return Math.max(0, Math.min(1, (t - (DURATION - FADE_DUR)) / FADE_DUR));
    },
    dispose() {
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      controls.target.copy(savedTarget);
      controls.enabled = savedEnabled;
      controls.update();
    },
  };
}
