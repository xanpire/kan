import { describe, expect, test } from 'bun:test';

import { INVENTORY_LIMIT, addItems, removeItems, sameItem } from '../lib/rpg/inventory';

const start = [
  'Hidden Leaf forehead protector',
  'Kunai pouch (6 kunai)',
  'Shuriken (10)',
  'Ninja wire',
  'Explosive tags (3)',
  'Smoke bombs (2)',
  'Basic ration pack',
];

describe('inventory (audit 6.8)', () => {
  test('removals match loosely, and counts go down', () => {
    expect(removeItems(start, ['kunai'])).toContain('Kunai pouch (5 kunai)');
    expect(removeItems(start, ['2 explosive tags'])).toContain('Explosive tags (1)');
    expect(removeItems(start, ['explosive tag', 'explosive tag', 'explosive tag'])).not.toContain('Explosive tags (0)');
    expect(removeItems(start, ['the ninja wire'])).not.toContain('Ninja wire');
    expect(removeItems(start, ['smoke bomb'])).toContain('Smoke bombs (1)');
    expect(removeItems(start, ['kunai pouch']).some((item) => item.startsWith('Kunai pouch'))).toBe(false);
  });

  test('counts merge', () => {
    expect(addItems(['3 kunai'], ['2 kunai'])).toEqual(['5 kunai']);
    expect(addItems(start, ['4 shuriken'])).toContain('Shuriken (14)');
    expect(addItems(start, ['3 kunai'])).toContain('Kunai pouch (9 kunai)');
    expect(addItems(start, ['basic ration pack'])).toHaveLength(start.length);
  });

  test('the list holds 40, and the forehead protector, cloak and ring never drop', () => {
    let inventory = [...start, 'Akatsuki cloak', 'Akatsuki ring'];
    inventory = addItems(inventory, Array.from({ length: 60 }, (_, index) => `Trinket number ${index}`));
    expect(inventory).toHaveLength(INVENTORY_LIMIT);
    expect(inventory).toContain('Hidden Leaf forehead protector');
    expect(inventory).toContain('Akatsuki cloak');
    expect(inventory).toContain('Akatsuki ring');
    expect(inventory).toContain('Trinket number 59');
  });

  test('sameItem', () => {
    expect(sameItem('Smoke bombs (2)', 'smoke bomb')).toBe(true);
    expect(sameItem('Kunai pouch (6 kunai)', 'the kunai pouch')).toBe(true);
    expect(sameItem('Sealing scroll', 'the sealing scroll')).toBe(true);
    expect(sameItem('Ring', 'Earring')).toBe(false);
  });
});
