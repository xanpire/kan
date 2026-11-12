import { describe, expect, test } from 'bun:test';
import { encodeWithin, SCENE_IMAGE, dataUriBytes } from '../lib/rpg/imageCompress';

// A fake encoder: the size follows the quality, like a real one.
const fake = (supportsWebp: boolean, bytesAt: (q: number) => number) => {
  const calls: string[] = [];
  const encode = (type: 'image/webp' | 'image/jpeg', quality: number) => {
    calls.push(`${type}@${quality.toFixed(2)}`);
    if (type === 'image/webp' && !supportsWebp) return 'data:image/png;base64,' + 'A'.repeat(4000);
    return `data:${type};base64,` + 'A'.repeat(Math.ceil((bytesAt(quality) * 4) / 3));
  };
  return { encode, calls };
};

const original = 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil((900_000 * 4) / 3));

describe('stored scene images (audit 11c)', () => {
  test('aim for about 500 KB, not 200', () => {
    expect(SCENE_IMAGE.maxBytes).toBe(500_000);
  });

  test('WebP stops at the first quality that fits', () => {
    const { encode, calls } = fake(true, (q) => 300_000 + q * 200_000);
    const out = encodeWithin(encode, original, SCENE_IMAGE);
    expect(out.startsWith('data:image/webp')).toBe(true);
    expect(calls).toHaveLength(1);
    expect(dataUriBytes(out)).toBeLessThanOrEqual(500_000);
  });

  test('no WebP encoder: JPEG instead of keeping the 900 KB original', () => {
    const { encode, calls } = fake(false, (q) => 200_000 + q * 400_000);
    const out = encodeWithin(encode, original, SCENE_IMAGE);
    expect(out.startsWith('data:image/jpeg')).toBe(true);
    expect(calls[0]).toStartWith('image/webp');
    expect(calls[1]).toStartWith('image/jpeg');
    expect(dataUriBytes(out)).toBeLessThan(dataUriBytes(original));
  });

  test('never bigger than the input', () => {
    const small = 'data:image/jpeg;base64,AAAA';
    const { encode } = fake(true, () => 50_000);
    expect(encodeWithin(encode, small, SCENE_IMAGE)).toBe(small);
  });
});
