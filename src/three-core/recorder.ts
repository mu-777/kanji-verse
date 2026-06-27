// 動画クリップのエンコーダ（WebCodecs オフライン生成）。
//
// リアルタイム MediaRecorder は (1) 可変フレームレートで実測 ~12fps とカクつき、(2) キーフレームが
// 先頭1枚のみ＋A/V長不一致で Windows プレイヤーが終端エラー、という問題があった（ADR-0011）。
// そこで 1フレームずつオフラインでレンダリング → VideoEncoder(H.264) でエンコード、音声は録画専用
// mp3 を AudioEncoder(AAC) でエンコードし、mp4-muxer で 1本の MP4 に多重化する。
//   - CFR 30fps（タイムスタンプを固定間隔で打つ）＝なめらか
//   - 1秒ごとにキーフレーム＝シーク/ループ可、Windows でも正常再生
//   - A/V を同尺に作る＝終端エラーなし
//   - 端末性能に依存しない（実時計から切り離す）。Android でも MP4 確定。
//
// 映像は WebGL canvas を 1080² の 2D 合成キャンバスへ中央クロップ＋透かし＋終端フェードして作る。

import { Muxer, ArrayBufferTarget } from "mp4-muxer";

const VIDEO_BITRATE = 5_000_000;
const AUDIO_BITRATE = 128_000;
const KEY_INTERVAL_SEC = 1;

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  duration: number; // 秒
  /** 透かしに焼き込むディープリンクURL（例: mu-777.github.io/kanji-verse/?k=愛）。 */
  watermarkUrl: string;
  /** 録画専用の音声ファイル URL（mp3 等）。失敗時は無音動画になる。 */
  audioUrl: string;
  /** 時刻 t（秒）のフレームを描いて WebGL canvas を返す。 */
  renderFrame: (t: number) => HTMLCanvasElement;
  /** 時刻 t（秒）の終端フェード量 0..1（1=全黒）。 */
  fadeAt: (t: number) => number;
  /** 進捗 0..1。 */
  onProgress?: (p: number) => void;
}

/** WebCodecs + AudioData/VideoFrame が使えるか（Share ボタンの出し分けに使う）。 */
export function clipEncodingSupported(): boolean {
  return typeof VideoEncoder !== "undefined"
    && typeof AudioEncoder !== "undefined"
    && typeof VideoFrame !== "undefined"
    && typeof AudioData !== "undefined";
}

/** 1080² を満たす H.264 コーデック文字列を選ぶ（Main@4.0 を基本に、対応する最初のものを採用）。 */
async function pickAvcCodec(width: number, height: number, fps: number): Promise<string> {
  const candidates = ["avc1.4D0028", "avc1.640028", "avc1.42E028", "avc1.4D0020"];
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: VIDEO_BITRATE, framerate: fps, latencyMode: "realtime" });
      if (res.supported) return codec;
    } catch { /* try next */ }
  }
  return "avc1.4D0028";
}

/** 透かし（グラデーション＋ワードマーク＋URL）を一度だけ描いたオフスクリーンを返す。
 *  毎フレーム shadowBlur を焼くのは重いので静的に作り、フレーム合成では drawImage するだけにする。 */
