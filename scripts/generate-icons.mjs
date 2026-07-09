// One-off script: renders the app icon set from an inline SVG "n" wordmark, in the
// same colors/type treatment as the in-app wordmark. Run with `node scripts/generate-icons.mjs`.
// Re-run and commit the output whenever the mark changes; this isn't part of the build.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BG = "#1c1c1a"; // --primary / --foreground — matches the app's dark wordmark treatment
const FG = "#faf9f6"; // --background

const OUT_DIR = path.join(process.cwd(), "public", "icons");

function markSvg(size, { padded = false } = {}) {
  // padded = true reserves a ~20% safe-zone margin per the maskable icon spec, so
  // OS icon masks (circle/squircle) don't clip the mark.
  const inset = padded ? size * 0.2 : 0;
  const glyphSize = size - inset * 2;
  const fontSize = glyphSize * 0.62;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${padded ? 0 : size * 0.22}" fill="${BG}"/>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="600"
    letter-spacing="-2" fill="${FG}">n</text>
</svg>`.trim();
}

async function renderPng(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log("wrote", outPath);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await renderPng(markSvg(192), 192, path.join(OUT_DIR, "icon-192.png"));
  await renderPng(markSvg(512), 512, path.join(OUT_DIR, "icon-512.png"));
  await renderPng(markSvg(512, { padded: true }), 512, path.join(OUT_DIR, "icon-maskable-512.png"));
  // apple-touch-icon: opaque, no transparency, standard 180x180
  await renderPng(markSvg(180), 180, path.join(process.cwd(), "public", "apple-touch-icon.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
