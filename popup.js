import {
  DEBOUNCE_MS,
  HISTORY_MAX,
  POPUP_INITIAL_RENDER_COUNT,
  POPUP_RENDER_BATCH_SIZE,
  RECENT_TAGS_MAX,
  STORAGE_KEYS,
} from './src/config.js';
import { buildRawTitle, flattenBookmarks } from './src/bookmarks/parse.js';
import { findBookmarkByUrl } from './src/bookmarks/duplicates.js';
import { collectTags, mergeTags, updateRecentTags } from './src/bookmarks/tags.js';
import { bookmarksApi } from './src/bookmarks/api.js';
import { highlight } from './src/lib/dom.js';
import { isAllowedProtocol, urlHostname } from './src/lib/url.js';
import { svgCheck, svgCopy, svgWarn } from './src/ui/icons.js';

let allBookmarks = [];
let currentQuery = '';
let highlightedIndex = -1;
let settings = { favicons: false };
let recentTags = [];
let renderGeneration = 0;

const searchInput = document.getElementById('search');
const clearBtn = document.getElementById('clear-search');
const bookmarksList = document.getElementById('bookmarks-list');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');
const resultsCount = document.getElementById('results-count');
const toastEl = document.getElementById('toast');
const addPanel = document.getElementById('add-panel');
const addForm = document.getElementById('add-form');
const addTitleInput = document.getElementById('add-title');
const addUrlInput = document.getElementById('add-url');
const addTagsInput = document.getElementById('add-tags');
const addSubmitButton = addForm.querySelector('.edit-save');
const addDuplicateEl = document.getElementById('add-duplicate');
const tagSuggestionsEl = document.getElementById('tag-suggestions');
const tagSuggestionChipsEl = document.getElementById('tag-suggestion-chips');

async function initBookmarks() {
  try {
    const tree = await bookmarksApi.getTree();
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(filterBookmarks(''), '');
    if (!addPanel.hidden) {
      renderTagSuggestions();
      updateDuplicateNotice();
    }
  } catch (err) {
    showToast(`Błąd ładowania zakładek: ${err.message}`, 'err');
  }
}

function getStoredStartupData() {
  if (!chrome.storage?.local) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.PENDING_ADD, STORAGE_KEYS.RECENT_TAGS],
      (data) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(data);
      },
    );
  });
}

async function initPopup() {
  try {
    const [tree, data] = await Promise.all([
      bookmarksApi.getTree(),
      getStoredStartupData(),
    ]);
    settings = { favicons: false, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
    recentTags = data[STORAGE_KEYS.RECENT_TAGS] || [];
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(allBookmarks, '');

    if (data[STORAGE_KEYS.PENDING_ADD]) {
      const { title, url } = data[STORAGE_KEYS.PENDING_ADD];
      chrome.storage.local.remove(STORAGE_KEYS.PENDING_ADD);
      openAddPanel(title, url);
    }
  } catch (err) {
    showToast(`Błąd ładowania zakładek: ${err.message}`, 'err');
  }
}

function openAddPanel(title = '', url = '', tags = '') {
  addTitleInput.value = title;
  addUrlInput.value = url;
  addTagsInput.value = tags;
  addPanel.hidden = false;
  renderTagSuggestions();
  updateDuplicateNotice();
  (title ? addUrlInput : addTitleInput).focus();
}

function closeAddPanel() {
  addPanel.hidden = true;
  addForm.reset();
  addDuplicateEl.hidden = true;
}

function parseTagsInput() {
  return addTagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function renderTagSuggestions() {
  const suggestions = mergeTags(recentTags, collectTags(allBookmarks)).slice(0, 8);
  tagSuggestionChipsEl.innerHTML = '';
  tagSuggestionsEl.hidden = suggestions.length === 0;
  for (const tag of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-suggestion-chip';
    button.textContent = tag;
    button.addEventListener('click', () => {
      addTagsInput.value = mergeTags(parseTagsInput(), [tag]).join(', ');
      button.classList.add('tag-suggestion-chip--selected');
      addTagsInput.focus();
    });
    tagSuggestionChipsEl.appendChild(button);
  }
}

function updateDuplicateNotice() {
  const url = addUrlInput.value.trim();
  const existing = url ? findBookmarkByUrl(allBookmarks, url) : null;
  addDuplicateEl.hidden = !existing;
  addSubmitButton.textContent = existing ? 'Uzupełnij etykiety' : 'Dodaj zakładkę';
  if (!existing) return;
  addDuplicateEl.textContent = `Już zapisano: ${existing.title}. Nowe etykiety zostaną dopisane do istniejącej zakładki.`;
}

addUrlInput.addEventListener('input', updateDuplicateNotice);

document.getElementById('btn-add').addEventListener('click', () => {
  if (!addPanel.hidden) {
    closeAddPanel();
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    openAddPanel(tab?.title || '', tab?.url || '');
  });
});

document.getElementById('add-cancel').addEventListener('click', closeAddPanel);

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = addTitleInput.value.trim();
  const url = addUrlInput.value.trim();
  const tags = parseTagsInput();
  if (!title || !url) return;

  try {
    const existing = findBookmarkByUrl(allBookmarks, url);
    if (existing) {
      const mergedTags = mergeTags(existing.tags, tags);
      if (mergedTags.length !== existing.tags.length) {
        const rawTitleBefore = existing.rawTitle;
        const newRawTitle = buildRawTitle(existing.title, mergedTags);
        await bookmarksApi.update(existing.id, { title: newRawTitle });
        existing.tags = mergedTags;
        existing.rawTitle = newRawTitle;
        pushHistory({
          type: 'edit',
          id: existing.id,
          title: existing.title,
          rawTitleBefore,
          urlBefore: existing.url,
        });
      }
      await rememberTags(tags);
      closeAddPanel();
      await initBookmarks();
      highlightBookmarkById(existing.id);
      showToast(tags.length > 0
        ? `Zakładka już istniała — uzupełniono etykiety`
        : `Zakładka „${existing.title}" już istnieje`, 'warn');
      return;
    }

    await bookmarksApi.create({ title: buildRawTitle(title, tags), url });
    await rememberTags(tags);
    closeAddPanel();
    await initBookmarks();
    showToast(`Dodano "${title}"`, 'ok');
  } catch (err) {
    showToast(`Błąd dodawania: ${err.message}`, 'err');
  }
});

