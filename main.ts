// ─────────────────────────────────────────────────────────────────────────────
// news-image-20261120 — "one image sums up Friday 20 November 2026"
//   C3 layout from the 20261119 edition, adapted to 7 stories / 8 map pins.
//
// Node 22+, standard library only, no network, fully deterministic.
// The page is drawn from scratch: own framebuffer (supersampled 2x), own
// stroke font with per-glyph advances and kerning pairs, own polygon world
// map, own PNG encoder. Writes exactly one file:
//   $MAKEFUN_OUTPUT_DIR/entry.png   (1024x1024, <= 1 MiB)
//
// Preview only — do not submit, do not publish.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

// ── Geometry ─────────────────────────────────────────────────────────────────
const W = 1024;
const H = 1024;
const SS = 2; // supersample factor: render at 2048x2048, box-downsample to 1024
const FW = W * SS;
const FH = H * SS;

// ── Palette ──────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const rgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const PAPER = rgb("#f7f3ea");
const INK = rgb("#16283f");
const RED = rgb("#b3342a");
const GOLD = rgb("#f2a541");
const CARD = rgb("#fffdf6");
const BANNER_BG = rgb("#efe7d3");
const MUTED = rgb("#5f6e7d"); // muted ink on paper
const MUTED_NAVY = rgb("#b9c5d1"); // muted ink on navy
const WHITE: RGB = [255, 255, 255];
const OCEAN = rgb("#cfdae4"); // map background
const REGION: Record<string, RGB> = {
  asia: rgb("#c96f2e"),
  europe: rgb("#3e6fb0"),
  americas: rgb("#7a4f9e"),
  middleEast: rgb("#b3342a"),
  africa: rgb("#4d8a4f"),
  oceania: rgb("#2e8a8a"),
};
const HAIRLINE = rgb("#2c4258"); // thin separators on navy
const RULE = rgb("#8a97a3"); // thin rule on paper
// hero night scene
const NIGHT_TOP = rgb("#0b1526");
const NIGHT_MID = rgb("#16294d");
const NIGHT_GLOW = rgb("#c65a2e");
const RIVER = rgb("#101d3a");
const BRIDGE = rgb("#0a1220");
const FLASH = rgb("#f6c453");
const EMBER = rgb("#e2703a");
const SMOKE = rgb("#6b7280");

// ── PNG encoder (filter 0 rows, zlib level 9) ────────────────────────────────
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(rgbBuf: Buffer, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    rgbBuf.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Framebuffer ──────────────────────────────────────────────────────────────
// All drawing coordinates are in final 1024px space; helpers scale by SS.
const fb = Buffer.alloc(FW * FH * 3);
function fillPaper(): void {
  for (let i = 0; i < FW * FH; i++) {
    fb[i * 3] = PAPER[0];
    fb[i * 3 + 1] = PAPER[1];
    fb[i * 3 + 2] = PAPER[2];
  }
}
function setPx(fx: number, fy: number, c: RGB): void {
  if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return;
  const i = (fy * FW + fx) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(FW, Math.round((x + w) * SS));
  const y1 = Math.min(FH, Math.round((y + h) * SS));
  for (let fy = y0; fy < y1; fy++) {
    let i = (fy * FW + x0) * 3;
    for (let fx = x0; fx < x1; fx++, i += 3) {
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
    }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  // filled circle, centre/radius in final px
  const R = r * SS;
  const CX = cx * SS;
  const CY = cy * SS;
  const y0 = Math.max(0, Math.floor(CY - R));
  const y1 = Math.min(FH - 1, Math.ceil(CY + R));
  for (let fy = y0; fy <= y1; fy++) {
    const dy = fy + 0.5 - CY;
    const half = Math.sqrt(Math.max(0, R * R - dy * dy));
    const x0 = Math.max(0, Math.floor(CX - half));
    const x1 = Math.min(FW - 1, Math.ceil(CX + half));
    let i = (fy * FW + x0) * 3;
    for (let fx = x0; fx <= x1; fx++, i += 3) {
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
    }
  }
}
function segment(x1: number, y1: number, x2: number, y2: number, r: number, c: RGB): void {
  // thick line drawn as stamped discs (round caps + joins)
  const X1 = x1 * SS;
  const Y1 = y1 * SS;
  const X2 = x2 * SS;
  const Y2 = y2 * SS;
  const R = r * SS;
  const dx = X2 - X1;
  const dy = Y2 - Y1;
  const len = Math.hypot(dx, dy);
  const step = Math.max(1, R * 0.6);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    disc((X1 + dx * t) / SS, (Y1 + dy * t) / SS, r, c);
  }
}
type Pt = [number, number];
function polyline(pts: Pt[], r: number, c: RGB): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    segment(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, c);
  }
  if (pts.length === 1) disc(pts[0][0], pts[0][1], r, c);
}
function polygon(pts: Pt[], c: RGB): void {
  // even-odd scanline fill, points in final px
  const P = pts.map(([x, y]) => [x * SS, y * SS] as Pt);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of P) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(FH - 1, Math.ceil(maxY));
  for (let fy = y0; fy <= y1; fy++) {
    const y = fy + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1p] = P[i];
      const [x2, y2p] = P[(i + 1) % P.length];
      if ((y1p <= y && y2p > y) || (y2p <= y && y1p > y)) {
        xs.push(x1 + ((y - y1p) / (y2p - y1p)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.floor(xs[k]));
      const xb = Math.min(FW - 1, Math.ceil(xs[k + 1]));
      let i = (fy * FW + xa) * 3;
      for (let fx = xa; fx <= xb; fx++, i += 3) {
        fb[i] = c[0];
        fb[i + 1] = c[1];
        fb[i + 2] = c[2];
      }
    }
  }
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}
function vgrad(x: number, y: number, w: number, h: number, stops: [number, RGB][]): void {
  // vertical multi-stop gradient; stops sorted by position 0..1
  for (let row = 0; row < Math.ceil(h * SS); row++) {
    const t = row / (h * SS - 1);
    let s = 0;
    while (s + 1 < stops.length && stops[s + 1][0] < t) s++;
    const [p0, c0] = stops[s];
    const [p1, c1] = stops[Math.min(s + 1, stops.length - 1)];
    const f = p1 > p0 ? Math.min(1, Math.max(0, (t - p0) / (p1 - p0))) : 0;
    fillRect(x, y + row / SS, w, 1 / SS + 0.01, mix(c0, c1, f));
  }
}
function rectStroke(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}
function pill(x: number, y: number, w: number, h: number, c: RGB): void {
  // rounded-end bar
  fillRect(x + h / 2, y, w - h, h, c);
  disc(x + h / 2, y + h / 2, h / 2, c);
  disc(x + w - h / 2, y + h / 2, h / 2, c);
}

// Box-downsample the 2x framebuffer to the final 1024x1024 RGB buffer.
function downsample(): Buffer {
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * FW + (x * SS + dx)) * 3;
          r += fb[i];
          g += fb[i + 1];
          b += fb[i + 2];
        }
      }
      const o = (y * W + x) * 3;
      const n = SS * SS;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// ── Stroke font ──────────────────────────────────────────────────────────────
