import { describe, it, expect } from 'vitest';
import { isStale } from '../src/bookmarks/parse.js';
import { STALE_MS } from '../src/config.js';

const DAY = 24 * 60 * 60 * 1000;

describe('isStale', () => {
  const installedAt = 1_000_000;
  const now = installedAt + STALE_MS + DAY; // well past staleness threshold

  it('is not stale when last opened recently', () => {
    const bm = { id: '1', dateAdded: 0 };
    const stats = { '1': { count: 5, lastOpened: now - DAY } }; // opened 1 day ago
    expect(isStale(bm, stats, installedAt, now)).toBe(false);
  });

  it('is stale when last opened long ago', () => {
    const bm = { id: '1', dateAdded: 0 };
    const stats = { '1': { count: 1, lastOpened: installedAt } }; // opened at install time
    expect(isStale(bm, stats, installedAt, now)).toBe(true);
  });

  it('uses dateAdded when never opened and dateAdded is recent', () => {
    const recentAdded = now - DAY;
    const bm = { id: '1', dateAdded: recentAdded };
    const stats = {};
    expect(isStale(bm, stats, installedAt, now)).toBe(false);
  });

  it('uses pluginInstalledAt when never opened and dateAdded is 0', () => {
    const bm = { id: '1', dateAdded: 0 };
    const stats = {};
    // installedAt is STALE_MS + DAY before now => stale
    expect(isStale(bm, stats, installedAt, now)).toBe(true);
  });

  it('is not stale when plugin was installed recently (never opened)', () => {
    const recentInstall = now - DAY;
    const bm = { id: '1', dateAdded: 0 };
    const stats = {};
    expect(isStale(bm, stats, recentInstall, now)).toBe(false);
  });

  it('uses max(dateAdded, pluginInstalledAt) as reference when no stats', () => {
    const laterInstall = now - DAY * 10;
    const olderAdded = now - STALE_MS * 2;
    const bm = { id: '1', dateAdded: olderAdded };
    const stats = {};
    // laterInstall is reference (it's more recent than olderAdded)
    expect(isStale(bm, stats, laterInstall, now)).toBe(false);
  });
});
