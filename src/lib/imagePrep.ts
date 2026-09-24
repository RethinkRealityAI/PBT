/**
 * Browser-side photo preparation shared by every multimodal feature
 * (Pet Vision, Fecal Scan).
 *
 * A phone camera shoots 12–48 MP; the model needs nothing like that to judge
 * body condition or stool consistency, and the AI functions bound the base64
 * payload (`AI_LIMITS.maxImageBase64Chars`). So: downscale, re-encode as
 * JPEG, then read as base64 — with an honest fallback to the raw file
 * wherever the browser can't re-encode (jsdom, very old WebViews).
 *
 * Extracted from `features/pet-analyzer/usePetVision.ts` so Fecal Scan reuses
 * the exact same pipeline rather than a second, drifting copy.
 */

/** Max accepted image bytes before analysis (5 MB) — keeps payloads sane. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Downscale target: a 1600 px longest edge at JPEG q0.85 is typically
 * 200–600 kB — well under the payload cap, and a much faster upload on
 * mobile data.
 */
export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.85;

export interface FileParts {
  base64: string;
  mimeType: string;
  /** object URL for preview; caller revokes on reset. */
  previewUrl: string;
}

/**
 * Re-encode the photo at ≤ MAX_EDGE_PX on its longest edge as JPEG.
 *
 * Returns null wherever the browser can't do it (no `createImageBitmap` /
 * 2D canvas — jsdom, very old WebViews) or the decode fails; the caller then
 * falls back to the raw file so the pre-existing path still works. Always
 * JPEG: transparent pixels are flattened onto white first so a PNG with an
 * alpha background doesn't come out black.
 */
export async function downscaleImage(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    // Honour EXIF orientation where the option is supported (phone photos are
    // routinely stored rotated); fall back to a plain decode otherwise.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
      createImageBitmap(file),
    );
  } catch {
    return null;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) return null;
    const scale = Math.min(1, MAX_EDGE_PX / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
      } catch {
        resolve(null);
      }
    });
    if (!blob || blob.size === 0) return null;
    // A small, already-optimised JPEG can re-encode LARGER than the source;
    // only take the re-encode when it actually shrank something.
    if (scale >= 1 && blob.size >= file.size) return null;
    return blob;
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Read `source` (the downscaled blob, or the original file) as base64.
 * The preview URL is always minted from the ORIGINAL file so what the user
 * sees is exactly what they picked.
 */
export function readFileParts(source: Blob, original: File): Promise<FileParts> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const result = reader.result as string;
      // Data URL: "data:image/jpeg;base64,XXXX" → strip the prefix.
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        base64,
        mimeType: source.type || original.type || 'image/jpeg',
        previewUrl: URL.createObjectURL(original),
      });
    };
    reader.readAsDataURL(source);
  });
}