// Glyphs as polylines on a 10-wide x 14-tall grid: baseline y=11, cap top
// y=1, x-height top y=4, descender bottom y=14. Each entry is
// [advanceUnits, "x,y x,y; x,y ..."] — strokes separated by ";".
// A stroke with a single point stamps one disc (dots, colons).
// Font size = em = 14 grid units, so 1 unit = size/14 px.
// Bold stroke radius = 1 unit (width size/7); regular = 0.78 units (size/9).
// Advances are per-glyph (narrow glyphs get narrow cells) so words do not
// develop hollow gaps after wide letters (M, m, w) before narrow ones
// (i, l, t). Kerning pairs below tighten the remaining holes.
// Advances + kerning are the reference build's (20261119 C3); three glyphs
// this edition needs were added in the same style: "−" (U+2212 minus),
// "£" (pound, card 6 context) and "í" (Junín, card 5 context).
type GlyphDef = { adv: number; strokes: Pt[][] };
const GLYPH_SRC: Record<string, [number, string]> = {
  // uppercase
  A: [10, "0,11 5,1 10,11;3,7 7,7"],
  B: [9, "1,1 1,11;1,1 6,1 8,2 8,4 6,6 1,6;1,6 7,6 9,8 9,10 7,11 1,11"],
  C: [9, "9,3 7,1 4,1 1,3 1,9 4,11 7,11 9,9"],
  D: [10, "1,1 1,11;1,1 6,1 9,3 9,9 6,11 1,11"],
  E: [8, "8,1 1,1 1,11 8,11;1,6 6,6"],
  F: [8, "8,1 1,1 1,11;1,6 6,6"],
  G: [10, "9,3 7,1 4,1 1,3 1,9 4,11 8,11 9,9 9,6 6,6"],
  H: [10, "1,1 1,11;10,1 10,11;1,6 10,6"],
  I: [5, "0,1 4,1;2,1 2,11;0,11 4,11"],
  J: [8, "7,1 7,10 5,11 2,11 1,9"],
  K: [10, "1,1 1,11;9,1 1,6;4,7 9,11"],
  L: [8, "1,1 1,11 8,11"],
  M: [11, "0,11 0,1 5,8 10,1 10,11"],
  N: [10, "1,11 1,1 10,11 10,1"],
  O: [10, "5,1 2,1 1,3 1,9 2,11 5,11 8,11 9,9 9,3 8,1 5,1"],
  P: [9, "1,1 1,11;1,1 7,1 9,3 9,5 7,6 1,6"],
  Q: [10, "5,1 2,1 1,3 1,9 2,11 5,11 8,11 9,9 9,3 8,1 5,1;7,8 10,11"],
  R: [9, "1,1 1,11;1,1 7,1 9,3 9,5 7,6 1,6;6,6 9,11"],
  S: [9, "9,3 7,1 4,1 1,3 1,5 3,6 6,6 8,8 8,10 6,11 3,11 1,9"],
  T: [9, "0,1 9,1;4.5,1 4.5,11"],
  U: [10, "1,1 1,9 3,11 7,11 9,9 9,1"],
  V: [10, "0,1 5,11 10,1"],
  W: [12, "0,1 2.5,11 5,5 7.5,11 10,1"],
  X: [10, "0,1 10,11;10,1 0,11"],
  Y: [10, "0,1 5,6 10,1;5,6 5,11"],
  Z: [9, "0,1 9,1 0,11 9,11"],
  // lowercase
  a: [8, "7,4 7,11;7,5 4,4 2,6 2,9 4,11 7,11"],
  b: [8, "1,1 1,11;1,8 3,5 6,5 7,7 7,9 5,11 1,11"],
  c: [7, "7,6 5,4 2,4 1,6 1,9 2,11 5,11 7,10"],
  d: [8, "7,1 7,11;7,8 5,5 2,5 1,7 1,9 3,11 7,11"],
  e: [8, "7,9 5,11 2,11 1,9 1,7 3,5 6,5 7,7;1,7 7,7"],
  f: [6, "5,2 3,1 2,3 2,11;1,5 5,5"],
  g: [8, "7,5 4,4 2,6 2,9 4,11 7,11;7,11 7,13 5,14 2,14 1,13"],
  h: [8, "1,1 1,11;1,7 3,5 6,5 7,7 7,11"],
  i: [4, "2,1 2,2;2,4 2,11"],
  j: [5, "2.5,1 2.5,2;2.5,4 2.5,12 2,13.5 0.5,14"],
  k: [8, "1,1 1,11;7,4 1,8;4,9 7,11"],
  l: [4, "2,1 2,11"],
  m: [11, "1,4 1,11;1,7 2,5 4,5 5,7 5,11;5,7 6,5 9,5 10,7 10,11"],
  n: [8, "1,11 1,4;1,7 3,5 6,5 7,7 7,11"],
  o: [8, "4,4 2,5 1,7 1,9 2,11 4,11 6,11 7,9 7,7 6,5 4,4"],
  p: [8, "1,4 1,14;1,8 3,5 6,5 7,7 7,9 5,11 1,11"],
  q: [8, "7,4 7,14;7,8 5,5 2,5 1,7 1,9 3,11 7,11"],
  r: [6, "1,11 1,4;1,7 3,5 5,5 6,6"],
  s: [7, "6,6 4,4 2,4 1,6 1,7 2,9 5,9 6,10 5,11 2,11 1,10"],
  t: [6, "3,1 3,10 4,11 5,11;1,5 5,5"],
  u: [8, "1,4 1,9 3,11 6,11 7,10 7,4"],
  v: [8, "0,4 4,11 8,4"],
  w: [11, "0,4 2.5,11 5,6 7.5,11 10,4"],
  x: [8, "0,4 8,11;8,4 0,11"],
  y: [8, "0,4 4,9 8,4;4,9 4,13 2.5,14 1,14"],
  z: [7, "0,4 7,4 0,11 7,11"],
  // digits — "9" is a closed bowl + a straight right tail, never a hook
  "0": [9, "4.5,1 2,1 1,3 1,9 2,11 4.5,11 7,11 8,9 8,3 7,1 4.5,1"],
  "1": [5, "1,3 3,1 3,11;0,11 5,11"],
  "2": [9, "1,4 1,2 3,1 6,1 8,3 8,5 1,11 8,11"],
  "3": [9, "1,3 3,1 6,1 8,3 8,5 6,6 8,7 8,9 6,11 3,11 1,9"],
  "4": [9, "6,1 1,8 8,8;6,1 6,11"],
  "5": [9, "8,1 1,1 1,6 7,6 8,8 8,10 6,11 2,11 1,9"],
  "6": [9, "8,3 5,1 2,2 1,5 1,9 3,11 6,11 8,9 8,7 6,6 3,6 1,8"],
  "7": [9, "1,1 8,1 3,11"],
  "8": [9, "4.5,1 2,2 1,4 2,6 4.5,6 7,6 8,4 7,2 4.5,1;4.5,6 2,7 1,9 2,11 4.5,11 7,11 8,9 7,7 4.5,6"],
  "9": [9, "3,1 6,1 8,3 8,5 6,7 3,7 1,5 1,3 3,1;8,4 8,11"],
  // punctuation
  ".": [4, "2,10 2,11"],
  ",": [4, "2,10 2,11;2,11 1,13 0,14"],
  "'": [4, "2.5,1 1.5,4"],
  "·": [5, "2.5,6.5"],
  "–": [8, "1,6 7,6"],
  "—": [11, "0,6 10,6"],
  "-": [6, "1,6 5,6"],
  "−": [8, "1,6 7,6"], // U+2212 minus, same bar as en dash, wider cell
  $: [9, "7,3 5,1 2,1 1,3 1,5 3,6 6,6 8,8 8,10 6,11 3,11 1,9;4.5,0 4.5,12"],
  "%": [11, "2,0.5 3.5,2 2,3.5 0.5,2 2,0.5;8.5,8.5 10,10 8.5,11.5 7,10 8.5,8.5;1,11 10,1"],
  "+": [9, "4.5,2 4.5,10;1,6 8,6"],
  ":": [5, "2.5,4;2.5,9"],
  ";": [5, "2.5,4;2.5,9 2.5,10 1.5,12 0.5,13"],
  "/": [7, "5,1 2,11"],
  "(": [5, "4,1 2,3 2,9 4,11"],
  ")": [5, "1,1 3,3 3,9 1,11"],
  "!": [4, "2,1 2,8;2,10.5"],
  "?": [8, "2,4 2,2 4,1 6,1 7,3 7,5 5,7 4,8 4,9;4,10.5"],
  "&": [10, "7,2 5,1 3,1 2,3 2,5 4,7 6,8 8,10 8,11 6,11 4,10 2,8 1,6 2,4 4,3 6,4"],
  "€": [9, "8,3 6,1 3,1 1,3 1,9 3,11 6,11 8,9;0,5 6,5;0,8 6,8"],
  "£": [9, "7,1 5,1 3,1 2,2 2,5 3,6 5,6;2,5 2,9 3,11 5,11 7,10;0,7 6,7"],
  "á": [8, "7,4 7,11;7,5 4,4 2,6 2,9 4,11 7,11;5.5,0 7,2"],
  "í": [4, "3,0 1.5,2;2,4 2,11"], // i with acute accent (Junín)
};
const GLYPHS = new Map<string, GlyphDef>();
for (const [ch, [adv, src]] of Object.entries(GLYPH_SRC)) {
  const strokes: Pt[][] = src.split(";").map((s) =>
    s
      .trim()
      .split(/\s+/)
      .map((p) => {
        const [x, y] = p.split(",").map(Number);
        return [x, y] as Pt;
      }),
  );
  GLYPHS.set(ch, { adv, strokes });
}
const SPACE_ADV = 4; // word space in grid units (~0.29 em, tighter than C2's)

