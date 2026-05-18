import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { buildProductComposite } from "../product-composite";

// Build a deterministic 1024x1024 solid-color JPEG so tests don't depend on
// fixture files. sharp can generate this directly.
async function makeSourceJpeg(): Promise<Uint8Array> {
  const buf = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  return new Uint8Array(buf);
}

describe("buildProductComposite", () => {
  it("returns the original bytes when labelBbox is null", async () => {
    const bytes = await makeSourceJpeg();
    const r = await buildProductComposite({
      productImageBytes: bytes,
      productImageMime: "image/jpeg",
      labelBbox: null,
    });
    expect(r.composited).toBe(false);
    expect(r.mimeType).toBe("image/jpeg");
    // Same reference returned (no transform).
    expect(r.bytes).toBe(bytes);
  });

  it("returns the original bytes when bbox dimensions are zero", async () => {
    const bytes = await makeSourceJpeg();
    const r = await buildProductComposite({
      productImageBytes: bytes,
      productImageMime: "image/jpeg",
      labelBbox: { x: 0.1, y: 0.1, w: 0, h: 0.3 },
    });
    expect(r.composited).toBe(false);
    expect(r.bytes).toBe(bytes);
  });

  it("builds a 3-panel JPEG composite when bbox is valid", async () => {
    const bytes = await makeSourceJpeg();
    const r = await buildProductComposite({
      productImageBytes: bytes,
      productImageMime: "image/jpeg",
      labelBbox: { x: 0.2, y: 0.3, w: 0.5, h: 0.4 },
    });

    expect(r.composited).toBe(true);
    expect(r.mimeType).toBe("image/jpeg");

    // Output should be wider than tall (3 panels side-by-side).
    const meta = await sharp(Buffer.from(r.bytes)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(meta.height ?? 0);
    // 3 panels of 600 + 2 gutters of 4 = 1808
    expect(meta.width).toBe(1808);
    expect(meta.height).toBe(800);
  });

  it("falls back to original when the input is too small to crop meaningfully", async () => {
    const tinyBuf = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
    const tiny = new Uint8Array(tinyBuf);

    const r = await buildProductComposite({
      productImageBytes: tiny,
      productImageMime: "image/jpeg",
      labelBbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
    expect(r.composited).toBe(false);
    expect(r.bytes).toBe(tiny);
  });

  it("falls back to original when bytes are not a valid image", async () => {
    const junk = new Uint8Array([0xFF, 0x00, 0x00, 0xFF]);
    const r = await buildProductComposite({
      productImageBytes: junk,
      productImageMime: "image/jpeg",
      labelBbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
    expect(r.composited).toBe(false);
    expect(r.bytes).toBe(junk);
  });
});
