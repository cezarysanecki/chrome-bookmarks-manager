import { describe, expect, it } from 'vitest';
import { collectTags, mergeTags, updateRecentTags } from '../src/bookmarks/tags.js';

describe('mergeTags', () => {
  it('adds unique trimmed tags case-insensitively', () => {
    expect(mergeTags(['Work'], [' work ', 'Reading'])).toEqual(['Work', 'Reading']);
  });
});

describe('collectTags', () => {
  it('sorts tags by usage and then alphabetically', () => {
    const bookmarks = [
      { tags: ['work', 'reading'] },
      { tags: ['work', 'dev'] },
      { tags: ['dev'] },
    ];

    expect(collectTags(bookmarks)).toEqual(['dev', 'work', 'reading']);
  });
});

describe('updateRecentTags', () => {
  it('puts newly used tags first and applies the limit', () => {
    expect(updateRecentTags(['old', 'work'], ['work', 'new'], 3)).toEqual(['new', 'work', 'old']);
  });
});
