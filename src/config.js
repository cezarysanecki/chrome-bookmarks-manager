// Central configuration — all magic values live here.
// Import from this file; never hard-code these strings/numbers elsewhere.

export const STORAGE_KEYS = {
  PENDING_ADD:  'bm_pending_add',
  HISTORY:      'bm_history',
  RECENT_TAGS:  'bm_recent_tags',
  SETTINGS:     'bm_settings',
  VIEW_PREFS:   'bm_view_prefs',
};

export const HISTORY_MAX = 30;
export const RECENT_TAGS_MAX = 8;

export const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];

export const DEBOUNCE_MS = 300;
