import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * ソーシャル共有用の短尺シネマティック・ディレクター。
 *
 * 選択中の漢字（ワールド座標）を引数に取り、約7秒のクリップ用カメラワークを駆動する:
 *   0–1.8s   establish: 対象の少し外（ワイド）からゆっくり周回。原点距離 > 2.5 ならグリフは未表示
 *   1.8–4.3s dive:      対象へ寄る。原点距離が 2.5 を切ってグリフ（ラベル）が浮かび上がる
 *   4.3–7.0s hold:      近接でホールド＋ゆっくり周回。対象グリフが大きく中央に発光
 *
 * cinematic.ts（?demo=1 用）と異なり、これは「可逆」: 開始時にカメラ/コントロール状態を退避し、
 * dispose() で完全復帰する。interaction は破棄しない（通常操作へ戻せる）。
 *
 * ラベル表示は proximity-label.ts が camera.position.length()（原点距離）< 2.5 で全数を出す方式。
 * WORLD_SCALE=2.0 で全ノードは原点から最大 √3≈1.73。近接（R_CLOSE）すれば必ず 2.5 を切るので
 * 対象グリフは確実に出る。
 */

export interface ShareClipHandle {
  /** レンダーループから毎フレーム呼ぶ。 */
  update(dt: number): void;
  /** タイムライン終了したら true。 */
  readonly done: boolean;
  /** クリップ尺（秒）。 */
  readonly duration: number;
  /** カメラ/コントロールを録画前の状態へ完全復帰する。 */
  dispose(): void;
}

interface Deps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** dive 開始時のフック（audio.bump で BGM を明るくする用）。 */
  onDive?: () => void;
}

const DURATION     = 7.0;
const T_DIVE_START = 1.8;
const T_DIVE_END   = 4.3;
const R_WIDE       = 1.25; // establish のカメラ〜対象距離（原点距離 > 2.5 になりグリフが隠れる領域）
const R_CLOSE      = 0.32; // dive 到達時のカメラ〜対象距離
const PHI          = 1.12; // 極角（やや上から）
const ROT_SPEED    = 0.16; // 周回速度 (rad/s)

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export function startShareClip(deps: Deps, targetPos: THREE.Vector3): ShareClipHandle {
  const { camera, controls } = deps;

  // 復帰用に現状を退避
  const savedEnabled = controls.enabled;
  const savedPos     = camera.position.clone();
  const savedQuat    = camera.quaternion.clone();
  const savedTarget  = controls.target.clone();

  controls.enabled = false;

  // 開始時の視線方向（方位角）を引き継いで自然に始める
  const startSph = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(targetPos),
  );
  const theta0 = startSph.theta;

  const _sph = new THREE.Spherical();
  const _pos = new THREE.Vector3();

  let t = 0;
  let diveFired = false;
  let done = false;

  function radiusAt(time: number): number {
    if (time < T_DIVE_START) return R_WIDE;
    if (time < T_DIVE_END) {
      const u = smoothstep((time - T_DIVE_START) / (T_DIVE_END - T_DIVE_START));
      return THREE.MathUtils.lerp(R_WIDE, R_CLOSE, u);
    }
    return R_CLOSE;
  }

  function update(dt: number) {
    if (done) return;
    t += dt;
    if (t >= DURATION) { t = DURATION; done = true; }

    if (!diveFired && t >= T_DIVE_START) { diveFired = true; deps.onDive?.(); }

    const radius = radiusAt(t);
    const theta  = theta0 + ROT_SPEED * t;
    _sph.set(radius, PHI, theta);
    _pos.setFromSpherical(_sph).add(targetPos);
    camera.position.copy(_pos);
    camera.lookAt(targetPos);
    camera.updateMatrixWorld();
  }

  return {
    update,
    duration: DURATION,
    get done() { return done; },
    dispose() {
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      controls.target.copy(savedTarget);
      controls.enabled = savedEnabled;
      controls.update();
    },
  };
}