// Kerning pairs, delta in grid units (negative tightens). Targeted at the
// holes a stroke font leaves: a capital with a slanted/open right side
// (A, V, W, Y, T) or a wide lowercase (m, w) before a narrow letter
// (i, l, j, t, f), plus the C2 problem words:
//   "Mi" (Midnight), "mi" (committed), "An" (Anthropic), "To"/"Te"
//   (starts trading), "d"+"r" and the wide word space in "ordered …".
const KERN: Record<string, number> = {
  // capitals before lowercase — the reported holes
  An: -0.9, Ao: -0.9, Ae: -0.9, Au: -0.9, Am: -0.7, Ar: -0.7, Ac: -0.7,
  Ai: -1.3, Al: -1.3, At: -1.1, Af: -1.1, Ay: -0.9,
  Vn: -0.9, Vo: -0.9, Va: -0.9, Ve: -0.9, Vi: -1.3, Vl: -1.3,
  Wn: -0.9, Wo: -0.9, Wa: -0.9, We: -0.9, Wi: -1.3, Wl: -1.3,
  Yn: -0.9, Yo: -0.9, Ya: -0.9, Ye: -0.9, Yi: -1.3,
  To: -0.8, Ta: -0.8, Te: -0.8, Ti: -1.2, Tl: -1.2, Tw: -0.8, Ty: -0.8,
  Av: -1.0, Aw: -1.0, Ay: -1.0, AV: -0.9, AW: -0.9, AY: -0.9,
  Va: -0.9, Wa: -0.9, Ya: -0.9,
  // wide lowercase before narrow letters
  Mi: -1.2, mi: -1.0, ml: -1.0, mj: -1.0, mt: -0.7, mr: -0.5,
  wi: -1.0, wl: -1.0, wo: -0.4,
  ri: -0.4, rl: -0.4, rt: -0.4,
  fi: -0.5, fl: -0.5, ff: -0.5,
  ti: -0.4, tl: -0.4, to: -0.3, ta: -0.3, te: -0.3,
  yo: -0.5, ya: -0.5, ye: -0.5, yi: -0.7,
  // narrow stems (i, l, j) leave dead space on both sides of their cells:
  // tighten pairs where a narrow glyph meets another letter or a stop
  li: -1.2, il: -1.2, ll: -1.2, la: -1.0, ia: -1.0,
  ja: -1.5, je: -1.2, jo: -1.2, ju: -1.2,
  "l.": -0.8, "i.": -0.8, "i,": -0.8, "l,": -0.8, "j.": -0.8, ").": -0.8,
  // "VI" (hero monogram): separate V and I so the pair never reads as "M"
  VI: 1.2,
  // gentle even-out for common round/round and round/straight pairs
  oo: -0.3, oe: -0.3, ou: -0.3, on: -0.2, om: -0.2,
  nn: -0.2, mm: -0.2, rn: -0.2, rm: -0.2, rr: -0.2,
  co: -0.2, ce: -0.2, ca: -0.2, cu: -0.2,
  he: -0.2, ha: -0.2, ho: -0.2, hi: -0.3,
  th: -0.2, sh: -0.2, ch: -0.2, ck: -0.2,
  er: -0.2, ar: -0.2, ir: -0.2, ur: -0.2, or: -0.2,
  al: -0.3, le: -0.2,
  st: -0.2, ct: -0.2, ft: -0.2,
  LT: -0.6, Ly: -0.6, Lo: -0.5, La: -0.5,
  Jo: -0.6, Ja: -0.6,
  // digits before punctuation
  "1,": -0.5, "1.": -0.5, "9,": -0.4, "9.": -0.4,
};
function kern(a: string, b: string): number {
  if (a === " " || b === " ") return 0;
  return KERN[a + b] ?? 0;
}

type Weight = "bold" | "regular";
const EM = 14; // grid units per em

function textWidth(text: string, size: number): number {
  const unit = size / EM;
  let w = 0;
  let prev = "";
  for (const ch of text) {
    if (ch === " ") {
      w += SPACE_ADV * unit;
      prev = " ";
      continue;
    }
    const g = GLYPHS.get(ch);
    if (!g) {
      w += 8 * unit;
      prev = ch;
      continue;
    }
    w += (g.adv + kern(prev, ch)) * unit;
    prev = ch;
  }
  return w;
}

