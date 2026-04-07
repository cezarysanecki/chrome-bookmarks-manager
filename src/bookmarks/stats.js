import { STORAGE_KEYS } from '../config.js';

// Abstraction for bookmark open-count tracking.
// Storage backend: chrome.storage.local, key: STORAGE_KEYS.STATS
// To swap backend: replace increment() and getAll() implementations.
//
// Storage format per entry: { count: number, lastOpened: timestamp|null }
// Backwards-compatible with old plain-number format.

export const BookmarkStats = {
  /** Increment open count and record lastOpened timestamp. Fire-and-forget. */
  increment(id) {
    if (!chrome.storage?.local) return;
    chrome.storage.local.get(STORAGE_KEYS.STATS, (data) => {
      const stats = data[STORAGE_KEYS.STATS] || {};
      const prev  = stats[id];
      const count = (typeof prev === 'object' ? prev.count : (prev || 0)) + 1;
      stats[id] = { count, lastOpened: Date.now() };
      chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats });
    });
  },

  /** Read all stats, normalise old format, pass { [id]: { count, lastOpened } } to callback. */
  getAll(cb) {
    if (!chrome.storage?.local) { cb({}); return; }
    chrome.storage.local.get(STORAGE_KEYS.STATS, (data) => {
      const raw        = data[STORAGE_KEYS.STATS] || {};
      const normalised = {};
      for (const [id, val] of Object.entries(raw)) {
        normalised[id] = typeof val === 'object'
          ? val
          : { count: val, lastOpened: null };
      }
      cb(normalised);
    });
  },
};
