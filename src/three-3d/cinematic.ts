import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { KanjiNode } from "../shared/types";
import type { InteractionBundle } from "../three-core/interaction";
import { WORLD_SCALE } from "../three-core/points";

/**
 * プロモーション動画キャプチャ用のシネマティック（アトラクト）モード。
 *
 * `?demo=1`（任意で `&loop=1`）で起動したときだけ有効。通常の操作モードには一切影響しない。
 * 既存の UI/インタラクションを「本物のまま」プログラムで駆動する:
 *   - 検索ボックスに実際に文字を打ち込み、UI の input ハンドラ経由で意味検索を発火（緑発光）
 *   - interaction.selectNode で詳細パネルを開く
 * カメラは OrbitControls を無効化して完全に手番を握り、球座標キーフレームで滑らかに動かす。
 *
 * 演出ビート（master ≈ 24s, loop でシームレス反復）:
 *   0–5s   ヒーロー: 銀河全体をゆっくり自動回転（ラベルは出さない＝半径 > LABEL_FAR）
 *   5–11s  意味検索: "love" を自動入力 → 一致漢字が緑に発光
 *   11–17s ダイブ: 「愛」へ寄る。半径が縮み漢字グリフ（ラベル）が浮かび上がる
 *   17–19.5s ホールド: 詳細パネルで読み・意味を見せる
 *   19.5–24s 引き: 全体像へ戻る（継ぎ目は冒頭と一致）
 */

export interface CinematicHandle {
  update(dt: number): void;
}

interface CinematicDeps {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  nodes: KanjiNode[];
  interaction: InteractionBundle;
  searchInput: HTMLInputElement;
}

interface CinematicOptions {
  loop: boolean;
}

// 海外の視聴者にも直感的に伝わる語。ダイブ先の漢字と意味を一致させる。
const SEARCH_WORD = "love";
const DIVE_KANJI = "愛";

// タイムライン（秒）
const T_EST = 5;       // ヒーロー終わり
const T_SEARCH = 11;   // 検索ビート終わり
const T_DIVE = 15;     // ダイブ到達
const T_HOLD = 21;   // ホールド終わり
const T_END = 25;      // 1サイクル終わり（loop 継ぎ目）
const WELCOME_HIDE = 3.5; // ウェルカム（タイトルカード）をフェードアウトさせる時刻

const R_CLOSE = 0.25;   // ダイブ到達時のカメラ〜対象距離
const PHI0 = 1.18;     // 極角（やや上から見下ろす）
const THETA0 = Math.PI * 0.25;
const ROT_SPEED = 0.12; // 方位角の回転速度（rad/s, 常時ゆっくり）

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function nodeWorldPos(n: KanjiNode, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    (n.x - 0.5) * WORLD_SCALE,
    (n.y - 0.5) * WORLD_SCALE,
    n.z !== undefined ? (n.z - 0.5) * WORLD_SCALE : 0,
  );
}