function drawText(x: number, y: number, text: string, size: number, weight: Weight, color: RGB): void {
  // x,y = top-left of the em box (em is 14 units tall)
  const unit = size / EM;
  const r = unit * (weight === "bold" ? 1.0 : 0.78); // stroke radius, final px
  let pen = x;
  let prev = "";
  for (const ch of text) {
    if (ch === " ") {
      pen += SPACE_ADV * unit;
      prev = " ";
      continue;
    }
    const g = GLYPHS.get(ch);
    if (!g) {
      pen += 8 * unit;
      prev = ch;
      continue;
    }
    const kx = kern(prev, ch) * unit;
    pen += kx;
    for (const stroke of g.strokes) {
      const pts: Pt[] = stroke.map(([gx, gy]) => [pen + gx * unit, y + gy * unit]);
      polyline(pts, r, color);
    }
    pen += g.adv * unit;
    prev = ch;
  }
}

function wrapText(text: string, size: number, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, size) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawLines(
  lines: string[],
  x: number,
  y: number,
  size: number,
  leading: number,
  weight: Weight,
  color: RGB,
): void {
  lines.forEach((line, i) => drawText(x, y + i * leading, line, size, weight, color));
}

// Centred text (used for masthead strip, numbers, legend, pin numbers).
function drawTextCentred(cx: number, y: number, text: string, size: number, weight: Weight, color: RGB): void {
  drawText(cx - textWidth(text, size) / 2, y, text, size, weight, color);
}

// Numbered disc (badge / pin / index disc): solid disc + centred number.
// The number's cap height is centred on the disc centre.
function drawDiscNumber(cx: number, cy: number, r: number, label: string, size: number, bg: RGB, fg: RGB): void {
  disc(cx, cy, r, WHITE);
  disc(cx, cy, r - 1.2, bg);
  drawTextCentred(cx, cy - (size * 3) / 7, label, size, "bold", fg);
}

// ── World map ────────────────────────────────────────────────────────────────
// Simplified continent outlines in [lon, lat], drawn in region colours on a
// light ocean. Draw order matters where regions overlap at their borders:
// Asia first, then Americas and Africa, then Europe over Asia's west edge,
// then the Middle East over both, then Oceania and the small islands.
// Full-width band: the map spans the whole page so the 8 pins have room.
type LonLat = [number, number];
const MAP_X = 16;
const MAP_Y = 650;
const MAP_W = 992;
const MAP_H = 240;
function project(lon: number, lat: number): Pt {
  return [MAP_X + ((lon + 180) / 360) * MAP_W, MAP_Y + ((84 - lat) / 140) * MAP_H];
}
const ASIA: LonLat[] = [
  [40, 68], [50, 68], [60, 69], [70, 72], [80, 73], [90, 75], [100, 77], [110, 76],
  [120, 73], [130, 72], [140, 72], [150, 70], [160, 70], [170, 67], [178, 65], [178, 64],
  [170, 60], [162, 56], [158, 52], [150, 59], [142, 59], [141, 52], [140, 46], [135, 43],
  [130, 42], [127, 40], [126, 38], [122, 38], [120, 34], [122, 31], [120, 28], [114, 22],
  [108, 18], [106, 10], [104, 9], [101, 7], [100, 13], [98, 16], [94, 17], [92, 21],
  [89, 22], [86, 20], [82, 17], [80, 13], [77, 8], [75, 12], [73, 16], [70, 21],
  [66, 25], [62, 25], [58, 26], [56, 27], [54, 27], [52, 29], [50, 30], [48, 30],
  [44, 29], [42, 29], [40, 31], [38, 32], [36, 36], [34, 36], [30, 36], [27, 37],
  [28, 40], [30, 42], [32, 44], [35, 45], [38, 46], [40, 47], [42, 50], [45, 55],
  [48, 60], [50, 68],
];
const N_AMERICA: LonLat[] = [
  [-168, 66], [-165, 60], [-158, 58], [-152, 60], [-140, 60], [-135, 58], [-130, 54],
  [-125, 49], [-124, 42], [-120, 34], [-114, 29], [-110, 24], [-105, 20], [-97, 16],
  [-94, 17], [-90, 14], [-86, 12], [-83, 9], [-80, 8], [-77, 7], [-79, 9], [-82, 13],
  [-87, 16], [-90, 21], [-97, 26], [-93, 30], [-89, 30], [-84, 30], [-81, 26],
  [-80, 32], [-76, 35], [-74, 40], [-70, 42], [-68, 45], [-65, 44], [-60, 47],
  [-55, 47], [-60, 52], [-65, 58], [-68, 58], [-72, 62], [-78, 62], [-85, 66],
  [-92, 66], [-95, 69], [-110, 68], [-125, 70], [-140, 70], [-155, 71], [-165, 68],
];
const S_AMERICA: LonLat[] = [
  [-77, 7], [-75, 10], [-72, 12], [-64, 10], [-60, 8], [-55, 6], [-52, 5], [-50, 0],
  [-44, -3], [-38, -5], [-35, -8], [-39, -13], [-41, -22], [-48, -27], [-52, -32],
  [-58, -38], [-62, -41], [-65, -45], [-68, -50], [-69, -52], [-72, -54], [-74, -50],
  [-73, -44], [-73, -37], [-71, -30], [-70, -23], [-75, -15], [-77, -12], [-80, -6],
  [-81, -3], [-79, 1], [-77, 4],
];
const GREENLAND: LonLat[] = [
  [-45, 60], [-40, 60], [-32, 60], [-25, 60], [-20, 65], [-22, 70], [-25, 74],
  [-30, 76], [-40, 76], [-50, 75], [-55, 72], [-58, 68], [-52, 64], [-48, 62],
];
const EUROPE: LonLat[] = [
  [-10, 36], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-2, 49], [0, 51], [3, 53],
  [8, 57], [10, 59], [5, 60], [5, 62], [12, 64], [18, 69], [25, 71], [30, 70],
  [32, 68], [35, 66], [40, 68], [45, 68], [50, 68], [48, 60], [45, 55], [42, 50],
  [40, 47], [38, 46], [35, 45], [30, 45], [28, 44], [23, 40], [23, 36], [20, 40],
  [19, 42], [16, 44], [13, 45], [12, 44], [8, 44], [6, 43], [3, 43], [0, 40],
  [-2, 37], [-6, 36], [-9, 37],
];
const MIDDLE_EAST: LonLat[] = [
  [26, 37], [30, 36], [34, 36], [36, 36], [39, 37], [42, 38], [44, 39], [48, 38],
  [52, 37], [56, 36], [58, 32], [60, 28], [62, 25], [60, 22], [58, 20], [55, 17],
  [52, 15], [48, 14], [44, 13], [43, 13], [40, 15], [39, 21], [37, 24], [35, 28],
  [33, 31], [30, 33], [27, 36],
];
const AFRICA: LonLat[] = [
  [-17, 15], [-17, 21], [-15, 27], [-9, 31], [-5, 35], [0, 36], [10, 37], [11, 34],
  [19, 32], [25, 32], [30, 31], [32, 31], [35, 28], [37, 22], [39, 18], [41, 11],
  [44, 11], [48, 11], [51, 10], [51, 12], [46, 5], [42, 0], [40, -5], [40, -10],
  [36, -18], [35, -22], [32, -26], [28, -33], [20, -35], [17, -32], [15, -27],
  [13, -18], [12, -10], [13, -5], [9, -1], [9, 4], [-8, 5], [-13, 8], [-17, 12],
];
const MADAGASCAR: LonLat[] = [
  [44, -16], [47, -15], [50, -16], [50, -20], [47, -25], [45, -25], [43, -21], [43, -17],
];
const AUSTRALIA: LonLat[] = [
  [113, -22], [114, -30], [115, -35], [118, -35], [124, -33], [129, -32], [132, -32],
  [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27],
  [150, -23], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12],
  [130, -13], [126, -14], [122, -17], [118, -20],
];
const NEW_ZEALAND: LonLat[] = [
  [167, -45], [168, -44], [170, -42], [173, -41], [175, -38], [177, -38], [178, -37],
  [176, -40], [174, -42], [171, -44], [168, -46],
];
const UK: LonLat[] = [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-2, 50]];
const JAPAN: LonLat[] = [
  [130, 31], [132, 33], [135, 34], [137, 35], [139, 36], [140, 38], [141, 41],
  [142, 44], [144, 44], [143, 42], [141, 39], [140, 36], [139, 34], [137, 33],
  [135, 32], [132, 31],
];
const INDONESIA: LonLat[] = [
  [95, 5], [98, 3], [100, 0], [103, -2], [106, -6], [110, -7], [114, -8], [118, -9],
  [120, -10], [122, -9], [125, -9], [128, -8], [131, -3], [134, -2], [137, -3],
  [140, -4], [141, -8], [138, -8], [135, -6], [132, -4], [130, -2], [128, 0],
  [125, 1], [122, 1], [119, 0], [117, 2], [115, 4], [112, 3], [110, 1], [107, 0],
  [105, 3], [102, 4], [98, 5],
];
function drawMap(): void {
  fillRect(MAP_X, MAP_Y, MAP_W, MAP_H, OCEAN);
  const fill = (poly: LonLat[], c: RGB) => polygon(poly.map(([lo, la]) => project(lo, la)), c);
  fill(ASIA, REGION.asia);
  fill(N_AMERICA, REGION.americas);
  fill(S_AMERICA, REGION.americas);
  fill(GREENLAND, REGION.americas);
  fill(AFRICA, REGION.africa);
  fill(MADAGASCAR, REGION.africa);
  fill(EUROPE, REGION.europe);
  fill(MIDDLE_EAST, REGION.middleEast);
  fill(AUSTRALIA, REGION.oceania);
  fill(NEW_ZEALAND, REGION.oceania);
  fill(UK, REGION.europe);
  fill(JAPAN, REGION.asia);
  fill(INDONESIA, REGION.asia);
  rectStroke(MAP_X, MAP_Y, MAP_W, MAP_H, 1, INK);
}

