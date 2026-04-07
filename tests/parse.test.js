import { describe, it, expect } from 'vitest';
import { parseTitle, buildRawTitle, flattenBookmarks } from '../src/bookmarks/parse.js';

describe('parseTitle', () => {
  it('parses title without tags', () => {
    const r = parseTitle('Hello World');
    expect(r).toEqual({ title: 'Hello World', tags: [], parseError: null });
  });

  it('parses title with single tag', () => {
    const r = parseTitle('My Page | work');
    expect(r).toEqual({ title: 'My Page', tags: ['work'], parseError: null });
  });

  it('parses title with multiple tags', () => {
    const r = parseTitle('Article | tech, reading, 2024');
    expect(r).toEqual({ title: 'Article', tags: ['tech', 'reading', '2024'], parseError: null });
  });

  it('returns parseError when tag section is empty', () => {
    const r = parseTitle('Title | ');
    expect(r.title).toBe('Title');
    expect(r.tags).toEqual([]);
    expect(r.parseError).toBeTruthy();
  });

  it('returns parseError for tag section with only whitespace', () => {
    const r = parseTitle('Title |   ');
    expect(r.parseError).toBeTruthy();
  });

  it('returns parseError for empty tag among others (trailing comma)', () => {
    const r = parseTitle('Title | tag1, ');
    expect(r.parseError).toBeTruthy();
    expect(r.tags).toEqual(['tag1']);
  });

  it('returns parseError for empty tag in the middle', () => {
    const r = parseTitle('Title | , tag2');
    expect(r.parseError).toBeTruthy();
  });

  it('returns parseError when a tag contains a pipe', () => {
    const r = parseTitle('Title | tag1|nested');
    expect(r.parseError).toBeTruthy();
  });

  it('handles multiple pipe characters (only first " | " is separator)', () => {
    const r = parseTitle('A | B | C');
    expect(r.title).toBe('A');
    // "B | C" — tag contains pipe => parseError
    expect(r.parseError).toBeTruthy();
  });

  it('handles empty string', () => {
    const r = parseTitle('');
    expect(r).toEqual({ title: '', tags: [], parseError: null });
  });
});

describe('buildRawTitle', () => {
  it('returns title when no tags', () => {
    expect(buildRawTitle('Hello', [])).toBe('Hello');
  });

  it('joins title and tags with separator', () => {
    expect(buildRawTitle('My Page', ['work', 'dev'])).toBe('My Page | work, dev');
  });

  it('round-trips with parseTitle', () => {
    const original = 'Article | tech, reading';
    const { title, tags } = parseTitle(original);
    expect(buildRawTitle(title, tags)).toBe(original);
  });

  it('round-trips title with no tags', () => {
    const original = 'Plain Title';
    const { title, tags } = parseTitle(original);
    expect(buildRawTitle(title, tags)).toBe(original);
  });
});

describe('flattenBookmarks', () => {
  it('flattens a simple tree', () => {
    const tree = [
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
            children: [
              { id: '2', title: 'GitHub', url: 'https://github.com', dateAdded: 1000 },
            ],
          },
        ],
      },
    ];
    const result = flattenBookmarks(tree);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '2',
      title: 'GitHub',
      url: 'https://github.com',
      tags: [],
      parseError: null,
    });
  });

  it('parses tags from rawTitle', () => {
    const tree = [{ id: '1', title: 'Dev Notes | dev, notes', url: 'https://example.com' }];
    const [bm] = flattenBookmarks(tree);
    expect(bm.tags).toEqual(['dev', 'notes']);
  });

  it('uses url as rawTitle when title is empty', () => {
    const tree = [{ id: '1', title: '', url: 'https://example.com' }];
    const [bm] = flattenBookmarks(tree);
    expect(bm.rawTitle).toBe('https://example.com');
  });

  it('skips folder nodes (no url)', () => {
    const tree = [
      {
        id: '1',
        title: 'Folder',
        children: [
          { id: '2', title: 'Link', url: 'https://example.com' },
        ],
      },
    ];
    const result = flattenBookmarks(tree);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
