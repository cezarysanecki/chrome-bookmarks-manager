import { normalizeUrl } from '../lib/url.js';

/** Return groups of bookmarks sharing the same normalised URL. */
export function findDuplicateGroups(bookmarks) {
  const groups = new Map();
  for (const bm of bookmarks) {
    const key = normalizeUrl(bm.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bm);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Find an existing bookmark with the same normalized URL. */
export function findBookmarkByUrl(bookmarks, url) {
  const normalized = normalizeUrl(url);
  return bookmarks.find((bookmark) => normalizeUrl(bookmark.url) === normalized) ?? null;
}
