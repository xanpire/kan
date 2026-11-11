export function downloadJson(filename: string, json: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadImage(filename: string, dataUri: string) {
  if (typeof document === 'undefined') {
    return;
  }

  if (!dataUri.startsWith('data:')) {
    // A blob: URL from the image viewer downloads as it is.
    const anchor = document.createElement('a');
    anchor.href = dataUri;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  }

  const [meta, data] = dataUri.split(',');
  const mimeType = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/jpeg';

  try {
    const binary = window.atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch {
    const anchor = document.createElement('a');

    anchor.href = dataUri;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}

/**
 * Lets you choose a save file (a .zip export or a .json save) and returns its
 * bytes, or null when the picker was cancelled. The hidden input is always
 * removed again.
 */
export function pickSaveFile(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('File import is only available in the web app.'));
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,application/zip,.zip';
    input.style.display = 'none';
    let settled = false;

    const finish = (value: Uint8Array | null, error?: Error) => {
      if (settled) return;
      settled = true;
      if (input.parentNode) input.parentNode.removeChild(input);
      if (error) reject(error);
      else resolve(value);
    };

    input.addEventListener('cancel', () => finish(null));

    input.onchange = () => {
      const file = input.files?.[0];

      if (!file) {
        finish(null);
        return;
      }

      file
        .arrayBuffer()
        .then((buffer) => finish(new Uint8Array(buffer)))
        .catch(() => finish(null, new Error('Could not read that save file.')));
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Lets you choose an image (photo library, files, a screenshot) and returns it
 * as a JPEG data URI, scaled down so its longest side is at most `maxSide`.
 * Resolves null when nothing was chosen.
 */
export function pickImageFile(maxSide = 768): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Choosing an image is only available in the web app.'));
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();

      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.onload = () => {
        const source = String(reader.result ?? '');
        const image = new window.Image();

        image.onerror = () => reject(new Error('That file isn’t an image this browser can open.'));
        image.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');

          if (!context) {
            resolve(source);
            return;
          }

          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        image.src = source;
      };

      reader.readAsDataURL(file);
    };

    // Cancelling the picker fires no change event on most browsers; the
    // promise then simply never settles, which the caller treats as "nothing".
    document.body.appendChild(input);
    input.click();
  });
}
