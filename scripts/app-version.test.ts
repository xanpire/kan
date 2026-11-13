// One version everywhere (audit 11): package.json, app.json, the service
// worker's precache list and the manifest's icons must carry the same ?v=,
// or the installed app asks for URLs the worker never cached.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dir, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const version = JSON.parse(read('package.json')).version as string;

describe('app version', () => {
  test('app.json matches package.json', () => {
    expect(JSON.parse(read('app.json')).expo.version).toBe(version);
  });

  test('the service worker was regenerated for this version', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain(`kan-shell-${version.replace(/\./g, '-')}`);
    expect(sw).toContain(`/icon-192.png?v=${version}`);
  });

  test('every ?v= in the manifest is this version', () => {
    const stamps = read('public/manifest.webmanifest').match(/\?v=[^"]+/g) ?? [];
    expect(stamps.length).toBeGreaterThan(0);
    expect(new Set(stamps)).toEqual(new Set([`?v=${version}`]));
  });

  test('the page head takes its ?v= from the app version, not a fixed one', () => {
    const head = read('app/+html.tsx');
    expect(head).toContain('?v=${APP_VERSION}');
    expect(head).not.toMatch(/\?v=\d/);
  });
});
