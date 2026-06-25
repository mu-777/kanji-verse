// インタラクティブBGM。
//
// 単一のベッド音源（public/audio/bgm.mp3, Gemini 生成の温かい脈動アンビエント）をループ
// 再生しつつ、ユーザーの操作に「直接連動して鳴る」生成レイヤーを重ねる:
//   - ベッド: 操作の度合い(energy)で lowpass cutoff / 音量を動かし、全体に緩急をつける。
//   - ドラッグ層(space): カメラ運動の速さ(motion)に連動する浮遊パッド＋薄い空気＋揺れ。
//     立ち上がりは即応、止めたらゆっくり減衰（急に切れない）。
//   - クリック層(glass): 漢字選択のワンショット（非整数倍音のガラスベル＋リバーブ余韻）。
//     ピッチは「視点からの距離」を音域バイアスにした旋律ウォークで決め、連続で同じ音にしない。
//
// 方針: 依存ゼロ（Web Audio API のみ）。既定ミュート＋ジェスチャ解錠＋遅延ロード＋
// タブ非表示でダッキング。音色は反復チューニングの末に space/glass に確定（ADR-0009）。

const BGM_URL     = `${import.meta.env.BASE_URL}audio/bgm.mp3`;
const STORAGE_KEY = "kv_sound";

const BASE_VOLUME = 0.6;
const IDLE_CUT    = 620;   // アイドル時の lowpass cutoff (Hz)：こもって遠い
const ACTIVE_CUT  = 8200;  // 操作時の cutoff (Hz)：開いて明るい
const IDLE_DYN    = 0.78;
const ACTIVE_DYN  = 1.0;
const ACTIVITY_TAU = 1.8;  // 単発入力（検索・ダイブ）の余韻の減衰時定数 (秒)
const ENERGY_TAU   = 0.35;
const PARAM_SMOOTH = 0.12;
const OUT_SMOOTH   = 0.3;

const SPEED_REF      = 2.0;   // この速さ(rad/s 相当)で motion≒1
const MOTION_SMOOTH  = 0.06;  // ドラッグ層のパラメータ追従時定数
const MOTION_ATTACK  = 0.06;  // 立ち上がり（即応）
const MOTION_RELEASE = 1.4;   // 止めたあと鳴り続けて減衰する時定数（急に切れず余韻を残す）

// ドラッグ層(space)のフィルタレンジと最大ゲイン（motion 0→1 で lo→hi に開く）。
const DRAG_LO = 220, DRAG_HI = 2400, DRAG_MAX = 0.42;

