import { describe, expect, it } from 'vitest';
import { stripDimensions } from '../scripts/lib/product-name';

describe('product name dimension stripping', () => {
  it('removes inch, metric and N x M dimension strings and tidies the punctuation', () => {
    expect(stripDimensions('Amazon Brand – Ravenna Home Amber Rustic Farmhouse Shelf Coffee Table, 44"W, Natural and White')).toBe('Amazon Brand – Ravenna Home Amber Rustic Farmhouse Shelf Coffee Table, Natural and White');
    expect(stripDimensions('Marca Amazon - Movian Maggiore - Escritorio con 2 cajones, 130 x 50 x 75 cm (L x P x A), blanco')).toBe('Marca Amazon - Movian Maggiore - Escritorio con 2 cajones, blanco');
    expect(stripDimensions('AmazonBasics 3 Speed Air Circulator, 7-Inch')).toBe('AmazonBasics 3 Speed Air Circulator');
    expect(stripDimensions('Classic Dresser Drawers 4-Drawer, Espresso')).toBe('Classic Dresser Drawers 4-Drawer, Espresso');
  });
});
