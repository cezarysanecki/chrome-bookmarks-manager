'use strict';

// Known tracking / noise parameters to strip from URLs.
// Conservative list — only well-known params that carry zero functional value.
const TRACKING_PARAMS = new Set([
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('bm_installed_at', (data) => {
    if (!data.bm_installed_at) {
      chrome.storage.local.set({ bm_installed_at: Date.now() });
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'add-bookmark') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const cleanedUrl = cleanUrl(tab.url);
  await chrome.storage.local.set({
    bm_pending_add: { title: tab.title || cleanedUrl, url: cleanedUrl },
  });

  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup() not available in this context — show badge as hint
    showBadge('+', '#7c6aff');
  }
});

/**
 * Remove known tracking query parameters from a URL.
 * Returns the original string unchanged if it can't be parsed.
 */
function cleanUrl(rawUrl) {
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

  // Drop trailing "?" when all params were removed
  if (!parsed.search && before) {
    parsed.search = '';
  }

  return parsed.toString();
}

function showBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}
