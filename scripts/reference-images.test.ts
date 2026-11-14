import { describe, expect, mock, test } from 'bun:test';



import { isImageData, pickKanReferences } from '../lib/rpg/referencePlan';

describe("Kan's reference sheets keep their slots (audit 11c)", () => {
  test('a failed face sheet leaves the face empty, never the outfit in its place', () => {
    const refs = pickKanReferences(['', 'data:image/jpeg;base64,BLACK', 'data:image/jpeg;base64,CLOAK'], false);
    expect(refs.face).toBe('');
    expect(refs.outfit).toBe('data:image/jpeg;base64,BLACK');
    expect(refs.alternate).toBe('data:image/jpeg;base64,CLOAK');
  });

  test('the cloak swaps outfit and alternate', () => {
    const refs = pickKanReferences(['data:image/jpeg;base64,F', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C'], true);
    expect(refs).toEqual({ face: 'data:image/jpeg;base64,F', outfit: 'data:image/jpeg;base64,C', alternate: 'data:image/jpeg;base64,B', profile: '' });
  });

  test('a plain URL is not image data', () => {
    expect(isImageData('https://example.com/kan-face-sheet.jpg')).toBe(false);
    expect(isImageData('data:image/jpeg;base64,AAAA')).toBe(true);
  });
});
