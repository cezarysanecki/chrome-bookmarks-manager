import { ALLOWED_PROTOCOLS } from '../config.js';

/**
 * Canonical tracking-param list — shared by background.js (URL cleaning on add)
 * and normalizeUrl (duplicate detection). One source of truth.
 *
 * Conservative: only well-known params that carry zero functional value.
 */
export const TRACKING_PARAMS = new Set([
  // UTM (Google Analytics)
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  // Google Ads
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  // Facebook / Meta
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source',
  // Microsoft Ads
  'msclkid',
  // Twitter / X
  'twclid',
  // HubSpot
  '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad',
  'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
  // Mailchimp
  'mc_cid', 'mc_eid',
  // Marketo
  'mkt_tok',
  // Drip
  '__s',
  // Vero
  'vero_id', 'vero_conv',
  // LinkedIn
  'li_fat_id',
  // TikTok
  'ttclid',
  // Pinterest
  'epik',
  // Generic click-tracking noise
  'igshid', 'si', 'ref_',
]);

/**
 * Strip tracking query parameters from a URL string.
 * Returns the original string unchanged if it cannot be parsed.
 */
export function cleanTrackingParams(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const before = parsed.search;
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) {
      parsed.searchParams.delete(key);
    }
  }

  if (!parsed.search && before) {
    parsed.search = '';
  }

  return parsed.toString();
}

/**
 * Normalize a URL for duplicate detection:
 * - lowercase scheme + host
 * - strip www.
 * - strip tracking params
 * - strip fragment
 * - strip trailing slash on path
 */
export function normalizeUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl.toLowerCase().trim();
  }

  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) {
      u.searchParams.delete(key);
    }
  }

  u.hash = '';
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const query = u.search;

  return `${u.protocol}//${host}${path}${query}`.toLowerCase();
}

/** Extract hostname (without www.) from a URL string; returns '' on parse failure. */
export function urlHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Returns true if the URL has a protocol we're willing to open. */
export function isAllowedProtocol(url) {
  try {
    return ALLOWED_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