// 2オクターブのペンタトニック（半音度数）。クリック音をこれに量子化するとベッドと濁らない。
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export interface AudioController {
  isEnabled(): boolean;
  /** ユーザージェスチャ内で呼ぶ。AudioContext を用意/resume し、enabled なら遅延ロード→再生。 */
  setEnabled(enabled: boolean, opts?: { persist?: boolean }): void;
  /** 単発入力（検索ヒット・ダイブ）で一時的に energy を上げる。 */
  bump(amount?: number): void;
  /** クリック（漢字選択）のワンショットを鳴らす。pitch01(0..1) で音域バイアスをつける。 */
  ping(pitch01?: number): void;
  /** レンダーループから毎フレーム呼ぶ。speed はカメラ運動の速さ（rad/s 相当）。 */
  update(dt: number, speed?: number): void;
  onChange(cb: (enabled: boolean) => void): void;
  // ── 動画キャプチャ用 ──
  /** BGM を一時有効化＆ロード完了を待ち、master を分岐した音声トラックを返す（pref は汚さない）。 */
  beginCapture(): Promise<MediaStreamTrack | null>;
  /** 録画終了。分岐を外し録画前の mute 状態へ戻す。 */
  endCapture(): void;
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// 合成インパルス応答（指数減衰ノイズ）。素材なしでリバーブの余韻を作るため。
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function createAudio(): AudioController {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  // ベッド
  let bedSource: AudioBufferSourceNode | null = null;
  let bedFilter: BiquadFilterNode | null = null;
  let dynGain: GainNode | null = null;
  let bedBuffer: AudioBuffer | null = null;
  let loadingPromise: Promise<void> | null = null;
  // ドラッグ層(space)
  let noiseBuffer: AudioBuffer | null = null;
  let dragOut: GainNode | null = null;       // motion 連動のゲイン → master
  let dragFilter: BiquadFilterNode | null = null;
  let dragSources: AudioScheduledSourceNode[] = [];
  // クリック用リバーブ（余韻）
  let reverb: ConvolverNode | null = null;
  let reverbGain: GainNode | null = null;

  let enabled = readPref();
  let visible = document.visibilityState !== "hidden";

  let activity = 0;    // 単発入力の余韻 0..1
  let motion = 0;      // カメラ運動の連続値 0..1
  let energy = 0;      // ベッド駆動用の最終 energy 0..1
  let lastDegree = -1; // 直近クリック音のスケール度数（連続で同じ音にしない旋律ウォーク用）

  // 動画キャプチャ用
  let captureDest: MediaStreamAudioDestinationNode | null = null;
  let captureRestore = false;

  const changeCbs: ((enabled: boolean) => void)[] = [];

  function readPref(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) === "on"; } catch { return false; }
  }
  function writePref(on: boolean) {
    try { localStorage.setItem(STORAGE_KEY, on ? "on" : "off"); } catch { /* ignore */ }
  }

  function ensureContext() {
    if (ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    dynGain = ctx.createGain();
    dynGain.gain.value = IDLE_DYN;
    bedFilter = ctx.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = IDLE_CUT;
    bedFilter.Q.value = 0.7;
    bedFilter.connect(dynGain).connect(master);

    dragOut = ctx.createGain();
    dragOut.gain.value = 0;
    dragOut.connect(master);
    noiseBuffer = makeNoiseBuffer(ctx, 2);

    // クリック音に空間的な余韻（テール）を与える簡易リバーブ。合成IRなので素材不要。
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.8, 3.2);
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.85;
    reverb.connect(reverbGain).connect(master);
  }

  function loadBuffer(): Promise<void> {
    if (!ctx) return Promise.resolve();
    if (bedBuffer) return Promise.resolve();
    if (!loadingPromise) {
      loadingPromise = fetch(BGM_URL)
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx!.decodeAudioData(ab))
        .then((buf) => { bedBuffer = buf; })
        .catch((e) => { loadingPromise = null; throw e; });
    }
    return loadingPromise;
  }

  function startBed() {
    if (!ctx || !bedBuffer || bedSource) return;
    bedSource = ctx.createBufferSource();
    bedSource.buffer = bedBuffer;
    bedSource.loop = true;
    bedSource.connect(bedFilter!);
    bedSource.start();
  }

  // ドラッグ層(space): 浮遊するパッド（基音＋5度＋オクターブ＋上の倍音）＋薄い空気＋ゆっくり揺れる LFO。
  function buildDrag() {
    if (!ctx || !dragOut) return;
    for (const s of dragSources) { try { s.stop(); } catch { /* ignore */ } s.disconnect(); }
    dragSources = [];
    if (dragFilter) { dragFilter.disconnect(); dragFilter = null; }

    dragFilter = ctx.createBiquadFilter();
    dragFilter.type = "lowpass";
    dragFilter.Q.value = 0.7;
    dragFilter.frequency.value = DRAG_LO;
    dragFilter.connect(dragOut);

    const addNoise = (gain: number) => {
      const src = ctx!.createBufferSource();
      src.buffer = noiseBuffer; src.loop = true;
      const g = ctx!.createGain(); g.gain.value = gain;
      src.connect(g).connect(dragFilter!);
      src.start();
      dragSources.push(src);
    };
    const addOsc = (freq: number, gain: number) => {
      const o = ctx!.createOscillator(); o.type = "sine"; o.frequency.value = freq;
      const g = ctx!.createGain(); g.gain.value = gain;
      o.connect(g).connect(dragFilter!);
      o.start();
      dragSources.push(o);
    };

    // 低域に偏ると小型スピーカーで埋もれるので、中高域の倍音も入れて「聞こえ」を確保。
    addOsc(130.81, 0.26); // C3
    addOsc(196.00, 0.26); // G3 (5度)
    addOsc(261.63, 0.30); // C4 (オクターブ)
    addOsc(392.00, 0.24); // G4 (上の5度) — 存在感・明るさ
    addOsc(523.25, 0.14); // C5 — かすかなきらめき
    addNoise(0.10);       // 薄い空気感
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 160; // ±160Hz の浮遊する揺れ
    lfo.connect(lfoGain).connect(dragFilter.frequency);
    lfo.start();
    dragSources.push(lfo);
  }

  function ensureRunning() {
    if (!ctx || ctx.state !== "suspended") return;
    ctx.resume().catch(() => { /* ignore */ });
    const resume = () => { ctx?.resume().catch(() => { /* ignore */ }); cleanup(); };
    const cleanup = () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("touchstart", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("touchstart", resume, { once: true });
  }

  function applyOutput() {
    if (!ctx || !master) return;
    const vol = enabled && visible ? BASE_VOLUME : 0;
    master.gain.setTargetAtTime(vol, ctx.currentTime, OUT_SMOOTH);
  }

  function setEnabled(next: boolean, opts?: { persist?: boolean }) {
    enabled = next;
    if (opts?.persist !== false) writePref(next);
    if (next) {
      ensureContext();
      ensureRunning();
      buildDrag();
      loadBuffer().then(() => { startBed(); applyOutput(); }).catch(() => { /* ignore */ });
    }
    applyOutput();
    for (const cb of changeCbs) cb(enabled);
  }

  // 音量エンベロープ（attack→peak、その後 dur で減衰）。
  function envel(g: GainNode, t: number, peak: number, attack: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  }

  // クリック音の出力をドライ(master)とリバーブ(余韻)の両方へ送る。
  function clickOut(node: AudioNode) {
    if (master) node.connect(master);
    if (reverb) node.connect(reverb);
  }

  // 旋律ウォーク: データ(pitch01)が示す音域へ寄せつつ、1〜2度ずつ動いて連続で同じ音を出さない。
  // 単純ランダムの散漫さを避けつつ、クリックするほど小さなメロディが紡がれる。
  function nextPitchMul(pitch01: number): number {
    const N = PENTA.length;
    const target = pitch01 * (N - 1); // データが示す音域（度数）
    let idx: number;
    if (lastDegree < 0) {
      idx = Math.round(target);
    } else {
      let dir = Math.sign(target - lastDegree);
      if (dir === 0) dir = Math.random() < 0.5 ? -1 : 1;
      const toward = Math.random() < 0.7 ? dir : -dir;     // 7割は data の音域へ寄る
      const step = toward * (Math.random() < 0.6 ? 1 : 2); // 1〜2度の音程で動く
      idx = Math.max(0, Math.min(N - 1, lastDegree + step));
      if (idx === lastDegree) idx = Math.max(0, Math.min(N - 1, lastDegree + (lastDegree === 0 ? 1 : -1)));
    }
    lastDegree = idx;
    return Math.pow(2, PENTA[idx] / 12);
  }

  // クリックのワンショット（glass: 非整数倍音のベル）。減衰を長くしリバーブへも送って余韻を出す。
  // 注意: AudioScheduledSourceNode は start() を呼んでから stop() を呼ぶこと（順序厳守）。
  function fireClick(pitch01 = 0.5) {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const base = 880 * nextPitchMul(pitch01); // 旋律ウォーク＋データ音域バイアス（連続で同じ音にしない）
    const partials: [number, number, number][] = [
      [1.0,  0.5,  2.6],  // [周波数比, ゲイン, 減衰秒]
      [2.76, 0.30, 1.9],
      [5.40, 0.16, 1.2],
    ];
    for (const [ratio, amp, dur] of partials) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = base * ratio;
      const g = ctx.createGain();
      envel(g, t, amp * 0.5, 0.004, dur);
      o.connect(g);
      clickOut(g);
      o.start(t); o.stop(t + dur + 0.05);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    }
  }

  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState !== "hidden";
    applyOutput();
    if (!ctx) return;
    if (!visible) {
      window.setTimeout(() => { if (!visible) ctx?.suspend().catch(() => { /* ignore */ }); }, 350);
    } else if (enabled) {
      ctx.resume().catch(() => { /* ignore */ });
    }
  });

  return {
    isEnabled: () => enabled,
    setEnabled,
    bump(amount = 1) { activity = Math.min(1, activity + amount); },
    ping(pitch01 = 0.5) { fireClick(pitch01); },
    update(dt, speed = 0) {
      activity *= Math.exp(-dt / ACTIVITY_TAU);
      const mTarget = Math.min(1, speed / SPEED_REF);
      // 非対称: 動かしたら即応(ATTACK)、止めたらゆっくり減衰(RELEASE)。急停止でも余韻を残す。
      const mTau = mTarget > motion ? MOTION_ATTACK : MOTION_RELEASE;
      motion += (mTarget - motion) * (1 - Math.exp(-dt / mTau));
      const target = Math.max(motion, activity);
      energy += (target - energy) * (1 - Math.exp(-dt / ENERGY_TAU));

      if (!ctx || !bedFilter || !dynGain || !dragOut) return;
      const tc = ctx.currentTime;
      bedFilter.frequency.setTargetAtTime(IDLE_CUT + (ACTIVE_CUT - IDLE_CUT) * energy, tc, PARAM_SMOOTH);
      dynGain.gain.setTargetAtTime(IDLE_DYN + (ACTIVE_DYN - IDLE_DYN) * energy, tc, PARAM_SMOOTH);
      dragOut.gain.setTargetAtTime(Math.pow(motion, 0.8) * DRAG_MAX, tc, MOTION_SMOOTH);
      if (dragFilter) {
        dragFilter.frequency.setTargetAtTime(DRAG_LO + (DRAG_HI - DRAG_LO) * motion, tc, MOTION_SMOOTH);
      }
    },
    onChange(cb) { changeCbs.push(cb); },
    async beginCapture() {
      ensureContext();
      if (!ctx || !master) return null;
      captureRestore = enabled;
      setEnabled(true, { persist: false }); // 一時有効化（pref は汚さない）。bed の音を録画に載せる
      try { await loadBuffer(); } catch { /* ignore */ }
      startBed();
      try { await ctx.resume(); } catch { /* ignore */ }
      captureDest = ctx.createMediaStreamDestination();
      master.connect(captureDest); // ctx.destination と並行して録画ストリームへ分岐
      return captureDest.stream.getAudioTracks()[0] ?? null;
    },
    endCapture() {
      if (master && captureDest) {
        try { master.disconnect(captureDest); } catch { /* ignore */ }
      }
      captureDest = null;
      setEnabled(captureRestore, { persist: false });
    },
  };
}
