/**
 * Client-side image compression for onboarding uploads.
 *
 * Modern phone cameras produce 6-12 MB JPEGs. Vercel's serverless route
 * handlers reject request bodies > 4.5 MB with a 413 before our code
 * ever runs — so every photo MUST be reduced below that on the client.
 *
 * We downscale to a max long edge (default 2048 px, plenty for LoRA
 * training anchors) and re-encode as JPEG at 0.85 quality. Typical
 * output: 300 KB – 1.5 MB, comfortably under the Vercel limit.
 *
 * HEIC handling: iOS Safari's `createImageBitmap` decodes HEIC natively.
 * Desktop Chrome generally does not. If decode throws, the caller
 * should fall back to the original file and let the server reject —
 * better to get a specific 413 error message than a vague one.
 */
export async function compressImageForUpload(
  file: File,
  opts: {
    /** Max length of the longest image edge after resize. */
    maxDimension?: number;
    /** JPEG quality (0–1). */
    quality?: number;
    /**
     * If the file is already under this size AND within `maxDimension`,
     * return it unchanged. Avoids re-encoding small images.
     */
    passThroughByteThreshold?: number;
  } = {},
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 2048;
  const quality = opts.quality ?? 0.85;
  const passThroughByteThreshold = opts.passThroughByteThreshold ?? 1_500_000;

  if (!file.type.startsWith("image/")) {
    throw new Error(`Not an image: ${file.type}`);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const longEdge = Math.max(width, height);

    // Pass-through: already small enough + within dimension budget.
    if (longEdge <= maxDimension && file.size <= passThroughByteThreshold) {
      return file;
    }

    const scale = Math.min(1, maxDimension / longEdge);
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Image compression produced no blob");

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