function pushHistory(entry) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(STORAGE_KEYS.HISTORY, (data) => {
    const history = data[STORAGE_KEYS.HISTORY] || [];
    history.unshift({ ...entry, ts: Date.now() });
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history.slice(0, HISTORY_MAX) });
  });
}

function rememberTags(tags) {
  if (!chrome.storage?.local || tags.length === 0) return Promise.resolve();
  recentTags = updateRecentTags(recentTags, tags, RECENT_TAGS_MAX);
  return chrome.storage.local.set({ [STORAGE_KEYS.RECENT_TAGS]: recentTags });
}

document.getElementById('btn-fullpage').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') });
});

let debounceTimer;
searchInput.addEventListener('input', () => {
  highlightedIndex = -1;
  clearBtn.hidden = searchInput.value.length === 0;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    currentQuery = searchInput.value;
    renderBookmarks(filterBookmarks(currentQuery), currentQuery);
  }, DEBOUNCE_MS);
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.hidden = true;
  currentQuery = '';
  searchInput.focus();
  renderBookmarks(allBookmarks, '');
});

function filterBookmarks(query) {
  if (!query.trim()) return allBookmarks;
  const normalizedQuery = query.toLowerCase();
  return allBookmarks.filter(
    (bookmark) => bookmark.title.toLowerCase().includes(normalizedQuery)
      || bookmark.url.toLowerCase().includes(normalizedQuery)
      || bookmark.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)),
  );
}

function renderBookmarks(bookmarks, query) {
  const generation = ++renderGeneration;
  faviconObserver?.disconnect();
  bookmarksList.innerHTML = '';
  resultsCount.textContent = query.trim()
    ? `${bookmarks.length} z ${allBookmarks.length} zakładek`
    : allBookmarks.length === 0 ? '' : `${allBookmarks.length} zakładek`;

  if (bookmarks.length === 0) {
    bookmarksList.hidden = true;
    emptyState.hidden = false;
    emptyMessage.textContent = query.trim() ? `Brak wyników dla "${query}"` : 'Brak zakładek';
    return;
  }

  bookmarksList.hidden = false;
  emptyState.hidden = true;
  appendBookmarkRows(
    bookmarks.slice(0, POPUP_INITIAL_RENDER_COUNT),
    query,
  );

  let nextIndex = POPUP_INITIAL_RENDER_COUNT;
  const appendNextBatch = () => {
    if (generation !== renderGeneration || nextIndex >= bookmarks.length) return;
    const endIndex = Math.min(nextIndex + POPUP_RENDER_BATCH_SIZE, bookmarks.length);
    appendBookmarkRows(bookmarks.slice(nextIndex, endIndex), query);
    nextIndex = endIndex;
    scheduleIdleRender(appendNextBatch);
  };
  scheduleIdleRender(appendNextBatch);
}

function appendBookmarkRows(bookmarks, query) {
  const fragment = document.createDocumentFragment();
  for (const bookmark of bookmarks) fragment.appendChild(createBookmarkRow(bookmark, query));
  bookmarksList.appendChild(fragment);
}

function scheduleIdleRender(callback) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback);
  } else {
    setTimeout(callback, 0);
  }
}

const faviconObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const favicon = entry.target;
      favicon.src = favicon.dataset.src;
      faviconObserver.unobserve(favicon);
    }
  })
  : null;

