import { describe, it, expect } from 'vitest';
import { findBookmarkByUrl, findDuplicateGroups } from '../src/bookmarks/duplicates.js';

function bm(id, url, title = '') {
  return { id, url, title };
}

describe('findDuplicateGroups', () => {
  it('returns empty array when no duplicates', () => {
    const bookmarks = [
      bm('1', 'https://github.com'),
      bm('2', 'https://example.com'),
    ];
    expect(findDuplicateGroups(bookmarks)).toEqual([]);
  });

  describe('findBookmarkByUrl', () => {
    it('finds an existing bookmark using normalized URL comparison', () => {
      const bookmarks = [bm('1', 'https://www.example.com/page?utm_source=test')];

      expect(findBookmarkByUrl(bookmarks, 'https://example.com/page#section')?.id).toBe('1');
    });

    it('returns null when the URL is not already bookmarked', () => {
      expect(findBookmarkByUrl([bm('1', 'https://example.com')], 'https://github.com')).toBeNull();
    });
  });

  it('groups bookmarks with the same normalized URL', () => {
    const bookmarks = [
      bm('1', 'https://example.com/page'),
      bm('2', 'https://example.com/page'),
    ];
    const groups = findDuplicateGroups(bookmarks);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('treats www and non-www as duplicates', () => {
    const bookmarks = [
      bm('1', 'https://www.example.com/page'),
      bm('2', 'https://example.com/page'),
    ];
    const groups = findDuplicateGroups(bookmarks);
    expect(groups).toHaveLength(1);
  });

  it('treats URL with and without tracking params as duplicates', () => {
    const bookmarks = [
      bm('1', 'https://example.com/page?utm_source=google'),
      bm('2', 'https://example.com/page'),
    ];
    const groups = findDuplicateGroups(bookmarks);
    expect(groups).toHaveLength(1);
  });

  it('does not group URLs with different paths', () => {
    const bookmarks = [
      bm('1', 'https://example.com/page1'),
      bm('2', 'https://example.com/page2'),
    ];
    expect(findDuplicateGroups(bookmarks)).toEqual([]);
  });

  it('does not group URLs whose case-sensitive paths differ', () => {
    const bookmarks = [
      bm('1', 'https://example.com/products/item'),
      bm('2', 'https://example.com/products/ITEM'),
    ];
    expect(findDuplicateGroups(bookmarks)).toEqual([]);
  });

  it('does not group URLs with different ports', () => {
    const bookmarks = [
      bm('1', 'http://localhost:448/page'),
      bm('2', 'http://localhost:900/page'),
    ];
    expect(findDuplicateGroups(bookmarks)).toEqual([]);
  });
});
