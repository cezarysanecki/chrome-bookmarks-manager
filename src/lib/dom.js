/**
 * Escape a value for safe insertion into HTML.
 * Coerces non-strings, escapes all five dangerous characters plus slash.
 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
    .replace(/\//g, '&#x2F;');
}

/** Escape a string for use as a literal inside a RegExp. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return an HTML string with all occurrences of `query` wrapped in <mark>.
 * Both text and query are HTML-escaped first, so the result is safe for innerHTML.
 */
export function highlight(text, query) {
  const escaped = escapeHtml(text);
  if (!query.trim()) return escaped;
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(escapeRegex(escapedQuery), 'gi');
  return escaped.replace(regex, '<mark>$&</mark>');
}
