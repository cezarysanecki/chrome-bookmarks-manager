import { STORAGE_KEYS } from './src/config.js';
import { cleanTrackingParams } from './src/lib/url.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (data) => {
    const current = data[STORAGE_KEYS.SETTINGS] || {};
    const {
      aiEnabled: _aiEnabled,
      openaiKey: _openaiKey,
      deadLinkCheck: _deadLinkCheck,
      ...remainingSettings
    } = current;
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: remainingSettings });
  });
  chrome.storage.local.remove(['bm_stats', 'bm_installed_at']);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'add-bookmark') return;

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (err) {
    showBadge('!', '#ff3b30');
    return;
  }

  if (!tab?.url) return;

  const cleanedUrl = cleanTrackingParams(tab.url);
  await chrome.storage.local.set({
    [STORAGE_KEYS.PENDING_ADD]: { title: tab.title || cleanedUrl, url: cleanedUrl },
  });

  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup() not available in this context — show badge as hint
    showBadge('+', '#ff5722');
  }
});

function showBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}
