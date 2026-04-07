// Central configuration — all magic values live here.
// Import from this file; never hard-code these strings/numbers elsewhere.

export const STORAGE_KEYS = {
  STATS:        'bm_stats',
  INSTALLED_AT: 'bm_installed_at',
  PENDING_ADD:  'bm_pending_add',
  HISTORY:      'bm_history',
  SETTINGS:     'bm_settings',
};

export const HISTORY_MAX = 30;

/** Bookmarks unused for longer than this are considered stale (30 days). */
export const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];

export const OPENAI = {
  URL:   'https://api.openai.com/v1/chat/completions',
  MODEL: 'gpt-4o-mini',
};

export const DEBOUNCE_MS = 300;