// ── Pins ─────────────────────────────────────────────────────────────────────
// [story, lon, lat, displayShift?] — displayShift [dx, dy] in final px moves
// a disc off its true point (leader line joins them). Shifts are forced by
// the map's scale: Kyiv / SE Poland / Narva sit within one disc diameter of
// each other, as do New York / Washington. Pin 1's disc is shifted away
// from the cluster so that no other disc and no leader line comes within
// 26px of it — the previous edition's flaw was a leader line crossing pin
// 1's glyph, caused by drawing leaders interleaved with discs. Here ALL
// leaders are drawn first, then ALL discs, then ALL numbers, so a leader
// can never cross a disc's glyph.
type Pin = { n: number; lon: number; lat: number; dx: number; dy: number };
const PINS: Pin[] = [
  { n: 1, lon: 30.52, lat: 50.45, dx: 34, dy: 26 }, // Kyiv
  { n: 2, lon: 22.4, lat: 50.4, dx: -36, dy: 34 }, // SE Poland
  { n: 3, lon: -74.0, lat: 40.71, dx: 24, dy: -26 }, // New York
  { n: 4, lon: 84.92, lat: 19.27, dx: 0, dy: 0 }, // Gopalpur
  { n: 5, lon: -75.98, lat: -10.85, dx: 0, dy: 0 }, // Junín
  { n: 6, lon: 4.35, lat: 50.85, dx: 0, dy: 0 }, // Brussels
  { n: 7, lon: -77.04, lat: 38.9, dx: -26, dy: 24 }, // Washington
  { n: 8, lon: 28.2, lat: 59.38, dx: 6, dy: -30 }, // Narva
];
const PIN_R = 11;
function segPointDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  // distance from point (px,py) to segment (x1,y1)-(x2,y2)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function drawPins(log: string[]): void {
  const centres = PINS.map((p) => {
    const [tx, ty] = project(p.lon, p.lat);
    return { n: p.n, tx, ty, cx: tx + p.dx, cy: ty + p.dy };
  });
  // pass 1 — ALL leader lines + true-point dots (under every disc)
  for (const c of centres) {
    if (c.cx !== c.tx || c.cy !== c.ty) {
      segment(c.cx, c.cy, c.tx, c.ty, 0.8, INK);
      disc(c.tx, c.ty, 1.6, INK);
    }
  }
  // pass 2 — ALL discs
  for (const c of centres) {
    disc(c.cx, c.cy, PIN_R, WHITE);
    disc(c.cx, c.cy, PIN_R - 1.2, RED);
  }
  // pass 3 — ALL numbers, on top of everything
  for (const c of centres) {
    drawTextCentred(c.cx, c.cy - (12 * 3) / 7, String(c.n), 12, "bold", WHITE);
  }
  // verification: every disc inside the frame, no two discs overlapping,
  // no leader segment passing within a disc radius of another pin's disc,
  // and pin 1's disc clear of every other disc and leader by >= 26px edge gap
  let minD = Infinity;
  let minPair = "";
  for (let i = 0; i < centres.length; i++) {
    const a = centres[i];
    if (a.cx - PIN_R < MAP_X || a.cx + PIN_R > MAP_X + MAP_W || a.cy - PIN_R < MAP_Y || a.cy + PIN_R > MAP_Y + MAP_H) {
      log.push(`PIN ${a.n} OUTSIDE FRAME at (${a.cx.toFixed(1)}, ${a.cy.toFixed(1)})`);
    }
    for (let j = i + 1; j < centres.length; j++) {
      const b = centres[j];
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (d < minD) {
        minD = d;
        minPair = `${a.n}/${b.n}`;
      }
    }
  }
  log.push(`pins: ${PINS.length} present; min centre distance ${minD.toFixed(1)}px (pins ${minPair}); disc diameter ${PIN_R * 2}px`);
  const p1 = centres[0];
  let p1Clear = Infinity;
  let p1ClearWhat = "";
  for (let i = 1; i < centres.length; i++) {
    const d = Math.hypot(p1.cx - centres[i].cx, p1.cy - centres[i].cy) - PIN_R * 2;
    if (d < p1Clear) {
      p1Clear = d;
      p1ClearWhat = `disc ${centres[i].n}`;
    }
  }
  for (let i = 1; i < centres.length; i++) {
    const c = centres[i];
    if (c.cx === c.tx && c.cy === c.ty) continue;
    const d = segPointDist(p1.cx, p1.cy, c.cx, c.cy, c.tx, c.ty) - PIN_R;
    if (d < p1Clear) {
      p1Clear = d;
      p1ClearWhat = `leader ${c.n}`;
    }
  }
  log.push(`pin 1 clear zone: nearest other disc/leader edge gap ${p1Clear.toFixed(1)}px (${p1ClearWhat}); required >= 26px`);
  if (p1Clear < 26) log.push("PIN 1 CLEAR ZONE VIOLATED");
  // every leader vs every other disc (must stay outside the disc)
  for (let i = 0; i < centres.length; i++) {
    const c = centres[i];
    if (c.cx === c.tx && c.cy === c.ty) continue;
    for (let j = 0; j < centres.length; j++) {
      if (i === j) continue;
      const d = segPointDist(centres[j].cx, centres[j].cy, c.cx, c.cy, c.tx, c.ty);
      if (d < PIN_R + 1) log.push(`LEADER ${c.n} CROSSES DISC ${centres[j].n} (gap ${d.toFixed(1)}px)`);
    }
  }
  log.push("pin positions: " + centres.map((c) => `${c.n}@${c.cx.toFixed(0)},${c.cy.toFixed(0)}`).join(" "));
}

