/**
 * OGP画像生成スクリプト
 *
 * kanji-2d.json の座標データを使って、夜空風の漢字ビジュアライゼーション画像を生成する。
 * 出力: public/ogp.png (1200x630)
 *
 * Usage: npx tsx scripts/generate-ogp.mts
 */

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const WIDTH = 1200;
const HEIGHT = 630;
const BG_COLOR = "#05050f";
const TITLE = "Kanji-Verse";
const SUBTITLE = "漢字の意味の星空";

// クラスタごとの色相（アプリの配色に近い暖色〜寒色のグラデーション）
const CLUSTER_HUES = [
  210, 30, 270, 150, 330, 60, 190, 350, 120, 250, 20, 170, 300, 90, 220, 45,
  280, 140, 10, 200,
];

interface KanjiEntry {
  k: string;
  x: number;
  y: number;
  t: number;
  c: number;
}

// --- Main ---
const dataPath = resolve(__dirname, "../public/data/kanji-2d.json");
const outPath = resolve(__dirname, "../public/ogp.png");

const kanji: KanjiEntry[] = JSON.parse(readFileSync(dataPath, "utf8"));

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

// Background
ctx.fillStyle = BG_COLOR;
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Margins to avoid edge clipping
const marginX = 80;
const marginY = 60;
const drawW = WIDTH - marginX * 2;
const drawH = HEIGHT - marginY * 2;

// Draw kanji as stars
// Shuffle for natural layering
const shuffled = [...kanji].sort(() => Math.random() - 0.5);

for (const entry of shuffled) {
  const px = marginX + entry.x * drawW;
  const py = marginY + entry.y * drawH;
  const hue = CLUSTER_HUES[entry.c % CLUSTER_HUES.length];

  // Vary brightness/size slightly by type (joyo vs jinmei)
  const brightness = entry.t === 0 ? 0.7 + Math.random() * 0.3 : 0.4 + Math.random() * 0.3;
  const fontSize = entry.t === 0 ? 8 + Math.random() * 4 : 6 + Math.random() * 3;

  // Glow effect
  ctx.shadowColor = `hsla(${hue}, 80%, 70%, ${brightness * 0.6})`;
  ctx.shadowBlur = 8;

  ctx.fillStyle = `hsla(${hue}, 70%, ${50 + brightness * 30}%, ${brightness})`;
  ctx.font = `${fontSize}px "IPAGothic"`;
  ctx.fillText(entry.k, px, py);
}

// Reset shadow for text overlay
ctx.shadowColor = "transparent";
ctx.shadowBlur = 0;

// Semi-transparent gradient overlay at bottom for title readability
const grad = ctx.createLinearGradient(0, HEIGHT * 0.45, 0, HEIGHT);
grad.addColorStop(0, "rgba(5, 5, 15, 0)");
grad.addColorStop(0.5, "rgba(5, 5, 15, 0.6)");
grad.addColorStop(1, "rgba(5, 5, 15, 0.9)");
ctx.fillStyle = grad;
ctx.fillRect(0, HEIGHT * 0.45, WIDTH, HEIGHT * 0.55);

// Title
ctx.textAlign = "center";
ctx.textBaseline = "middle";

// Title glow
ctx.shadowColor = "rgba(180, 200, 255, 0.5)";
ctx.shadowBlur = 30;
ctx.fillStyle = "#e0e4ff";
ctx.font = 'bold 64px "IPAGothic"';
ctx.fillText(TITLE, WIDTH / 2, HEIGHT * 0.68);

// Subtitle
ctx.shadowBlur = 15;
ctx.fillStyle = "rgba(200, 210, 255, 0.8)";
ctx.font = '24px "IPAGothic"';
ctx.fillText(SUBTITLE, WIDTH / 2, HEIGHT * 0.82);

// Reset
ctx.shadowColor = "transparent";
ctx.shadowBlur = 0;

// Output
const buf = canvas.toBuffer("image/png");
writeFileSync(outPath, buf);
console.log(`OGP image generated: ${outPath} (${buf.length} bytes)`);
