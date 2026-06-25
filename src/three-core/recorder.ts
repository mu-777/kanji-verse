// 動画クリップのレコーダー。
//
// WebGL canvas を 1080×1080 の 2D 合成キャンバスへ中央クロップで drawImage し（＝1:1 化）、
// その上にブランド透かし（ワードマーク＋ディープリンクURL）を焼き込む。この 2D キャンバスから
// captureStream(30) を取り、BGM の音声トラックと束ねて MediaRecorder に流す。
//
// 形式は MP4(H.264) を優先（iOS Safari は標準で MP4。X/LINE が嫌う webm を避ける）。
// 非対応端末では webm にフォールバックする。
//
// drawFrame は通常のレンダーループ末尾（composer.render → proximityLabel.render の直後）に
// 同フレーム内で呼ぶ。これにより preserveDrawingBuffer なしでも WebGL canvas の画素を読める。

const SIZE = 1080;
const FPS = 30;
const VIDEO_BITRATE = 5_000_000; // 1:1 1080 / 約7秒 ≈ 4.4MB（user-attachments の 10MB 上限内）

export interface ClipRecorder {
  readonly mimeType: string;
  readonly ext: "mp4" | "webm";
  /** 録画開始。 */
  start(): void;
  /** レンダーループ末尾で毎フレーム呼ぶ。src は WebGL canvas。 */
  drawFrame(src: HTMLCanvasElement): void;
  /** 録画停止。完成した Blob を返す。 */
  stop(): Promise<Blob>;
}

interface Options {
  /** BGM の音声トラック（null なら無音動画）。 */
  audioTrack: MediaStreamTrack | null;
  /** 透かしに焼き込むディープリンクURL（例: mu-777.github.io/kanji-verse/?k=愛）。 */
  url: string;
}

/** ブラウザがエンコードできる最良の形式を選ぶ（MP4 優先）。 */
function pickMime(): { mimeType: string; ext: "mp4" | "webm" } {
  const candidates: { m: string; ext: "mp4" | "webm" }[] = [
    { m: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { m: "video/mp4;codecs=avc1", ext: "mp4" },
    { m: "video/mp4", ext: "mp4" },
    { m: "video/webm;codecs=vp9,opus", ext: "webm" },
    { m: "video/webm;codecs=vp8,opus", ext: "webm" },
    { m: "video/webm", ext: "webm" },
  ];
  const supported = typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function";
  for (const c of candidates) {
    if (supported && MediaRecorder.isTypeSupported(c.m)) return { mimeType: c.m, ext: c.ext };
  }
  return { mimeType: "", ext: "webm" }; // 既定（ブラウザ任せ）
}

export function createClipRecorder(opts: Options): ClipRecorder {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  // letterSpacing は新しめのブラウザのみ（未対応では無視される）。型互換のため緩く扱う。
  const ctxAny = ctx as CanvasRenderingContext2D & { letterSpacing?: string };

  const { mimeType, ext } = pickMime();

  const stream = canvas.captureStream(FPS);
  if (opts.audioTrack) stream.addTrack(opts.audioTrack);

  const rec = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: VIDEO_BITRATE } : { videoBitsPerSecond: VIDEO_BITRATE },
  );
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  function drawWatermark() {
    // 下部に暗いグラデーションを敷いて文字の可読性を上げる
    const g = ctx.createLinearGradient(0, SIZE - 260, 0, SIZE);
    g.addColorStop(0, "rgba(3, 3, 15, 0)");
    g.addColorStop(1, "rgba(3, 3, 15, 0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(0, SIZE - 260, SIZE, 260);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(150, 170, 255, 0.5)";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // ワードマーク（OGP と同じ Inter Light・大文字・ワイドトラッキング）
    ctx.shadowBlur = 26;
    ctx.fillStyle = "rgba(224, 228, 255, 0.94)";
    ctx.font = '300 32px "Inter", "Hiragino Kaku Gothic ProN", sans-serif';
    if (ctxAny.letterSpacing !== undefined) ctxAny.letterSpacing = "12px";
    // letterSpacing の末尾分だけ右に寄るのを軽く補正
    ctx.fillText("KANJI-VERSE", SIZE / 2 - 6, SIZE - 96);

    // ディープリンクURL
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(190, 200, 255, 0.72)";
    ctx.font = '300 23px "Inter", "Hiragino Kaku Gothic ProN", sans-serif';
    if (ctxAny.letterSpacing !== undefined) ctxAny.letterSpacing = "1px";
    ctx.fillText(opts.url, SIZE / 2, SIZE - 56);

    // 後続描画に影響しないようリセット
    if (ctxAny.letterSpacing !== undefined) ctxAny.letterSpacing = "0px";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  function drawFrame(src: HTMLCanvasElement) {
    const sw = src.width;
    const sh = src.height;
    if (sw === 0 || sh === 0) return;
    const sq = Math.min(sw, sh);
    const sx = (sw - sq) / 2;
    const sy = (sh - sq) / 2;
    ctx.fillStyle = "#05050f";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(src, sx, sy, sq, sq, 0, 0, SIZE, SIZE); // 中央正方形クロップ
    drawWatermark();
  }

  return {
    mimeType,
    ext,
    start() { rec.start(); },
    drawFrame,
    stop() {
      return new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
        rec.stop();
      });
    },
  };
}