// ── Story data (annex text, printed exactly; numbers unchanged) ─────────────
type Feature = { n: number; chip: string; headline: string; context: string; source: string };
const HERO = {
  chip: "404 DRONES",
  headline: "Russia's strike hits three Kyiv bridges",
  context:
    "404 drones and 111 missiles overnight; 8 killed, 28 hurt. Two missiles and a drone fell inside Poland; NATO jets scrambled.",
  source: "ISW · UKRAINIAN AIR FORCE",
};
const FEATURES: Feature[] = [
  {
    n: 3,
    chip: "−3.7% S&P",
    headline: "AI rout tips S&P 500 and Dow into correction",
    context:
      "Nvidia −14.0% to $125.53 on a reported SEC probe; Anthropic −8.5% to $88.91 ($83 IPO).",
    source: "WSJ · NASDAQ",
  },
  {
    n: 4,
    chip: "370,000+ OUT",
    headline: "Cyclone Akvan makes landfall in Odisha",
    context: "Landfall near Gopalpur at 07:30–08:30, winds 70–80 km/h; over 370,000 evacuated.",
    source: "IMD · ODISHA GOVT",
  },
  {
    n: 5,
    chip: "M6.7",
    headline: "Magnitude 6.7 quake shakes Peru's Andes",
    context: "Struck at 7:09 pm near Junín and was felt in Lima; no immediate casualties reported.",
    source: "USGS · AP",
  },
  {
    n: 6,
    chip: "100,000 VISAS",
    headline: "UK and EU seal post-Brexit reset deal",
    context: "100,000 youth visas a year each way for ages 18–31; food deal worth up to £5.1bn a year.",
    source: "REUTERS · GOV.UK",
  },
  {
    n: 7,
    chip: "90 MIN",
    headline: "Trump defends Putin ties in 90-minute presser",
    context: "He vowed a 'tremendous tax' on US firms' data centres abroad, said Putin wants peace.",
    source: "AP · CNN",
  },
  {
    n: 8,
    chip: "FROM 1 DEC",
    headline: "Estonia to shut Russia border for six months",
    context: "All five crossings close from 1 December after suspected arson at the Threod drone plant.",
    source: "REUTERS · ESTONIAN MFA",
  },
];
const NUMBERS: [string, string][] = [
  ["404", "DRONES"],
  ["111", "MISSILES"],
  ["−3.7%", "S&P 500"],
  ["−950", "DOW"],
  ["100,000", "YOUTH VISAS"],
  ["M6.7", "PERU"],
];
const DATE_TEXT = "FRIDAY 20 NOVEMBER 2026";
const PAPER_NAME = "THE DAY IN ONE IMAGE";
const KICKER = "KYIV BRIDGES HIT · AI ROUT · CYCLONE AKVAN";
const REGION_STRIP = "7 STORIES · 8 PINS · EUROPE 3 · ASIA 1 · AMERICAS 3 · ONE DAY";
const FOOTER_BODY =
  "DATE CHECK — every story above happened or was decided on Friday 20 November 2026. " +
  "LEFT OUT: Houthi missile alerts near Riyadh (Saturday's event) · Italy's €805m Meta fine (announced 14 Nov) · " +
  "COP31 talks continue (no decision Friday) · Thursday's stories ran in yesterday's edition.";
const SOURCES_LINE =
  "Sources: ISW · Ukrainian Air Force · IMD · USGS · Reuters · AP · CNN · WSJ · Estonian MFA — all dated 20 Nov 2026.";
const MAP_NOTE = "Pins 1–2 mark the hero story; pins 3–8 mark the six feature stories.";

// ── Band allocation (1024px total) ───────────────────────────────────────────
// top margin 16 · masthead 120 (name 13, date 54, kicker 15, rule, tally 18) ·
// gap 6 · hero 168 · gap 6 · numbers 46 · gap 6 · features 252 (2 x 124 + 4) ·
// gap 6 · map band 322 (title 26, map 240, legend 24, note 22) · gap 6 ·
// footer 66 · bottom margin 8.
const MARGIN = 16;
const CW = W - 2 * MARGIN; // 992
const HERO_Y = 140;
const HERO_H = 168;
const NUM_Y = 314;
const NUM_H = 46;
const FEAT_Y = 366;
const FEAT_ROW_H = 124;
const FEAT_GAP = 4;
const MAP_TITLE_Y = 624;
const LEGEND_Y = 898;
const NOTE_Y = 922;
const FOOT_Y = 952;

// ── Masthead ─────────────────────────────────────────────────────────────────
function drawMasthead(log: string[]): void {
  drawText(MARGIN, 18, PAPER_NAME, 13, "bold", INK);
  const right = "7 STORIES · 8 PINS · ONE DAY";
  drawText(W - MARGIN - textWidth(right, 13), 18, right, 13, "bold", INK);
  // Date: owner rule 54px, shrink only if it cannot fit, never below 52.
  let dateSize = 54;
  while (dateSize > 52 && textWidth(DATE_TEXT, dateSize) > CW) dateSize -= 1;
  log.push(`masthead date size ${dateSize}px, width ${textWidth(DATE_TEXT, dateSize).toFixed(1)}px`);
  drawText(MARGIN, 36, DATE_TEXT, dateSize, "bold", INK);
  drawText(MARGIN, 94, KICKER, 15, "bold", RED);
  fillRect(MARGIN, 112, CW, 1, RULE);
  fillRect(MARGIN, 116, CW, 18, INK);
  drawTextCentred(W / 2, 117.5, REGION_STRIP, 13, "bold", WHITE);
}

