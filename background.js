import { STORAGE_KEYS } from './src/config.js';
import { cleanTrackingParams } from './src/lib/url.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(STORAGE_KEYS.INSTALLED_AT, (data) => {
    if (!data[STORAGE_KEYS.INSTALLED_AT]) {
      chrome.storage.local.set({ [STORAGE_KEYS.INSTALLED_AT]: Date.now() });
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'add-bookmark') return;

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (err) {
    showBadge('!', '#e53e3e');
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
    showBadge('+', '#7c6aff');
  }
});

function showBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}
