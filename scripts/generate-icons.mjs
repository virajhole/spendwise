// Generates PWA icons (PNG) with zero dependencies using node's zlib.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

/** Simple anti-aliased rasterizer: signed distance fields for circle + rupee glyph. */
function drawIcon(size, { maskable = false } = {}) {
  const S = size;
  const raw = Buffer.alloc(S * (S * 4 + 1));
  // colors
  const bgTop = [14, 165, 164]; // teal-500
  const bgBot = [13, 115, 119];
  const fg = [255, 255, 255];

  const scale = maskable ? 1 : 1;
  // Full-bleed gradient background (rounded corners applied only for non-maskable via CSS/icon shape; keep square for simplicity on maskable)
  const cx = S / 2, cy = S / 2;
  const glyphH = S * (maskable ? 0.42 : 0.52); // rupee bar height
  const barW = S * (maskable ? 0.30 : 0.38);
  const barT = S * (maskable ? 0.075 : 0.095);
  const top = cy - glyphH / 2;

  // SDF helpers (distance in px, negative = inside)
  const sdRoundRect = (x, y, bx, by, w, h, r) => {
    const qx = Math.abs(x - bx) - (w / 2 - r);
    const qy = Math.abs(y - by) - (h / 2 - r);
    const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const sdCircle = (x, y, bx, by, r) => Math.hypot(x - bx, y - by) - r;

  const coverage = (d, aa = 1.25) => Math.max(0, Math.min(1, 0.5 - d / aa));

  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // filter byte
    for (let x = 0; x < S; x++) {
      // background: vertical gradient, rounded-square mask for non-maskable
      const t = y / S;
      let bg = [
        Math.round(bgTop[0] + (bgBot[0] - bgTop[0]) * t),
        Math.round(bgTop[1] + (bgBot[1] - bgTop[1]) * t),
        Math.round(bgTop[2] + (bgBot[2] - bgTop[2]) * t),
      ];
      if (!maskable) {
        const r = S * 0.18;
        const dBg = sdRoundRect(x, y, cx, cy, S, S, r);
        const aBg = coverage(dBg);
        if (aBg < 1) {
          // transparent outside rounded corners
          bg = bg.map((c) => Math.round(c * aBg));
        }
        var alpha = aBg;
      } else {
        var alpha = 1;
      }

      // glyph: rupee = top bar, two vertical strokes, bottom leg
      let dGlyph = Infinity;
      // top horizontal bar
      dGlyph = Math.min(dGlyph, sdRoundRect(x, y, cx, top + barT / 2, barW, barT, barT / 2));
      // second bar (the crossbar)
      dGlyph = Math.min(dGlyph, sdRoundRect(x, y, cx, top + glyphH * 0.34, barW, barT, barT / 2));
      // vertical stem (left-aligned to center)
      const stemX = cx;
      dGlyph = Math.min(dGlyph, sdRoundRect(x, y, stemX, cy + glyphH * 0.12, barT, glyphH * 0.62, barT / 2));
      // diagonal leg
      const legTop = cy + glyphH * 0.18;
      const legBot = top + glyphH;
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t2 = i / steps;
        const lx = cx + barT / 2 + t2 * glyphH * 0.30;
        const ly = legTop + t2 * (legBot - legTop);
        dGlyph = Math.min(dGlyph, sdCircle(x, y, lx, ly, barT / 2 * 0.9));
      }
      const aGlyph = coverage(dGlyph);

      const r = Math.round(bg[0] + (fg[0] - bg[0]) * aGlyph);
      const g = Math.round(bg[1] + (fg[1] - bg[1]) * aGlyph);
      const b = Math.round(bg[2] + (fg[2] - bg[2]) * aGlyph);
      const off = y * (S * 4 + 1) + 1 + x * 4;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
      raw[off + 3] = Math.round(alpha * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(join(root, "public/icons"), { recursive: true });
writeFileSync(join(root, "public/icons/icon-192.png"), drawIcon(192));
writeFileSync(join(root, "public/icons/icon-512.png"), drawIcon(512));
writeFileSync(join(root, "public/icons/maskable-512.png"), drawIcon(512, { maskable: true }));
console.log("Icons written to public/icons/");
