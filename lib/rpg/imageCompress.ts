// Smaller images: generated pictures arrive as large JPEG/PNG data URIs
// (~900 KB). On the web they are redrawn as WebP (JPEG where the browser
// cannot encode WebP, as older iOS), stepping quality down until they fit.
// Scene images aim for about 500 KB (audit 11c): they are reused as style
// and character references, so a heavier squeeze compounded.

export type CompressOptions = {
  /** Longest side in pixels after resizing. */
  maxSide: number;
  /** Starting WebP quality (0-1). */
  quality: number;
  /** Aim for at most this many bytes. */
  maxBytes: number;
};

/** Scene images and portraits. */
export const SCENE_IMAGE: CompressOptions = { maxSide: 1376, quality: 0.88, maxBytes: 500_000 };
/** Face references: small, they only need to show a face. */
export const FACE_IMAGE: CompressOptions = { maxSide: 512, quality: 0.8, maxBytes: 60_000 };

/** Bytes held by a base64 data URI. */
export function dataUriBytes(dataUri: string): number {
  const comma = dataUri.indexOf(',');
  const body = comma === -1 ? dataUri : dataUri.slice(comma + 1);
  return Math.floor((body.length * 3) / 4);
}

function loadBitmap(dataUri: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = dataUri;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Re-encodes a data URI as WebP (or JPEG) within the size limits. Returns
 * the input unchanged where there is no canvas (native), or when the result
 * would not be smaller.
 */
export async function compressImage(dataUri: string, options: CompressOptions = SCENE_IMAGE): Promise<string> {
  if (typeof document === 'undefined' || !dataUri.startsWith('data:image/') || dataUri.startsWith('data:image/svg')) {
    return dataUri;
  }

  const image = await loadBitmap(dataUri);

  if (!image || !image.naturalWidth || !image.naturalHeight) {
    return dataUri;
  }

  const scale = Math.min(1, options.maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');

  if (!context) {
    return dataUri;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return encodeWithin((type, quality) => canvas.toDataURL(type, quality), dataUri, options);
}

/**
 * Encodes with the best format the browser has, stepping quality down until
 * the result fits: WebP first, JPEG when WebP comes back as something else
 * (a browser that cannot encode WebP returns PNG). Never returns something
 * bigger than the input.
 */
export function encodeWithin(
  encode: (type: 'image/webp' | 'image/jpeg', quality: number) => string,
  original: string,
  options: CompressOptions
): string {
  let type: 'image/webp' | 'image/jpeg' = 'image/webp';
  let quality = options.quality;
  let best = original;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const encoded = encode(type, quality);

    if (!encoded.startsWith(`data:${type}`)) {
      if (type === 'image/jpeg') return best;
      // No WebP encoder here: start again in JPEG.
      type = 'image/jpeg';
      quality = options.quality;
      attempt -= 1;
      continue;
    }

    if (dataUriBytes(encoded) < dataUriBytes(best)) {
      best = encoded;
    }

    if (dataUriBytes(encoded) <= options.maxBytes) {
      break;
    }

    quality = Math.max(0.5, quality - 0.08);
  }

  return best;
}
