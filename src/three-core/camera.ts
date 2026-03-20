import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface CameraBundle {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** ロード完了後に呼ぶ。ズーム慣性でカメラを引き込み、点→文字の遷移を演出する。 */
  startIntroZoom(): void;
  /** 指定ワールド座標のノードが画面中央に来るようカメラを飛ばす。 */
  flyTo(target: THREE.Vector3): void;
  update(dt: number): void;
}

const INERTIA_ROT_HALF_LIFE  = 4.0;  // 回転慣性の半減期（秒）
const INERTIA_ZOOM_HALF_LIFE = 1.5;  // ズーム慣性の半減期（秒）
const INERTIA_ZOOM_THRESH    = 0.02; // ズーム慣性を引き継ぐ閾値 (units/s)
// 初回ズームイン初速: r=3 → r=0.3 に収束
// 収束半径 = r0 + v0 * T_half / ln2 = 3 + v0 * 1.5 / ln2 = 0.3 → v0 ≈ -1.247
const INTRO_ZOOM_SPEED = -1.247;
const ROT_DECAY_RATE  = -Math.LN2 / INERTIA_ROT_HALF_LIFE;
const ZOOM_DECAY_RATE = -Math.LN2 / INERTIA_ZOOM_HALF_LIFE;
const SMOOTH_ALPHA         = 0.25;   // 速度スムージング係数

type Mode = "user" | "inertia" | "fly";

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

  // ── fly モードの状態 ──
  const flySph      = new THREE.Spherical();
  let flySrcTheta   = 0;
  let flySrcPhi     = 0;
  let flySrcRadius  = 0;
  let flyPeakRadius = 0;
  let flyTargetTheta = 0;
  let flyTargetPhi   = 0;
  let flyT = 0;
  const FLY_DURATION   = 1.8;  // アニメーション全体の秒数
  const FLY_END_RADIUS = 0.6;  // 最終的な距離
  const FLY_PEAK_MIN   = 2.0;  // 引きの最小半径

  /** smoothstep: [0,1] → [0,1] */
  function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  // ── 初回ズームイン ──
  function startIntroZoom() {
    inertiaSph.setFromVector3(camera.position);
    inertiaRadius = INTRO_ZOOM_SPEED;
    mode = "inertia";
  }

  // ── 検索対象へのカメラ移動 ──
  function flyTo(target: THREE.Vector3) {
    flySph.setFromVector3(camera.position);
    flySrcTheta  = flySph.theta;
    flySrcPhi    = flySph.phi;
    flySrcRadius = flySph.radius;
    // 現在位置より十分引けるよう peak を決める
    flyPeakRadius = Math.max(flySrcRadius * 1.15, FLY_PEAK_MIN);

    const dirSph = new THREE.Spherical().setFromVector3(target.clone().normalize());
    flyTargetTheta = dirSph.theta;
    flyTargetPhi   = dirSph.phi;
    flyT = 0;
    mode = "fly";
  }

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

    if (mode === "fly") {
      flyT = Math.min(flyT + dt / FLY_DURATION, 1);

      // ── 半径: 二次ベジェ (src → peak → end) ──
      // peak は t=0.5 付近で最大になり、引き→寄りの弧を描く
      const u = flyT;
      flySph.radius =
        (1 - u) * (1 - u) * flySrcRadius +
        2 * (1 - u) * u   * flyPeakRadius +
        u * u             * FLY_END_RADIUS;

      // ── 角度: 0.1 遅れて始まり 0.85 で完了する smoothstep ──
      const rotRaw = Math.max(0, Math.min(1, (flyT - 0.1) / 0.75));
      const rotEase = smoothstep(rotRaw);

      let dTheta = flyTargetTheta - flySrcTheta;
      if (dTheta >  Math.PI) dTheta -= 2 * Math.PI;
      if (dTheta < -Math.PI) dTheta += 2 * Math.PI;

      flySph.theta = flySrcTheta + dTheta * rotEase;
      flySph.phi   = Math.max(0.01, Math.min(Math.PI - 0.01,
        flySrcPhi + (flyTargetPhi - flySrcPhi) * rotEase,
      ));

      camera.position.setFromSpherical(flySph);
      camera.lookAt(0, 0, 0);

      if (flyT >= 1) {
        controls.object.position.copy(camera.position);
        controls.update();
        mode = "user";
      }
    }

    // "user" は OrbitControls に委ねる
  }

  return { camera, controls, startIntroZoom, flyTo, update };
}
