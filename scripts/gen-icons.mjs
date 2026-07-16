/**
 * Generiert die PWA-Icons ohne externe Abhängigkeiten (reiner PNG-Encoder).
 * Motiv: Bergsee-türkiser Doppelgipfel auf Nachtblau — Garmin Hub.
 *
 *   node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(typ, daten) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(daten.length);
  const inhalt = Buffer.concat([Buffer.from(typ, "ascii"), daten]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(inhalt));
  return Buffer.concat([len, inhalt, crc]);
}

function encodePng(breite, hoehe, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const zeilen = Buffer.alloc(hoehe * (breite * 4 + 1));
  for (let y = 0; y < hoehe; y++) {
    zeilen[y * (breite * 4 + 1)] = 0; // Filter: none
    rgba.copy(zeilen, y * (breite * 4 + 1) + 1, y * breite * 4, (y + 1) * breite * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(zeilen, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inDreieck(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function zeichne(n, mitRundung) {
  const rgba = Buffer.alloc(n * n * 4);
  const bg = [16, 21, 29]; // #10151d
  const teal = [46, 230, 199]; // Bergsee-Türkis
  const tealDunkel = [22, 128, 112];
  const radius = mitRundung ? n * 0.22 : 0;

  const hauptgipfel = [
    [0.18 * n, 0.8 * n],
    [0.52 * n, 0.24 * n],
    [0.86 * n, 0.8 * n],
  ];
  const schatten = [
    [0.52 * n, 0.24 * n],
    [0.86 * n, 0.8 * n],
    [0.52 * n, 0.8 * n],
  ];
  const nebengipfel = [
    [0.08 * n, 0.8 * n],
    [0.3 * n, 0.46 * n],
    [0.52 * n, 0.8 * n],
  ];

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      // abgerundete Ecken (transparent ausserhalb)
      if (radius > 0) {
        const cx = Math.max(radius - x, x - (n - 1 - radius), 0);
        const cy = Math.max(radius - y, y - (n - 1 - radius), 0);
        if (cx * cx + cy * cy > radius * radius) {
          rgba[i + 3] = 0;
          continue;
        }
      }
      let farbe = bg;
      if (inDreieck(x, y, ...nebengipfel)) farbe = tealDunkel;
      if (inDreieck(x, y, ...hauptgipfel)) farbe = teal;
      if (inDreieck(x, y, ...schatten)) farbe = tealDunkel;
      // Horizontlinie
      if (y > 0.8 * n && y < 0.8 * n + Math.max(2, n * 0.015)) farbe = teal;
      rgba[i] = farbe[0];
      rgba[i + 1] = farbe[1];
      rgba[i + 2] = farbe[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(n, n, rgba);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", zeichne(192, true));
writeFileSync("public/icons/icon-512.png", zeichne(512, true));
writeFileSync("public/icons/icon-maskable-512.png", zeichne(512, false));
writeFileSync("public/icons/apple-touch-icon.png", zeichne(180, false));
console.log("Icons generiert: public/icons/");
