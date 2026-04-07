import { describe, it, expect } from 'vitest';
import { findDuplicateGroups, findSimilar, sigWords } from '../src/bookmarks/duplicates.js';

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
});

describe('sigWords', () => {
  it('returns unique lowercase words of length >= 4', () => {
    expect(sigWords('Hello World hello')).toEqual(['hello', 'world']);
  });

  it('splits on spaces, dashes, underscores, slashes, dots, commas', () => {
    expect(sigWords('hello-world/test.case')).toEqual(['hello', 'world', 'test', 'case']);
  });

  it('filters out short words', () => {
    expect(sigWords('a bb ccc dddd')).toEqual(['dddd']);
  });

  it('returns empty array for empty string', () => {
    expect(sigWords('')).toEqual([]);
  });
});

describe('findSimilar', () => {
  it('returns bookmarks with the same domain', () => {
    const target = bm('1', 'https://github.com/user/repo', 'My Repo');
    const others = [
      bm('2', 'https://github.com/other', 'Other'),
      bm('3', 'https://example.com', 'Example'),
    ];
    const result = findSimilar(target, [target, ...others]);
    expect(result.map((b) => b.id)).toContain('2');
    expect(result.map((b) => b.id)).not.toContain('3');
  });

  it('does not include the bookmark itself', () => {
    const target = bm('1', 'https://github.com', 'GitHub');
    const result = findSimilar(target, [target]);
    expect(result).toHaveLength(0);
  });

  it('matches by shared title keywords (>= 2 significant words)', () => {
    const target = bm('1', 'https://a.com', 'JavaScript Testing Guide');
    const others = [
      bm('2', 'https://b.com', 'JavaScript Testing Tutorial'),
      bm('3', 'https://c.com', 'Python Tutorial'),
    ];
    const result = findSimilar(target, [target, ...others]);
    expect(result.map((b) => b.id)).toContain('2');
    expect(result.map((b) => b.id)).not.toContain('3');
  });
});
