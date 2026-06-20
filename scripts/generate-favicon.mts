/**
 * favicon 生成スクリプト
 *
 * 「Kanji-Verse」の語源となる4文字 漢・字・宇・宙（漢字＝kanji / 宇宙＝verse）を、
 * 深宇宙の背景に発光する星のように重ね合わせた密なクラスタとして描く。
 * アプリ本体（夜空に漢字が星として浮かぶ）を 1 タイルに凝縮したブランドマーク。
 *
 * グリフのアウトライン（ベクターパス）を単一の真実とし、
 *   - public/favicon.svg          : ベクター（フォント非依存・全サイズで鮮明）
 *   - public/favicon.ico          : 16/32/48 ラスタ（レガシー・/favicon.ico フォールバック）
 *   - public/apple-touch-icon.png : 180x180（iOS ホーム画面）
 *   - public/icon-512.png         : 512（PWA / 大サイズ）
 * を同一の配置から出力する。
 *
 * フォント: 游明朝 Light（Windows 同梱 yuminl.ttf）。.ttc は opentype.js 非対応のため
 * plain TTF の游明朝を使用。Light の繊細な細線が OGP の Inter Light の雰囲気と調和する。
 *
 * Usage: npx tsx scripts/generate-favicon.mts
 */

import opentype from "opentype.js";
import { createCanvas, Path2D as NapiPath2D } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");

// --- フォント読み込み（游明朝 Light） ---
const FONT_PATH = "/mnt/c/Windows/Fonts/yuminl.ttf";
const fontBuf = readFileSync(FONT_PATH);
const font = opentype.parse(
  fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength)
);

// --- デザイン座標系（512 正方） ---
const VB = 512;
const BG = "#05050f";

// 4文字の配置（2x2、読み順 漢→字／宇→宙）。
// 全て白・回転なし（端正に）。大小でリズムを作り（対角に大⇔小）、大きい字はタイルから少しはみ出させてダイナミックに。
// 明暗を少しばらつかせ、近い星/遠い星のような奥行きを出す。
const WHITE = "#eef2ff";
interface Placement {
  ch: string;
  cx: number; // 中心X
  cy: number; // 中心Y
  size: number; // fontSize(px)
  rot: number; // 回転(deg)
  color: string;
  alpha: number;
}
const PLACEMENTS: Placement[] = [
  { ch: "漢", cx: 158, cy: 166, size: 304, rot: 0, color: WHITE, alpha: 0.95 }, // 大・左上（はみ出し）
  { ch: "字", cx: 354, cy: 184, size: 232, rot: 0, color: WHITE, alpha: 1.0 }, //  小・右上
  { ch: "宇", cx: 170, cy: 352, size: 220, rot: 0, color: WHITE, alpha: 0.82 }, // 小・左下
  { ch: "宙", cx: 348, cy: 346, size: 296, rot: 0, color: WHITE, alpha: 0.96 }, // 大・右下（はみ出し）
];

// グリフのパス（中心原点に正規化）と SVG path data を取得
function glyphPath(ch: string, size: number) {
  const glyph = font.charToGlyph(ch);
  const path = glyph.getPath(0, 0, size); // baseline 原点・y下向き
  const bb = path.getBoundingBox();
  const ccx = (bb.x1 + bb.x2) / 2;
  const ccy = (bb.y1 + bb.y2) / 2;
  return { d: path.toPathData(3), ccx, ccy };
}

// =================== SVG ===================
function buildSVG(): string {
  const groups = PLACEMENTS.map((p) => {
    const { d, ccx, ccy } = glyphPath(p.ch, p.size);
    return `    <g transform="translate(${p.cx} ${p.cy}) rotate(${p.rot}) translate(${(-ccx).toFixed(2)} ${(-ccy).toFixed(2)})" fill="${p.color}" fill-opacity="${p.alpha}" filter="url(#glow)"><path d="${d}"/></g>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}">
  <defs>
    <radialGradient id="space" cx="50%" cy="44%" r="62%">
      <stop offset="0%" stop-color="#0c0c24"/>
      <stop offset="60%" stop-color="#07071a"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <!-- 多層グロー: 広い柔らかいハロー + 中間 + 締まった芯 -->
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b2"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b3"/>
      <feMerge>
        <feMergeNode in="b1"/>
        <feMergeNode in="b1"/>
        <feMergeNode in="b2"/>
        <feMergeNode in="b3"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <clipPath id="tile"><rect x="0" y="0" width="${VB}" height="${VB}" rx="104" ry="104"/></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect x="0" y="0" width="${VB}" height="${VB}" fill="url(#space)"/>
${groups}
  </g>
</svg>
`;
}

// =================== PNG（同一配置を canvas に描画） ===================
function renderPNG(px: number): Buffer {
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext("2d");
  const s = px / VB; // 512 -> px スケール

  // 角丸タイルにクリップ
  const r = 104 * s;
  roundRectPath(ctx, 0, 0, px, px, r);
  ctx.save();
  ctx.clip();

  // 背景（放射状の宇宙グラデ）
  const g = ctx.createRadialGradient(px * 0.5, px * 0.44, 0, px * 0.5, px * 0.44, px * 0.62);
  g.addColorStop(0, "#0c0c24");
  g.addColorStop(0.6, "#07071a");
  g.addColorStop(1, BG);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);

  // 4文字（多層グロー付き）
  const GLOW = "#cdd8ff"; // 白に近い青の発光
  for (const p of PLACEMENTS) {
    const { d, ccx, ccy } = glyphPath(p.ch, p.size);
    const path = new NapiPath2D(d);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.cx * s, p.cy * s);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.scale(s, s);
    ctx.translate(-ccx, -ccy);
    ctx.fillStyle = p.color;
    // 広い→締まった の順に重ねてハローを作る
    ctx.shadowColor = GLOW;
    for (const blur of [16, 16, 7, 2.5]) {
      ctx.shadowBlur = blur * s;
      ctx.fill(path);
    }
    // 芯（シャープ）
    ctx.shadowBlur = 0;
    ctx.fill(path);
    ctx.restore();
  }
  ctx.restore();

  return canvas.toBuffer("image/png");
}

function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// =================== ICO（PNG 埋め込み・16/32/48） ===================
function buildICO(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries: Buffer[] = [];
  const images: Buffer[] = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
    images.push(data);
  }
  return Buffer.concat([header, ...entries, ...images]);
}

// =================== 出力 ===================
const svg = buildSVG();
writeFileSync(resolve(publicDir, "favicon.svg"), svg);

const png512 = renderPNG(512);
writeFileSync(resolve(publicDir, "icon-512.png"), png512);

const png180 = renderPNG(180);
writeFileSync(resolve(publicDir, "apple-touch-icon.png"), png180);

const ico = buildICO([
  { size: 16, data: renderPNG(16) },
  { size: 32, data: renderPNG(32) },
  { size: 48, data: renderPNG(48) },
]);
writeFileSync(resolve(publicDir, "favicon.ico"), ico);

console.log("favicon assets generated:");
console.log("  public/favicon.svg          ", svg.length, "bytes");
console.log("  public/favicon.ico          ", ico.length, "bytes");
console.log("  public/apple-touch-icon.png ", png180.length, "bytes");
console.log("  public/icon-512.png         ", png512.length, "bytes");