initPopup();

function createBookmarkRow(bookmark, query) {
  const row = document.createElement('li');
  row.className = 'bookmark-row';
  row.dataset.id = bookmark.id;

  if (settings.favicons) {
    const host = urlHostname(bookmark.url);
    const favicon = document.createElement('img');
    favicon.className = 'bookmark-favicon';
    const src = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : '';
    favicon.width = 14;
    favicon.height = 14;
    favicon.alt = '';
    favicon.decoding = 'async';
    favicon.onerror = () => { favicon.style.display = 'none'; };
    if (faviconObserver && src) {
      favicon.dataset.src = src;
      faviconObserver.observe(favicon);
    } else {
      favicon.src = src;
    }
    row.appendChild(favicon);
  }

  const link = document.createElement('a');
  link.className = 'bookmark-link';
  link.href = bookmark.url;
  link.title = bookmark.url;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openBookmark(bookmark);
  });

  const title = document.createElement('span');
  title.className = 'bookmark-title';
  title.innerHTML = highlight(bookmark.title, query);

  const url = document.createElement('span');
  url.className = 'bookmark-url';
  url.innerHTML = highlight(bookmark.url, query);

  link.appendChild(title);
  link.appendChild(url);

  if (bookmark.parseError) {
    const errorBadge = document.createElement('button');
    errorBadge.className = 'parse-error-badge';
    errorBadge.title = bookmark.parseError;
    errorBadge.innerHTML = `${svgWarn()}<span>Błąd etykiet</span>`;
    errorBadge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTagsErrorPage(bookmark);
    });
    link.appendChild(errorBadge);
  } else if (bookmark.tags.length > 0) {
    link.appendChild(buildTagChips(bookmark));
  }

  const copyButton = document.createElement('button');
  copyButton.className = 'copy-btn';
  copyButton.title = 'Kopiuj link';
  copyButton.innerHTML = svgCopy();
  copyButton.addEventListener('click', (event) => {
    event.stopPropagation();
    copyLink(bookmark.url, copyButton);
  });

  row.appendChild(link);
  row.appendChild(copyButton);
  return row;
}

function buildTagChips(bookmark) {
  const container = document.createElement('div');
  container.className = 'row-tags';
  for (const tag of bookmark.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    container.appendChild(chip);
  }
  return container;
}

function getRows() {
  return [...bookmarksList.querySelectorAll('.bookmark-row:not([hidden])')];
}

function setHighlight(index) {
  const rows = getRows();
  rows.forEach((row) => row.classList.remove('highlighted'));
  highlightedIndex = Math.max(-1, Math.min(index, rows.length - 1));
  if (highlightedIndex >= 0) {
    rows[highlightedIndex].classList.add('highlighted');
    rows[highlightedIndex].scrollIntoView({ block: 'nearest' });
  }

  function highlightBookmarkById(id) {
    const rows = getRows();
    const index = rows.findIndex((row) => row.dataset.id === id);
    if (index >= 0) setHighlight(index);
  }
}

searchInput.addEventListener('keydown', (event) => {
  if (bookmarksList.hidden) return;
  const rows = getRows();
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setHighlight(highlightedIndex >= rows.length - 1 ? 0 : highlightedIndex + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setHighlight(highlightedIndex <= 0 ? rows.length - 1 : highlightedIndex - 1);
  } else if (event.key === 'Enter' && highlightedIndex >= 0) {
    event.preventDefault();
    const bookmark = allBookmarks.find((item) => item.id === rows[highlightedIndex]?.dataset.id);
    if (bookmark) openBookmark(bookmark);
  } else if (event.key === 'Escape' && highlightedIndex >= 0) {
    setHighlight(-1);
  }
});

function openBookmark(bookmark) {
  if (!isAllowedProtocol(bookmark.url)) {
    chrome.tabs.create({
      url: `${chrome.runtime.getURL('error.html')}?type=url&value=${encodeURIComponent(bookmark.url)}`,
    });
    return;
  }
  chrome.tabs.create({ url: bookmark.url });
}

function openTagsErrorPage(bookmark) {
  const params = new URLSearchParams({
    type: 'tags',
    value: bookmark.rawTitle,
    reason: bookmark.parseError,
    id: bookmark.id,
  });
  chrome.tabs.create({ url: `${chrome.runtime.getURL('error.html')}?${params}` });
}

function copyLink(url, button) {
  navigator.clipboard.writeText(url).then(() => {
    const original = button.innerHTML;
    button.innerHTML = svgCheck();
    button.classList.add('copy-btn--copied');
    setTimeout(() => {
      button.innerHTML = original;
      button.classList.remove('copy-btn--copied');
    }, 1500);
  });
}

let toastTimer;
function showToast(message, type = 'ok') {
  toastEl.textContent = message;
  toastEl.className = `toast toast--${type}`;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
}
