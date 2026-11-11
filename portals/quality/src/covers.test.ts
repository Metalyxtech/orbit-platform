import { describe, expect, it } from 'vitest';
import { adminCoversFor } from './config';

describe('quality admin cover', () => {
  it('defaults to the roles nobody else holds', () => {
    expect(adminCoversFor({}, 'a', ['inspector'])).toEqual(['manager']);
    expect(adminCoversFor({}, 'a', ['inspector', 'manager'])).toEqual([]);
  });
  it('uses what the company admin chose, even an empty choice', () => {
    expect(adminCoversFor({ adminCovers: { a: [] } }, 'a', [])).toEqual([]);
    expect(adminCoversFor({ adminCovers: { a: ['inspector'] } }, 'a', ['inspector', 'manager'])).toEqual(['inspector']);
  });
});
