/**
 * Export and import files.
 *
 * "Export with images" writes a zip: `save.json` (compact) plus every image
 * the save refers to under `images/<key>.<ext>`, stored as they are (they are
 * already compressed). The zip is built chunk by chunk into a Blob, so a long
 * story never becomes one giant base64 string in memory. "Export without
 * images" is a plain compact JSON file.
 *
 * Import takes either: a zip (the images go back into the image store under
 * their own keys) or a JSON file, old pretty-printed ones with inline images
 * included.
 */
import { Unzip, UnzipInflate, UnzipPassThrough, Zip, ZipPassThrough, strFromU8, strToU8 } from 'fflate';

import { imageBlobToDataUri, imageRefsIn, putImageBlob, readImageBlob } from './imageStore';
import type { AppDatabase } from './types';

export const SAVE_ENTRY = 'save.json';
const IMAGE_DIR = 'images/';

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};
const MIME_OF: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime])
);

/** The save as compact JSON, without undo snapshots. */
export function saveJson(db: AppDatabase) {
  return JSON.stringify({ ...db, snapshots: [] });
}

/** Builds the export zip: save.json plus each referenced image, one at a time. */
export async function buildExportZip(db: AppDatabase): Promise<Blob> {
  const json = saveJson(db);
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  let finished: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure = error;
      finished();
      return;
    }

    chunks.push(chunk);

    if (final) {
      finished();
    }
  });

  const addFile = (name: string, bytes: Uint8Array) => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
  };

  addFile(SAVE_ENTRY, strToU8(json));

  for (const key of new Set(imageRefsIn(json))) {
    const blob = await readImageBlob(key);

    if (!blob) {
      continue;
    }

    const ext = EXTENSIONS[blob.type] ?? 'bin';
    addFile(`${IMAGE_DIR}${key}.${ext}`, new Uint8Array(await blob.arrayBuffer()));
  }

  zip.end();
  await done;

  if (failure) {
    throw failure;
  }

  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

export function isZip(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Reads a zip into its files (stored or deflated entries). */
function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, Uint8Array>();
    let pending = 0;
    let ended = false;
    const maybeDone = () => {
      if (ended && pending === 0) resolve(files);
    };

    const unzip = new Unzip((file) => {
      pending += 1;
      const parts: Uint8Array[] = [];
      file.ondata = (error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }
        parts.push(chunk);
        if (final) {
          const size = parts.reduce((sum, part) => sum + part.length, 0);
          const whole = new Uint8Array(size);
          let offset = 0;
          for (const part of parts) {
            whole.set(part, offset);
            offset += part.length;
          }
          files.set(file.name, whole);
          pending -= 1;
          maybeDone();
        }
      };
      file.start();
    });
    unzip.register(UnzipPassThrough);
    // Deflated entries, for zips re-packed by another tool.
    unzip.register(UnzipInflate);

    try {
      unzip.push(bytes, true);
      ended = true;
      maybeDone();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * The save JSON from an export file (zip or JSON). A zip's images are put back
 * into the image store; any that can't be stored are inlined instead, so the
 * story never ends up pointing at an image that isn't there.
 */
export async function readSaveFile(bytes: Uint8Array): Promise<string> {
  if (!isZip(bytes)) {
    return strFromU8(bytes);
  }

  const files = await readZip(bytes);
  const save = files.get(SAVE_ENTRY);

  if (!save) {
    throw new Error('This file is not a Kan export: it has no save.json inside.');
  }

  let json = strFromU8(save);

  for (const [name, data] of files) {
    if (!name.startsWith(IMAGE_DIR)) continue;

    const file = name.slice(IMAGE_DIR.length);
    const dot = file.lastIndexOf('.');
    const key = dot > 0 ? file.slice(0, dot) : file;
    const blob = new Blob([data as BlobPart], { type: MIME_OF[file.slice(dot + 1)] ?? 'application/octet-stream' });

    if (!(await putImageBlob(key, blob))) {
      const uri = await imageBlobToDataUri(blob);
      if (uri) json = json.split(`"img:${key}"`).join(JSON.stringify(uri));
    }
  }

  return json;
}

export type DeliverResult = 'shared' | 'downloaded' | 'cancelled';

function prefersShareSheet() {
  if (typeof window === 'undefined') return false;
  try {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    return Boolean(standalone || touch);
  } catch {
    return false;
  }
}

/**
 * Hands a file to the share sheet where that is how phones save files (an
 * installed iOS web app can't download by link), otherwise downloads it.
 * Resolves only once the share or download call has finished; throws the
 * real error otherwise.
 */
export async function deliverFile(blob: Blob, filename: string): Promise<DeliverResult> {
  if (typeof document === 'undefined') {
    throw new Error('Saving a file is only available in the web app.');
  }

  if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.share && prefersShareSheet()) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return 'cancelled';
        }
        // Share refused (permissions, too large): fall back to a download.
      }
    }
  }

  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Give the browser time to start reading before the URL goes.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return 'downloaded';
}

/** A safe file name from a story name. */
export function exportFileName(storyName: string, withImages: boolean) {
  const base = storyName.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'save';
  return withImages ? `kan-story-${base}.zip` : `kan-story-${base}-no-images.json`;
}
