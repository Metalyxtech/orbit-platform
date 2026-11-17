import { describe, expect, it } from 'vitest';
import { adminCoversFor, COVER_ROLES } from './config';

describe('production admin cover', () => {
  it('defaults to the roles nobody else holds', () => {
    expect(adminCoversFor({}, 'a', [])).toEqual(COVER_ROLES);
    expect(adminCoversFor({}, 'a', ['engineer', 'manager', 'supervisor', 'gm'])).toEqual(['store']);
  });
  it('uses what the company admin chose', () => {
    expect(adminCoversFor({ adminCovers: { a: ['manager'] } }, 'a', [])).toEqual(['manager']);
    expect(adminCoversFor({ adminCovers: { b: ['manager'] } }, 'a', COVER_ROLES)).toEqual([]);
  });
});
