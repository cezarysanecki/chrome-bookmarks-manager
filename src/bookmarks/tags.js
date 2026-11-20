export function mergeTags(currentTags, addedTags) {
  const seen = new Set(currentTags.map((tag) => tag.toLocaleLowerCase()));
  const merged = [...currentTags];
  for (const tag of addedTags) {
    const trimmed = tag.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      merged.push(trimmed);
    }
  }
  return merged;
}

export function collectTags(bookmarks) {
  const counts = new Map();
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

export function updateRecentTags(recentTags, usedTags, limit) {
  const merged = mergeTags([], [...usedTags].reverse().concat(recentTags));
  return merged.slice(0, limit);
}
