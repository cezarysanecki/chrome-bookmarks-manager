import { STALE_MS } from '../config.js';

/**
 * Parse "Display Title | tag1, tag2" into { title, tags, parseError }.
 * parseError is a human-readable string when the tag section is malformed,
 * or null when everything is fine (including no tags at all).
 *
 * Rules that produce a parseError:
 *   - " | " present but nothing (or only whitespace) follows it
 *   - any individual tag is empty after trimming (e.g. "Title | , tag2")
 *   - any tag contains a pipe character (nested separators)
 */
export function parseTitle(raw) {
  const sep = raw.indexOf(' | ');
  if (sep === -1) return { title: raw, tags: [], parseError: null };

  const title = raw.slice(0, sep).trim();
  const rawTagSection = raw.slice(sep + 3);

  if (!rawTagSection.trim()) {
    return {
      title,
      tags: [],
      parseError: `Sekcja etykiet jest pusta — usuń " | " lub dodaj etykietę`,
    };
  }

  const parts = rawTagSection.split(',');
  const emptyParts = parts.filter((t) => !t.trim());
  if (emptyParts.length > 0) {
    return {
      title,
      tags: parts.map((t) => t.trim()).filter(Boolean),
      parseError: `Pusta etykieta w "${rawTagSection.trim()}" — usuń nadmiarowe przecinki`,
    };
  }

  const tags = parts.map((t) => t.trim());
  const withPipe = tags.filter((t) => t.includes('|'));
  if (withPipe.length > 0) {
    return {
      title,
      tags,
      parseError: `Etykieta nie może zawierać "|": ${withPipe.map((t) => `"${t}"`).join(', ')}`,
    };
  }

  return { title, tags, parseError: null };
}

/** Rebuild raw title from display title + tags array. */
export function buildRawTitle(title, tags) {
  return tags.length > 0 ? `${title} | ${tags.join(', ')}` : title;
}

/** Flatten a bookmark tree into a list of leaf objects. */
export function flattenBookmarks(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.url) {
      const raw = node.title || node.url;
      const { title, tags, parseError } = parseTitle(raw);
      result.push({
        id: node.id,
        rawTitle: raw,
        title,
        url: node.url,
        tags,
        parseError,
        dateAdded: node.dateAdded || 0,
      });
    }
    if (node.children) result.push(...flattenBookmarks(node.children));
  }
  return result;
}

/**
 * Returns true if a bookmark is considered stale (unused for STALE_MS).
 *
 * @param {object} bm - bookmark object
 * @param {object} stats - { [id]: { count, lastOpened } }
 * @param {number} pluginInstalledAt - timestamp of plugin installation
 * @param {number} [now] - current timestamp (injectable for testing)
 */
export function isStale(bm, stats, pluginInstalledAt, now = Date.now()) {
  const stat = stats[bm.id];
  const refDate = stat?.lastOpened
    ?? Math.max(bm.dateAdded || 0, pluginInstalledAt);
  return now - refDate > STALE_MS;
}