// ── Hero: night strike over the Dnipro bridges ───────────────────────────────
function drawExplosion(cx: number, cy: number, r: number): void {
  // starburst: orange core, yellow heart, radiating spikes, smoke above
  disc(cx, cy - r * 1.1, r * 0.85, SMOKE);
  disc(cx - r * 0.4, cy - r * 1.5, r * 0.6, SMOKE);
  disc(cx, cy, r, EMBER);
  disc(cx, cy, r * 0.55, FLASH);
  const spikes: [number, number][] = [
    [0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7],
  ];
  for (const [sx, sy] of spikes) {
    segment(cx + sx * r * 0.5, cy + sy * r * 0.5, cx + sx * r * 1.7, cy + sy * r * 1.7, 1.1, FLASH);
  }
}
function drawBridge(x0: number, x1: number, deckY: number, h: number): void {
  // deck + two pylons + a shallow arch, silhouetted
  fillRect(x0, deckY, x1 - x0, 3, BRIDGE);
  const mid = (x0 + x1) / 2;
  fillRect(x0 + 14, deckY - h, 4, h, BRIDGE);
  fillRect(x1 - 18, deckY - h, 4, h, BRIDGE);
  polyline(
    [
      [x0 + 16, deckY],
      [mid - 30, deckY - h * 0.55],
      [mid, deckY - h * 0.7],
      [mid + 30, deckY - h * 0.55],
      [x1 - 16, deckY],
    ],
    1.6,
    BRIDGE,
  );
  // suspension cables from the arch down to the deck
  for (let i = 1; i <= 4; i++) {
    const cx = x0 + ((x1 - x0) * i) / 5;
    const archY = deckY - h * 0.7 * (1 - Math.abs(cx - mid) / ((x1 - x0) / 2));
    segment(cx, archY, cx, deckY, 0.7, BRIDGE);
  }
}
function drawHeroScene(): void {
  const x0 = 608;
  const x1 = W - MARGIN;
  const y0 = HERO_Y;
  const y1 = HERO_Y + HERO_H;
  // night sky with an orange glow low on the horizon
  vgrad(x0, y0, x1 - x0, 128, [
    [0, NIGHT_TOP],
    [0.55, NIGHT_MID],
    [0.85, rgb("#4a2c4a")],
    [1, NIGHT_GLOW],
  ]);
  // stars (fixed positions, deterministic)
  const stars: Pt[] = [
    [640, 158], [690, 150], [740, 168], [800, 152], [860, 160], [920, 148], [975, 162],
    [665, 185], [720, 195], [785, 182], [845, 192], [905, 180], [955, 198],
    [700, 215], [830, 218], [940, 222],
  ];
  for (const [sx, sy] of stars) disc(sx, sy, 0.9, WHITE);
  // incoming missile trails, arcing down toward the bridges
  polyline(
    [
      [980, 146],
      [940, 178],
      [905, 208],
      [880, 232],
    ],
    1.2,
    WHITE,
  );
  polyline(
    [
      [700, 148],
      [720, 180],
      [736, 210],
      [744, 232],
    ],
    1.2,
    WHITE,
  );
  // bridges over the river
  drawBridge(628, 800, 262, 34);
  drawBridge(812, 992, 266, 26);
  // explosions on the bridges
  drawExplosion(716, 246, 13);
  drawExplosion(908, 252, 10);
  // river band + orange reflections under the blasts
  fillRect(x0, 268, x1 - x0, y1 - 268, RIVER);
  vgrad(706, 268, 20, y1 - 268, [
    [0, NIGHT_GLOW],
    [1, RIVER],
  ]);
  vgrad(898, 268, 16, y1 - 268, [
    [0, EMBER],
    [1, RIVER],
  ]);
  // bridge decks continue across the river band
  fillRect(628, 268, 172, 2, BRIDGE);
  fillRect(812, 268, 180, 2, BRIDGE);
}
function drawHero(log: string[]): void {
  const x0 = MARGIN;
  const x1 = W - MARGIN;
  const y0 = HERO_Y;
  const y1 = HERO_Y + HERO_H;
  drawHeroScene();
  // opaque navy panel
  const px = x0;
  const pw = 592;
  fillRect(px, y0, pw, HERO_H, INK);
  // badges "1" and "2" (the story's two map pins) + chip
  drawDiscNumber(px + 24, y0 + 17, 11, "1", 13, RED, WHITE);
  drawDiscNumber(px + 52, y0 + 17, 11, "2", 13, RED, WHITE);
  const chipText = HERO.chip;
  const chipW = textWidth(chipText, 13) + 18;
  pill(px + 74, y0 + 8, chipW, 18, RED);
  drawText(px + 74 + 9, y0 + 11, chipText, 13, "bold", WHITE);
  // headline (26px bold, two fixed lines — the greedy wrap orphaned
  // "bridges" on line 2), context (15px, 2 lines), source
  const tx = px + 14;
  const tw = pw - 28;
  const hl = ["Russia's strike hits", "three Kyiv bridges"];
  log.push(`hero headline 26px, 2 lines: ${hl.map((l) => `"${l}"`).join(" / ")}`);
  drawLines(hl, tx, y0 + 34, 26, 29, "bold", WHITE);
  const ctxLines = wrapText(HERO.context, 15, tw);
  log.push(`hero context lines: ${ctxLines.length}`);
  if (ctxLines.length > 2) log.push("HERO CONTEXT OVERFLOW");
  drawLines(ctxLines, tx, y0 + 100, 15, 19, "regular", WHITE);
  drawText(tx, y0 + 146, HERO.source, 13, "regular", MUTED_NAVY);
}

// ── Numbers strip ────────────────────────────────────────────────────────────
function drawNumbers(): void {
  fillRect(MARGIN, NUM_Y, CW, NUM_H, INK);
  const cellW = CW / NUMBERS.length;
  for (let i = 0; i < NUMBERS.length; i++) {
    const cx = MARGIN + cellW * (i + 0.5);
    drawTextCentred(cx, NUM_Y + 5, NUMBERS[i][0], 24, "bold", WHITE);
    drawTextCentred(cx, NUM_Y + 31, NUMBERS[i][1], 11, "regular", MUTED_NAVY);
    if (i > 0) fillRect(MARGIN + cellW * i, NUM_Y + 5, 1, NUM_H - 10, HAIRLINE);
  }
}

