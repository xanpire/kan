import { Asset } from 'expo-asset';

const kanFaceSheet = require('../../assets/images/kan-face-sheet.jpg');
const kanOutfitBlack = require('../../assets/images/kan-outfit-black.jpg');
const kanOutfitAkatsuki = require('../../assets/images/kan-outfit-akatsuki.jpg');
const kanProfile = require('../../assets/images/kan-profile.jpg');

import { isImageData, pickKanReferences, type KanReferences } from './referencePlan';

let referencesPromise: Promise<[string, string, string, string]> | null = null;

export function loadKanReferenceImages(wearsAkatsukiCloak: boolean): Promise<KanReferences> {
  if (!referencesPromise) {
    referencesPromise = Promise.all([
      toDataUri(Asset.fromModule(kanFaceSheet)),
      toDataUri(Asset.fromModule(kanOutfitBlack)),
      toDataUri(Asset.fromModule(kanOutfitAkatsuki)),
      toDataUri(Asset.fromModule(kanProfile)),
    ]);
  }

  const loading = referencesPromise;

  return loading.then((values) => {
    // Try again next time if a sheet did not load (offline for a moment).
    if (values.some((value) => !value) && referencesPromise === loading) {
      referencesPromise = null;
    }

    return pickKanReferences(values, wearsAkatsukiCloak);
  });
}

async function toDataUri(asset: Asset) {
  try {
    await asset.downloadAsync();
  } catch {
    // downloadAsync is a no-op for web assets; the remote URI still works.
  }

  const uri = asset.localUri ?? asset.uri;

  if (!uri) {
    return '';
  }

  if (uri.startsWith('data:')) {
    return isImageData(uri) ? uri : '';
  }

  try {
    const response = await fetch(uri);

    if (!response.ok) {
      return '';
    }

    const blob = await response.blob();

    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read reference image.'));
      reader.readAsDataURL(blob);
    });

    // All three sheets are JPEGs; a host that serves them untyped still counts.
    const typed = /^data:(application\/octet-stream|binary\/octet-stream)?[;,]/.test(dataUri)
      ? dataUri.replace(/^data:[^;,]*/, 'data:image/jpeg')
      : dataUri;

    return isImageData(typed) ? typed : '';
  } catch {
    return '';
  }
}

export { faceDroppedWarning, isImageData, pickKanReferences, planReferences, wantsProfileReference } from './referencePlan';
export type { KanReferences, PlannedReference, ReferenceKind } from './referencePlan';
