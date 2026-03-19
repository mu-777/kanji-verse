import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface CameraBundle {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  update(dt: number): void;
}

const INERTIA_ROT_HALF_LIFE  = 4.0;  // 回転慣性の半減期（秒）
const INERTIA_ZOOM_HALF_LIFE = 1.5;  // ズーム慣性の半減期（秒）
const INERTIA_ZOOM_THRESH    = 0.02; // ズーム慣性を引き継ぐ閾値 (units/s)
const ROT_DECAY_RATE  = -Math.LN2 / INERTIA_ROT_HALF_LIFE;
const ZOOM_DECAY_RATE = -Math.LN2 / INERTIA_ZOOM_HALF_LIFE;
const SMOOTH_ALPHA         = 0.25;   // 速度スムージング係数

type Mode = "user" | "inertia";

export function createCamera(
  renderer: THREE.WebGLRenderer,
  initialDistance = 3,
): CameraBundle {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );
  camera.position.set(0, 0, initialDistance);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.3;
  controls.maxDistance = 8;
  // パンを無効化。モバイルで2本指ズーム時に DOLLY_PAN として処理され
  // controls.target が (0,0,0) からずれると、user モード時に
  // OrbitControls が lookAt(target) を呼び出して視点がジャンプする。
  controls.enablePan = false;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ── 状態 ──
  let mode: Mode = "user";

  // ── 球座標速度トラッキング ──
  const prevSph = new THREE.Spherical();
  const curSph  = new THREE.Spherical(); // 毎フレーム new しないよう使い回す
  let thetaVelSmooth  = 0;
  let phiVelSmooth    = 0;
  let radiusVelSmooth = 0;
  let firstFrame = true;

  // ── 慣性モードの状態 ──
  const inertiaSph = new THREE.Spherical();
  let inertiaTheta  = 0;
  let inertiaPhi    = 0;
  let inertiaRadius = 0;

  // ── マウス押下：ユーザー操作モードへ ──
  controls.addEventListener("start", () => {
    mode = "user";
  });

  // ── 操作終了：その瞬間の速度をそのまま引き継いで慣性モードへ ──
  controls.addEventListener("end", () => {
    // タイマーなし・最低速度なし——damping が自然に届いたその速度で続ける
    inertiaTheta  = thetaVelSmooth;
    inertiaPhi    = phiVelSmooth;
    inertiaRadius = Math.abs(radiusVelSmooth) > INERTIA_ZOOM_THRESH ? radiusVelSmooth : 0;
    inertiaSph.setFromVector3(camera.position);
    mode = "inertia";
  });

  // ── フレームごとの更新 ──
  function update(dt: number) {
    controls.update();

    // 球座標速度を計測（controls.update 後 = damping 適用済み）
    curSph.setFromVector3(camera.position);
    if (!firstFrame) {
      let dTheta = curSph.theta - prevSph.theta;
      if (dTheta >  Math.PI) dTheta -= 2 * Math.PI;
      if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      const safedt = Math.max(dt, 0.001);
      thetaVelSmooth  += (dTheta / safedt                              - thetaVelSmooth)  * SMOOTH_ALPHA;
      phiVelSmooth    += ((curSph.phi    - prevSph.phi)    / safedt   - phiVelSmooth)    * SMOOTH_ALPHA;
      radiusVelSmooth += ((curSph.radius - prevSph.radius) / safedt   - radiusVelSmooth) * SMOOTH_ALPHA;
    }
    prevSph.copy(curSph);
    firstFrame = false;

    if (mode === "inertia") {
      // 回転とズームを独立した半減期で減衰
      const rotDecay  = Math.exp(ROT_DECAY_RATE  * dt);
      const zoomDecay = Math.exp(ZOOM_DECAY_RATE * dt);
      inertiaTheta  *= rotDecay;
      inertiaPhi    *= rotDecay;
      inertiaRadius *= zoomDecay;

      // 位置を更新
      inertiaSph.theta  += inertiaTheta * dt;
      inertiaSph.phi     = Math.max(0.01, Math.min(Math.PI - 0.01, inertiaSph.phi + inertiaPhi * dt));
      inertiaSph.radius  = Math.max(controls.minDistance, Math.min(controls.maxDistance,
        inertiaSph.radius + inertiaRadius * dt));
      if (inertiaSph.radius <= controls.minDistance || inertiaSph.radius >= controls.maxDistance) {
        inertiaRadius = 0;
      }
      camera.position.setFromSpherical(inertiaSph);
      camera.lookAt(0, 0, 0);
    }
    // "user" は OrbitControls に委ねる
  }

  return { camera, controls, update };
}