function makeWatermark(width: number, height: number, url: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d")! as CanvasRenderingContext2D & { letterSpacing?: string };

  const g = ctx.createLinearGradient(0, height - 260, 0, height);
  g.addColorStop(0, "rgba(3, 3, 15, 0)");
  g.addColorStop(1, "rgba(3, 3, 15, 0.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, height - 260, width, 260);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(150, 170, 255, 0.5)";

  ctx.shadowBlur = 26;
  ctx.fillStyle = "rgba(224, 228, 255, 0.94)";
  ctx.font = '300 32px "Inter", "Hiragino Kaku Gothic ProN", sans-serif';
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "12px";
  ctx.fillText("KANJI-VERSE", width / 2 - 6, height - 96);

  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(190, 200, 255, 0.72)";
  ctx.font = '300 23px "Inter", "Hiragino Kaku Gothic ProN", sans-serif';
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "1px";
  ctx.fillText(url, width / 2, height - 56);

  return c;
}

/** 録画用音声を decode し、clip 長へループ＋終端フェードした AudioBuffer を返す（失敗時 null）。 */
async function decodeClipAudio(
  url: string,
  duration: number,
  fadeAt: (t: number) => number,
): Promise<AudioBuffer | null> {
  try {
    const resp = await fetch(url);
    const ab = await resp.arrayBuffer();
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const decoded = await ac.decodeAudioData(ab);
    const sr = decoded.sampleRate;
    const ch = decoded.numberOfChannels;
    const total = Math.floor(duration * sr);
    const out = ac.createBuffer(ch, total, sr);
    for (let c = 0; c < ch; c++) {
      const src = decoded.getChannelData(c);
      const dst = out.getChannelData(c);
      const srcLen = src.length;
      for (let i = 0; i < total; i++) {
        const t = i / sr;
        const gain = 1 - Math.min(1, Math.max(0, fadeAt(t)));
        dst[i] = src[i % srcLen] * gain; // ループ＋終端フェード
      }
    }
    ac.close();
    return out;
  } catch {
    return null;
  }
}

/** AudioBuffer を AudioData チャンクに分けて AudioEncoder へ流す（f32-planar）。 */
function feedAudio(encoder: AudioEncoder, buf: AudioBuffer) {
  const sr = buf.sampleRate;
  const ch = buf.numberOfChannels;
  const total = buf.length;
  const block = 4096;
  for (let off = 0; off < total; off += block) {
    const n = Math.min(block, total - off);
    const data = new Float32Array(n * ch); // planar: [ch0...][ch1...]
    for (let c = 0; c < ch; c++) {
      data.set(buf.getChannelData(c).subarray(off, off + n), c * n);
    }
    const ad = new AudioData({
      format: "f32-planar",
      sampleRate: sr,
      numberOfFrames: n,
      numberOfChannels: ch,
      timestamp: Math.round((off / sr) * 1e6),
      data,
    });
    encoder.encode(ad);
    ad.close();
  }
}

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

export async function encodeClip(opts: EncodeOptions): Promise<Blob> {
  const { width, height, fps, duration } = opts;
  const totalFrames = Math.round(duration * fps);

  // 音声を先に用意（muxer の audio 設定に sampleRate/channels が要る）
  const audioBuf = await decodeClipAudio(opts.audioUrl, duration, opts.fadeAt);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioBuf ? { codec: "aac", numberOfChannels: audioBuf.numberOfChannels, sampleRate: audioBuf.sampleRate } : undefined,
    fastStart: "in-memory",
  });

  // ── 映像 ──
  const canvas2d = document.createElement("canvas");
  canvas2d.width = width; canvas2d.height = height;
  const ctx = canvas2d.getContext("2d")!;
  const watermark = makeWatermark(width, height, opts.watermarkUrl);

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  const codec = await pickAvcCodec(width, height, fps);
  // latencyMode:"realtime" でエンコードを高速化（速いプリセット。7秒クリップなら画質影響は軽微）
  videoEncoder.configure({ codec, width, height, bitrate: VIDEO_BITRATE, framerate: fps, latencyMode: "realtime" });

  const frameDurUs = 1e6 / fps;
  const keyEvery = Math.max(1, Math.round(KEY_INTERVAL_SEC * fps));

  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) throw encodeError;
    const t = i / fps;
    const src = opts.renderFrame(t);

    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, width, height);
    const sw = src.width, sh = src.height;
    const sq = Math.min(sw, sh), sx = (sw - sq) / 2, sy = (sh - sq) / 2;
    ctx.drawImage(src, sx, sy, sq, sq, 0, 0, width, height); // 中央正方形クロップ
    ctx.drawImage(watermark, 0, 0);                          // 静的透かし
    const fade = opts.fadeAt(t);
    if (fade > 0) { ctx.fillStyle = `rgba(5, 5, 15, ${Math.min(1, fade)})`; ctx.fillRect(0, 0, width, height); }

    const frame = new VideoFrame(canvas2d, { timestamp: Math.round(i * frameDurUs), duration: Math.round(frameDurUs) });
    videoEncoder.encode(frame, { keyFrame: i % keyEvery === 0 });
    frame.close();

    opts.onProgress?.(((i + 1) / totalFrames) * 0.9);

    // バックプレッシャー回避＆UI（スピナー）を動かすため適宜 yield
    if (videoEncoder.encodeQueueSize > 20) {
      while (videoEncoder.encodeQueueSize > 8) await yieldToMain();
    } else if (i % 5 === 0) {
      await yieldToMain();
    }
  }
  await videoEncoder.flush();

  // ── 音声 ──
  if (audioBuf) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { encodeError = e; },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      numberOfChannels: audioBuf.numberOfChannels,
      sampleRate: audioBuf.sampleRate,
      bitrate: AUDIO_BITRATE,
    });
    feedAudio(audioEncoder, audioBuf);
    await audioEncoder.flush();
  }
  if (encodeError) throw encodeError;
  opts.onProgress?.(1);

  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
