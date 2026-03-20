import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface CameraBundle {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** ロード完了後に呼ぶ。ズーム慣性でカメラを引き込み、点→文字の遷移を演出する。 */
  startIntroZoom(): void;
  /** 指定ワールド座標のノードをセンターにしてカメラを飛ばす。 */
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
const SMOOTH_ALPHA    = 0.25;   // 速度スムージング係数

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
  controls.enablePan = true;
  // PC: ミドルボタンでパン、左ボタンで回転
  controls.mouseButtons = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT:  THREE.MOUSE.ROTATE,
  };
  // モバイル: 1本指で回転、2本指でピンチズーム＋ドラッグパン
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ── 状態 ──
  let mode: Mode = "user";

  // ── 球座標速度トラッキング (controls.target 相対) ──
  const prevSph = new THREE.Spherical();
  const curSph  = new THREE.Spherical();
  let thetaVelSmooth  = 0;
  let phiVelSmooth    = 0;
  let radiusVelSmooth = 0;
  let firstFrame = true;

  // ── 慣性モードの状態 ──
  const inertiaSph    = new THREE.Spherical();
  const inertiaTarget = new THREE.Vector3();
  let inertiaTheta  = 0;
  let inertiaPhi    = 0;
  let inertiaRadius = 0;

  // ── fly モードの状態 ──
  const flySrcCamPos  = new THREE.Vector3();
  const flySrcTarget  = new THREE.Vector3();
  const flyPeakCamPos = new THREE.Vector3();
  const flyEndCamPos  = new THREE.Vector3();
  const flyEndTarget  = new THREE.Vector3();
  let flyT = 0;
  const FLY_DURATION   = 1.8;  // アニメーション全体の秒数
  const FLY_END_RADIUS = 0.35;  // 最終的なカメラ〜ターゲット距離
  const FLY_PEAK_MIN   = 2.0;  // 引きの最小半径（原点からの距離）

  // 一時ベクトル（毎フレームのアロケーション回避）
  const _tmp  = new THREE.Vector3();
  const _tmp2 = new THREE.Vector3();

  /** smoothstep: [0,1] → [0,1] */
  function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  // ── 初回ズームイン ──
  function startIntroZoom() {
    setTimeout(() => {
      _tmp.copy(camera.position).sub(controls.target);
      inertiaSph.setFromVector3(_tmp);
      inertiaTarget.copy(controls.target);
      inertiaRadius = INTRO_ZOOM_SPEED;
      mode = "inertia";
    }, 3000);
  }

  // ── 検索対象へのカメラ移動 ──
  function flyTo(target: THREE.Vector3) {
    flySrcCamPos.copy(camera.position);
    flySrcTarget.copy(controls.target);
    flyEndTarget.copy(target);

    // カメラエンド位置: ターゲット漢字から現在の視線方向に FLY_END_RADIUS
    _tmp.copy(camera.position).sub(controls.target).normalize();
    flyEndCamPos.copy(target).addScaledVector(_tmp, FLY_END_RADIUS);

    // ピーク位置: 始点と終点の中点を、原点からの方向に膨らませる
    _tmp.copy(flySrcCamPos).lerp(flyEndCamPos, 0.5);
    const peakRadius = Math.max(_tmp.length() * 1.15, FLY_PEAK_MIN);
    flyPeakCamPos.copy(_tmp).normalize().multiplyScalar(peakRadius);

    flyT = 0;
    mode = "fly";
  }

  // ── マウス押下：ユーザー操作モードへ ──
  controls.addEventListener("start", () => {
    mode = "user";
  });

  // ── 操作終了：その瞬間の速度をそのまま引き継いで慣性モードへ ──
  controls.addEventListener("end", () => {
    inertiaTheta  = thetaVelSmooth;
    inertiaPhi    = phiVelSmooth;
    inertiaRadius = Math.abs(radiusVelSmooth) > INERTIA_ZOOM_THRESH ? radiusVelSmooth : 0;
    _tmp.copy(camera.position).sub(controls.target);
    inertiaSph.setFromVector3(_tmp);
    inertiaTarget.copy(controls.target);
    mode = "inertia";
  });

  // ── フレームごとの更新 ──
  function update(dt: number) {
    controls.update();

    // 速度計測（controls.target 相対の球座標、controls.update 後 = damping 適用済み）
    _tmp.copy(camera.position).sub(controls.target);
    curSph.setFromVector3(_tmp);
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

      // 位置を更新（inertiaTarget 中心の球座標）
      inertiaSph.theta  += inertiaTheta * dt;
      inertiaSph.phi     = Math.max(0.01, Math.min(Math.PI - 0.01, inertiaSph.phi + inertiaPhi * dt));
      inertiaSph.radius  = Math.max(controls.minDistance, Math.min(controls.maxDistance,
        inertiaSph.radius + inertiaRadius * dt));
      if (inertiaSph.radius <= controls.minDistance || inertiaSph.radius >= controls.maxDistance) {
        inertiaRadius = 0;
      }
      _tmp.setFromSpherical(inertiaSph).add(inertiaTarget);
      camera.position.copy(_tmp);
      camera.lookAt(inertiaTarget);
    }

    if (mode === "fly") {
      flyT = Math.min(flyT + dt / FLY_DURATION, 1);

      // ── カメラ位置: 二次ベジェ (src → peak → end) ──
      const u = flyT;
      _tmp
        .copy(flySrcCamPos).multiplyScalar((1 - u) * (1 - u));
      _tmp.addScaledVector(flyPeakCamPos, 2 * (1 - u) * u);
      _tmp.addScaledVector(flyEndCamPos, u * u);
      camera.position.copy(_tmp);

      // ── ターゲット: 0.1 遅れて始まり 0.85 で完了する smoothstep ──
      const rotRaw = Math.max(0, Math.min(1, (flyT - 0.1) / 0.75));
      const ease   = smoothstep(rotRaw);
      _tmp2.lerpVectors(flySrcTarget, flyEndTarget, ease);
      controls.target.copy(_tmp2);

      camera.lookAt(_tmp2);

      if (flyT >= 1) {
        camera.position.copy(flyEndCamPos);
        controls.target.copy(flyEndTarget);
        controls.update();
        mode = "user";
      }
    }

    // "user" は OrbitControls に委ねる
  }

  return { camera, controls, startIntroZoom, flyTo, update };
}
