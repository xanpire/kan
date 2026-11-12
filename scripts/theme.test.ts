/**
 * Shared components and theme (audit 11e.4): readable contrast, text fields
 * that never zoom the iPhone page, and nothing under 11 px.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { colors, type } from '../constants/theme';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

const ROOT = new URL('..', import.meta.url).pathname;
const files = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];

describe('contrast', () => {
  test('dim text passes 4.5:1 on sheets and cards', () => {
    expect(contrast(colors.textDim, colors.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textDim, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  test('small red text uses the tint, which passes on black', () => {
    expect(contrast(colors.accentTint, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect('accentText' in colors).toBe(false);
    expect('accentBright' in colors).toBe(false);
  });

  test('the selected tab is visible against its track', () => {
    expect(contrast(colors.borderStrong, colors.surface)).toBeGreaterThan(1.4);
  });
});

describe('text fields and sizes', () => {
  test('the input style is 16 px', () => {
    expect(type.input.fontSize).toBe(16);
  });

  test('no style anywhere is under 11 px', () => {
    const tiny = files.filter((file) => /fontSize: (?:[0-9]|10)\b,/.test(readFileSync(file, 'utf8')));
    expect(tiny).toEqual([]);
  });

  test('every TextInput style is at least 16 px', () => {
    const problems: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const names = [...text.matchAll(/\n\s*<TextInput\b[\s\S]*?\/>/g)]
        .map((match) => /style=\{(?:\[)?styles\.(\w+)/.exec(match[0])?.[1])
        .filter((name): name is string => Boolean(name));

      for (const name of names) {
        const block = new RegExp(`\\n  ${name}: \\{([\\s\\S]*?)\\n  \\},`).exec(text)?.[1] ?? '';
        // The `type.input` token is 16 px (checked above).
        const size = /fontSize: (\d+)/.exec(block)?.[1] ?? (/\.\.\.type\.input\b/.test(block) ? '16' : undefined);
        if (!size || Number(size) < 16) problems.push(`${file.replace(ROOT, '')} ${name} ${size ?? 'none'}`);
      }
    }

    expect(problems).toEqual([]);
  });
});