// ── Feature cards ────────────────────────────────────────────────────────────
function drawBannerScene(n: number, x: number, y: number): void {
  // 16px-tall strip; keep icons clear of the badge (left ~26px) and the chip (right ~95px)
  const bx = x + 34;
  const by = y;
  if (n === 3) {
    // falling bars + red down arrow (AI rout)
    fillRect(bx + 4, by + 3, 8, 11, INK);
    fillRect(bx + 16, by + 6, 8, 8, GOLD);
    fillRect(bx + 28, by + 9, 8, 5, INK);
    polyline(
      [
        [bx + 2, by + 2],
        [bx + 20, by + 6],
        [bx + 38, by + 10],
        [bx + 52, by + 14],
      ],
      1.1,
      RED,
    );
    segment(bx + 52, by + 14, bx + 46, by + 14, 1.1, RED);
    segment(bx + 52, by + 14, bx + 52, by + 9, 1.1, RED);
  } else if (n === 4) {
    // cyclone spiral + rain
    polyline(
      [
        [bx + 18, by + 2],
        [bx + 26, by + 3],
        [bx + 30, by + 7],
        [bx + 26, by + 11],
        [bx + 20, by + 12],
        [bx + 14, by + 10],
        [bx + 12, by + 6],
      ],
      1.2,
      INK,
    );
    segment(bx + 42, by + 3, bx + 40, by + 9, 0.9, INK);
    segment(bx + 50, by + 2, bx + 48, by + 8, 0.9, INK);
    segment(bx + 58, by + 3, bx + 56, by + 9, 0.9, INK);
    disc(bx + 21, by + 7, 2, RED);
  } else if (n === 5) {
    // seismograph zigzag + cracked ground
    polyline(
      [
        [bx + 2, by + 8],
        [bx + 12, by + 8],
        [bx + 16, by + 3],
        [bx + 20, by + 13],
        [bx + 24, by + 5],
        [bx + 28, by + 11],
        [bx + 32, by + 8],
        [bx + 44, by + 8],
      ],
      1.1,
      RED,
    );
    polyline(
      [
        [bx + 48, by + 14],
        [bx + 54, by + 10],
        [bx + 58, by + 13],
        [bx + 62, by + 9],
      ],
      1,
      INK,
    );
  } else if (n === 6) {
    // two flags + a link between them (UK–EU deal)
    segment(bx + 6, by + 2, bx + 6, by + 14, 0.8, INK);
    fillRect(bx + 7, by + 2, 16, 9, rgb("#3e6fb0"));
    segment(bx + 7, by + 2, bx + 23, by + 11, 0.9, WHITE);
    segment(bx + 23, by + 2, bx + 7, by + 11, 0.9, WHITE);
    segment(bx + 40, by + 2, bx + 40, by + 14, 0.8, INK);
    fillRect(bx + 41, by + 2, 16, 9, rgb("#3e6fb0"));
    for (let s = 0; s < 6; s++) {
      const a = (s * Math.PI) / 3;
      disc(bx + 49 + Math.cos(a) * 3.4, by + 6.5 + Math.sin(a) * 3.4, 0.8, GOLD);
    }
    segment(bx + 24, by + 6, bx + 39, by + 6, 1.1, RED);
  } else if (n === 7) {
    // podium + microphone (presser)
    fillRect(bx + 6, by + 9, 22, 5, INK);
    fillRect(bx + 10, by + 5, 14, 4, INK);
    segment(bx + 34, by + 3, bx + 40, by + 9, 1, INK);
    disc(bx + 33, by + 3, 2.4, RED);
    polyline(
      [
        [bx + 48, by + 13],
        [bx + 54, by + 6],
        [bx + 60, by + 12],
      ],
      1,
      INK,
    );
  } else if (n === 8) {
    // closed border barrier + sign
    segment(bx + 4, by + 13, bx + 4, by + 3, 1, INK);
    segment(bx + 56, by + 13, bx + 56, by + 3, 1, INK);
    fillRect(bx + 4, by + 5, 52, 3, RED);
    fillRect(bx + 4, by + 9, 52, 2, WHITE);
    for (let i = 0; i < 5; i++) fillRect(bx + 8 + i * 10, by + 5, 5, 3, INK);
    disc(bx + 66, by + 8, 5.5, RED);
    disc(bx + 66, by + 8, 4, BANNER_BG);
    segment(bx + 62, by + 4, bx + 70, by + 12, 1.2, RED);
  }
}
function drawFeatures(log: string[]): void {
  const colW = (CW - 2 * 8) / 3;
  FEATURES.forEach((f, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = MARGIN + col * (colW + 8);
    const cy = FEAT_Y + row * (FEAT_ROW_H + FEAT_GAP);
    fillRect(cx, cy, colW, FEAT_ROW_H, CARD);
    rectStroke(cx, cy, colW, FEAT_ROW_H, 1, INK);
    // banner + scene
    fillRect(cx, cy, colW, 16, BANNER_BG);
    drawBannerScene(f.n, cx, cy);
    // badge disc (red, same style as map pins) top-left of the banner
    drawDiscNumber(cx + 13, cy + 8, 10, String(f.n), 12, RED, WHITE);
    // chip pill top-right
    const chipW = textWidth(f.chip, 13) + 18;
    pill(cx + colW - 8 - chipW, cy - 1, chipW, 17, RED);
    drawText(cx + colW - 8 - chipW + 9, cy + 0.5, f.chip, 13, "bold", WHITE);
    // headline (20px bold, 2 lines), context (14px, 2 lines), source (13px)
    const tx = cx + 10;
    const tw = colW - 20;
    const hl = wrapText(f.headline, 20, tw);
    const cl = wrapText(f.context, 14, tw);
    log.push(`card ${f.n}: headline ${hl.length} lines, context ${cl.length} lines`);
    if (hl.length > 2 || cl.length > 2) log.push(`CARD ${f.n} OVERFLOW: headline ${hl.length}, context ${cl.length}`);
    drawLines(hl, tx, cy + 21, 20, 22, "bold", INK);
    drawLines(cl, tx, cy + 69, 14, 15.5, "regular", INK);
    drawText(tx, cy + 106, f.source, 13, "regular", MUTED);
  });
}

// ── Map panel ────────────────────────────────────────────────────────────────
function drawMapPanel(log: string[]): void {
  drawText(MARGIN, MAP_TITLE_Y, "WHERE IT HAPPENED", 16, "bold", INK);
  drawMap();
  drawPins(log);
  // legend, one centred row of six region swatches
  const legend: [string, RGB][] = [
    ["Asia", REGION.asia],
    ["Europe", REGION.europe],
    ["Americas", REGION.americas],
    ["Middle East", REGION.middleEast],
    ["Africa", REGION.africa],
    ["Oceania", REGION.oceania],
  ];
  const gap = 28;
  const totalW =
    legend.reduce((s, [name]) => s + 18 + textWidth(name, 13), 0) + gap * (legend.length - 1);
  let lx = MARGIN + (CW - totalW) / 2;
  for (const [name, c] of legend) {
    fillRect(lx, LEGEND_Y + 1, 12, 12, c);
    drawText(lx + 18, LEGEND_Y, name, 13, "regular", INK);
    lx += 18 + textWidth(name, 13) + gap;
  }
  drawText(MARGIN, NOTE_Y, MAP_NOTE, 13, "regular", MUTED);
}

// ── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(): void {
  fillRect(MARGIN, FOOT_Y, 4, 61, RED);
  const lines = wrapText(FOOTER_BODY, 13, 978);
  const prefix = "DATE CHECK — ";
  const prefixW = textWidth(prefix, 13);
  lines.forEach((line, i) => {
    const y = FOOT_Y + i * 15.5;
    if (i === 0) {
      drawText(30, y, prefix, 13, "bold", RED);
      drawText(30 + prefixW, y, line.slice(prefix.length), 13, "regular", INK);
    } else {
      drawText(30, y, line, 13, "regular", INK);
    }
  });
  drawText(30, 1000, SOURCES_LINE, 13, "regular", MUTED);
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main(): void {
  const log: string[] = [];
  fillPaper();
  drawMasthead(log);
  drawHero(log);
  drawNumbers();
  drawFeatures(log);
  drawMapPanel(log);
  drawFooter();
  const out = downsample();
  const png = encodePNG(out, W, H);
  const dir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/entry.png`, png);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
  console.log(`size ${W}x${H}; cap ${png.length <= 1048576 ? "OK" : "OVER 1 MiB"}`);
  for (const l of log) console.log(l);
}
main();
