// Build Next.js favicon assets from the Faiceoff brand mark.
// Source: C:/Users/Pranav/Downloads/Faiceoff white.png
//
// Outputs:
//   src/app/icon.png               — 512×512  (served at /icon)
//   src/app/apple-icon.png         — 180×180  (served at /apple-icon)
//   src/app/opengraph-image.png    — 1200×630 (served at /opengraph-image)
//   src/app/twitter-image.png      — 1200×630 (served at /twitter-image, for X cards)
//   src/app/opengraph-image.alt.txt — alt text for og:image:alt
//   src/app/twitter-image.alt.txt  — alt text for twitter:image:alt
//   public/logo-mark.png           — 512×512  (for in-app use)
//   src/app/favicon.ico            — multi-res ico (16/32/48)

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const SRC = process.env.FAVICON_SRC ?? path.join(os.homedir(), "Downloads", "Faiceoff white.png");
const ROOT = path.resolve(path.join(process.cwd()));
const APP = path.join(ROOT, "src", "app");
const PUBLIC = path.join(ROOT, "public");

if (!fs.existsSync(SRC)) {
  console.error(`Source not found: ${SRC}`);
  process.exit(1);
}

// The source "Faiceoff white.png" is the WHITE version of the mark — designed
// to be placed on a DARK backdrop. Use --color-ink so the starbursts pop.
const INK = { r: 0x1a, g: 0x15, b: 0x13, alpha: 1 }; // --color-ink
const PAPER = { r: 0xfd, g: 0xfb, b: 0xf7, alpha: 1 }; // --color-paper

async function makeIcon(size) {
  // trim generous padding around the mark, then fit centered in an ink-bg square
  const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: INK },
  })
    .composite([
      {
        input: await sharp(trimmed)
          .resize({ width: Math.round(size * 0.78), height: Math.round(size * 0.78), fit: "inside" })
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
}

async function makeOG() {
  const W = 1200;
  const H = 630;
  const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
  const mark = await sharp(trimmed)
    .resize({ height: Math.round(H * 0.72), fit: "inside" })
    .toBuffer();
  return sharp({
    create: { width: W, height: H, channels: 4, background: INK },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(APP, { recursive: true });
  fs.mkdirSync(PUBLIC, { recursive: true });

  // 512×512 main icon
  const icon512 = await makeIcon(512);
  fs.writeFileSync(path.join(APP, "icon.png"), icon512);
  fs.writeFileSync(path.join(PUBLIC, "logo-mark.png"), icon512);

  // 180×180 Apple touch
  fs.writeFileSync(path.join(APP, "apple-icon.png"), await makeIcon(180));

  // 1200×630 OG + Twitter (same image, two file conventions)
  const og = await makeOG();
  fs.writeFileSync(path.join(APP, "opengraph-image.png"), og);
  fs.writeFileSync(path.join(APP, "twitter-image.png"), og);

  // alt text for social previews (screen readers + WhatsApp accessibility)
  const ALT = "Faiceoff — A House for Licensed Likeness";
  fs.writeFileSync(path.join(APP, "opengraph-image.alt.txt"), ALT);
  fs.writeFileSync(path.join(APP, "twitter-image.alt.txt"), ALT);

  // favicon.ico fallback — generate from a 32×32 PNG via png-to-ico if available,
  // otherwise save a 32×32 PNG as .ico is no-go, so use alt path: rely on icon.png.
  // Try png-to-ico dynamically.
  try {
    const pngToIco = (await import("png-to-ico")).default;
    const png32 = await makeIcon(32);
    const png48 = await makeIcon(48);
    const png16 = await makeIcon(16);
    const ico = await pngToIco([png16, png32, png48]);
    fs.writeFileSync(path.join(APP, "favicon.ico"), ico);
    console.log("wrote favicon.ico (multi-res 16/32/48)");
  } catch (err) {
    console.warn(
      "png-to-ico not installed — skipping favicon.ico. Run: npm i -D png-to-ico",
      err?.message ?? err
    );
  }

  console.log(
    "wrote icon.png (512), apple-icon.png (180), opengraph-image.png + twitter-image.png (1200×630), alt .txt files, public/logo-mark.png (512)"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
