import { normalizeUrl, urlHostname } from '../lib/url.js';

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

/** Return bookmarks similar to `bm` by shared domain or title keywords. */
export function findSimilar(bm, bookmarks) {
  const host  = urlHostname(bm.url);
  const words = sigWords(bm.title);
  return bookmarks.filter((other) => {
    if (other.id === bm.id) return false;
    if (host && urlHostname(other.url) === host) return true;
    return sigWords(other.title).filter((w) => words.includes(w)).length >= 2;
  });
}

/** Extract significant (length >= 4) unique lowercased words from a title. */
export function sigWords(title) {
  return [...new Set(
    title.toLowerCase().split(/[\s\-_/.,]+/).filter((w) => w.length >= 4)
  )];
}