export function startCinematic(deps: CinematicDeps, opts: CinematicOptions): CinematicHandle {
  const { camera, controls, nodes, interaction, searchInput } = deps;

  // キャプチャ用にユーザー入力を遮断（ホバー/クリックのちらつき防止）し、カメラ操作を奪う。
  controls.enabled = false;
  interaction.dispose();
  document.getElementById("info-btn")?.style.setProperty("display", "none");

  // demo では welcome ボードをオープニングのタイトルカードとして使う。
  // 既存の .kv-overlay フェード（opacity 0.4s）に合わせて出し入れする。localStorage は汚さない。
  const welcomeEl = document.getElementById("welcome");
  function showWelcome() {
    if (!welcomeEl) return;
    welcomeEl.classList.remove("hidden");
    welcomeEl.style.display = "flex";
  }
  function hideWelcome() {
    if (!welcomeEl) return;
    welcomeEl.classList.add("hidden");
    welcomeEl.addEventListener("transitionend", () => {
      if (welcomeEl.classList.contains("hidden")) welcomeEl.style.display = "none";
    }, { once: true });
  }

  const origin = new THREE.Vector3(0, 0, 0);
  const diveNode = nodes.find((n) => n.k === DIVE_KANJI) ?? nodes[0];
  const divePos = nodeWorldPos(diveNode, new THREE.Vector3());

  // 画面比に応じた広角半径（縦長ほど引いて全体を収める）。起動時に一度だけ決める。
  const aspect = window.innerWidth / window.innerHeight;
  const R_WIDE = 2.6 / Math.sqrt(Math.min(1, aspect));

  // 一周ぶんの状態リセット（loop 用）。検索とパネルを初期化する。
  function resetCycle() {
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input")); // UI 経由で clearSearch + 件数クリア
    interaction.onSelect(null);                    // 詳細パネルを閉じる
  }

  // 検索ボックスへ1文字ずつ打ち込み、本物の input パイプラインで発光させる。
  function typeWord(word: string) {
    searchInput.value = "";
    let i = 1;
    const tick = () => {
      searchInput.value = word.slice(0, i);
      searchInput.dispatchEvent(new Event("input"));
      if (i < word.length) {
        i++;
        setTimeout(tick, 700);
      }
    };
    tick();
  }

  interface Action { at: number; fired: boolean; run: () => void; }
  const actions: Action[] = [
    { at: WELCOME_HIDE, fired: false, run: hideWelcome },                    // タイトルカードを消す
    { at: T_EST + 0.4, fired: false, run: () => typeWord(SEARCH_WORD) },     // 検索を打ち込む
    { at: T_DIVE - 1.0, fired: false, run: () => interaction.selectNode(diveNode) }, // 到達手前で詳細を開く
    { at: T_HOLD, fired: false, run: resetCycle },                           // 引きに入る前に閉じる
  ];

  resetCycle();
  showWelcome();  // 起動直後にタイトルカードを出す

  // 再利用する一時オブジェクト
  const _target = new THREE.Vector3();
  const _sph = new THREE.Spherical();
  const _pos = new THREE.Vector3();

  let elapsed = 0;   // 起動からの総経過（方位角の連続回転に使う＝継ぎ目を滑らかに）
  let loopBase = 0;  // 現サイクルの起点

  /** local 時刻における {target, radius, phi}。target は _target に書き込む。 */
  function poseAt(t: number): { radius: number; phi: number } {
    if (t < T_SEARCH) {
      _target.copy(origin);
      return { radius: R_WIDE, phi: PHI0 };
    }
    if (t < T_DIVE) {
      const u = smoothstep((t - T_SEARCH) / (T_DIVE - T_SEARCH));
      _target.lerpVectors(origin, divePos, u);
      return { radius: THREE.MathUtils.lerp(R_WIDE, R_CLOSE, u), phi: PHI0 };
    }
    if (t < T_HOLD) {
      _target.copy(divePos);
      return { radius: R_CLOSE, phi: PHI0 };
    }
    const u = smoothstep((t - T_HOLD) / (T_END - T_HOLD));
    _target.lerpVectors(divePos, origin, u);
    return { radius: THREE.MathUtils.lerp(R_CLOSE, R_WIDE, u), phi: PHI0 };
  }

  function update(dt: number) {
    elapsed += dt;
    let local = elapsed - loopBase;

    if (local >= T_END) {
      if (opts.loop) {
        loopBase += T_END;
        local = elapsed - loopBase;
        for (const a of actions) a.fired = false;
        resetCycle();
        showWelcome();  // loop の各周でタイトルカードを再表示
      } else {
        local = T_END;
      }
    }

    for (const a of actions) {
      if (!a.fired && local >= a.at) { a.fired = true; a.run(); }
    }

    const { radius, phi } = poseAt(local);
    // 方位角は elapsed（サイクルを跨いで連続）で回す → loop 継ぎ目で回転が飛ばない。
    const theta = THETA0 + ROT_SPEED * elapsed;
    _sph.set(radius, phi, theta);
    _pos.setFromSpherical(_sph).add(_target);
    camera.position.copy(_pos);
    camera.lookAt(_target);
    camera.updateMatrixWorld();
  }

  return { update };
}
