// Tags are stored directly in the bookmark title using the format:
//   "Display Title | tag1, tag2, tag3"
// No external storage needed — tags travel with the bookmark.

import { STORAGE_KEYS, HISTORY_MAX, DEBOUNCE_MS } from './src/config.js';
import { normalizeUrl, urlHostname, isAllowedProtocol } from './src/lib/url.js';
import { escapeHtml, escapeRegex, highlight } from './src/lib/dom.js';
import { csvRow, parseCsv, dateStamp } from './src/lib/csv.js';
import { BookmarkStats } from './src/bookmarks/stats.js';
import { parseTitle, buildRawTitle, flattenBookmarks, isStale } from './src/bookmarks/parse.js';
import { findDuplicateGroups, findSimilar, sigWords } from './src/bookmarks/duplicates.js';
import { svgEdit, svgTrash, svgCopy, svgCheck, svgWarn, svgLabel, svgSimilar, svgAI } from './src/ui/icons.js';
import { bookmarksApi } from './src/bookmarks/api.js';

let allBookmarks = [];   // [{ id, rawTitle, title, url, tags[] }]
let currentQuery = '';
let activeTagFilter = null;
let activeSimilarTo = null;  // bm object | null
let currentSort = 'popular';
let bookmarkStats = {};  // { [id]: { count, lastOpened } }
let showOnlyStale = false;
let pluginInstalledAt = Date.now();

// --- DOM refs ---
const searchInput    = document.getElementById('search');
const clearBtn       = document.getElementById('clear-search');
const bookmarksList  = document.getElementById('bookmarks-list');
const emptyState     = document.getElementById('empty-state');
const emptyMessage   = document.getElementById('empty-message');
const toastEl        = document.getElementById('toast');
const importFileEl   = document.getElementById('import-file');
const resultsCount   = document.getElementById('results-count');
const sortSelect     = document.getElementById('sort-select');
const tagFilterBar      = document.getElementById('tag-filter-bar');
const tagFilterLabel    = document.getElementById('tag-filter-label');
const tagFilterClear    = document.getElementById('tag-filter-clear');
const similarFilterBar  = document.getElementById('similar-filter-bar');
const similarFilterLabel= document.getElementById('similar-filter-label');
const similarFilterClear= document.getElementById('similar-filter-clear');
const dupBar            = document.getElementById('dup-bar');
const dupBarText        = document.getElementById('dup-bar-text');
const dupBarFilter      = document.getElementById('dup-bar-filter');
const dupBarClear       = document.getElementById('dup-bar-clear');
const staleBar          = document.getElementById('stale-bar');
const staleBarText      = document.getElementById('stale-bar-text');
const staleBarFilter    = document.getElementById('stale-bar-filter');
const staleBarClear     = document.getElementById('stale-bar-clear');
const modalOverlay   = document.getElementById('modal-overlay');
const modalDesc      = document.getElementById('modal-desc');
const modalCancel    = document.getElementById('modal-cancel');
const modalConfirm   = document.getElementById('modal-confirm');
const addPanel       = document.getElementById('add-panel');
const addForm        = document.getElementById('add-form');
const addTitleInput  = document.getElementById('add-title');
const addUrlInput    = document.getElementById('add-url');
const addTagsInput   = document.getElementById('add-tags');
const addCancelBtn   = document.getElementById('add-cancel');

let showOnlyDuplicates = false;
let settings = { favicons: false, aiEnabled: false, openaiKey: '' };

// --- History (chrome.storage.local) ---

function historyPush(entry) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(STORAGE_KEYS.HISTORY, (data) => {
    const list = data[STORAGE_KEYS.HISTORY] || [];
    list.unshift({ ...entry, ts: Date.now() });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: list });
  });
}

function historyRemoveByTs(ts) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(STORAGE_KEYS.HISTORY, (data) => {
    const list = (data[STORAGE_KEYS.HISTORY] || []).filter((e) => e.ts !== ts);
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: list });
  });
}

async function undoHistoryEntry(entry, onDone) {
  try {
    if (entry.type === 'delete') {
      await bookmarksApi.create({ title: entry.rawTitle, url: entry.url });
    } else if (entry.type === 'edit' || entry.type === 'tag_add' || entry.type === 'tag_remove') {
      await bookmarksApi.update(entry.id, { title: entry.rawTitleBefore, url: entry.urlBefore ?? entry.url });
    }
    historyRemoveByTs(entry.ts);
    onDone?.();
  } catch (err) {
    showToast(`Błąd cofania: ${err.message}`, 'err');
  }
}

// --- Bootstrap ---
async function initBookmarks() {
  try {
    const tree = await bookmarksApi.getTree();
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(filterBookmarks(''), '');
    checkDuplicates();
    checkStale();
  } catch (err) {
    showToast(`Błąd ładowania zakładek: ${err.message}`, 'err');
  }
}

// --- Add bookmark panel ---

function openAddPanel(title = '', url = '', tags = '') {
  addTitleInput.value = title;
  addUrlInput.value   = url;
  addTagsInput.value  = tags;
  addPanel.hidden = false;
  (title ? addUrlInput : addTitleInput).focus();
}

function closeAddPanel() {
  addPanel.hidden = true;
  addForm.reset();
}

document.getElementById('btn-add').addEventListener('click', () => {
  if (!addPanel.hidden) { closeAddPanel(); return; }
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    openAddPanel(tab?.title || '', tab?.url || '');
  });
});

addCancelBtn.addEventListener('click', closeAddPanel);

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = addTitleInput.value.trim();
  const url   = addUrlInput.value.trim();
  const tags  = addTagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
  if (!title || !url) return;

  try {
    await bookmarksApi.create({ title: buildRawTitle(title, tags), url });
    closeAddPanel();
    const tree = await bookmarksApi.getTree();
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(filterBookmarks(currentQuery), currentQuery);
    checkDuplicates();
    showToast(`Dodano „${title}"`, 'ok');
  } catch (err) {
    showToast(`Błąd dodawania: ${err.message}`, 'err');
  }
});

if (chrome.storage?.local) {
  chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS, STORAGE_KEYS.PENDING_ADD, STORAGE_KEYS.INSTALLED_AT], (data) => {
    settings = { favicons: false, aiEnabled: false, openaiKey: '', ...(data[STORAGE_KEYS.SETTINGS] || {}) };
    bookmarkStats = data[STORAGE_KEYS.STATS] || {};
    if (data[STORAGE_KEYS.INSTALLED_AT]) {
      pluginInstalledAt = data[STORAGE_KEYS.INSTALLED_AT];
    } else {
      pluginInstalledAt = Date.now();
      chrome.storage.local.set({ [STORAGE_KEYS.INSTALLED_AT]: pluginInstalledAt });
    }
    initBookmarks();
    if (data[STORAGE_KEYS.PENDING_ADD]) {
      const { title, url } = data[STORAGE_KEYS.PENDING_ADD];
      chrome.storage.local.remove(STORAGE_KEYS.PENDING_ADD);
      openAddPanel(title, url);
    }
  });
} else {
  initBookmarks();
}

// --- Export / Import ---
document.getElementById('btn-fullpage').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') });
});
document.getElementById('btn-export').addEventListener('click', exportBookmarks);
document.getElementById('btn-import').addEventListener('click', () => importFileEl.click());
importFileEl.addEventListener('change', () => {
  const file = importFileEl.files[0];
  if (file) importBookmarks(file);
  importFileEl.value = '';
});

// --- Search ---
let debounceTimer;
searchInput.addEventListener('input', () => {
  const query = searchInput.value;
  clearBtn.hidden = query.length === 0;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    currentQuery = query;
    renderBookmarks(filterBookmarks(query), query);
  }, DEBOUNCE_MS);
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.hidden = true;
  currentQuery = '';
  searchInput.focus();
  renderBookmarks(filterBookmarks(''), '');
});

// --- Tag filter bar ---
tagFilterClear.addEventListener('click', () => {
  activeTagFilter = null;
  tagFilterBar.hidden = true;
  renderBookmarks(filterBookmarks(currentQuery), currentQuery);
});

// --- Duplicates ---
dupBarFilter.addEventListener('click', () => {
  showOnlyDuplicates = true; showOnlyStale = false;
  activeTagFilter = null; activeSimilarTo = null;
  tagFilterBar.hidden = true; similarFilterBar.hidden = true;
  renderBookmarks(filterBookmarks(currentQuery), currentQuery);
});

dupBarClear.addEventListener('click', () => {
  showOnlyDuplicates = false;
  dupBar.hidden = true;
  renderBookmarks(filterBookmarks(currentQuery), currentQuery);
});

function checkDuplicates() {
  const groups = findDuplicateGroups(allBookmarks);
  const count  = groups.reduce((s, g) => s + g.length, 0);
  if (count > 0) {
    dupBarText.textContent = `${count} zakładek to duplikaty`;
    dupBar.hidden = false;
  }
}

function checkStale() {
  const count = allBookmarks.filter((bm) => isStale(bm, bookmarkStats, pluginInstalledAt)).length;
  if (count > 0) {
    staleBarText.textContent = `${count} zakładek nieużywanych przez 30+ dni`;
    staleBar.hidden = false;
  } else {
    staleBar.hidden = true;
  }
}

staleBarFilter.addEventListener('click', () => {
  showOnlyStale = true; showOnlyDuplicates = false;
  activeTagFilter = null; activeSimilarTo = null;
  tagFilterBar.hidden = true; similarFilterBar.hidden = true;
  staleBar.hidden = true;
  renderBookmarks(filterBookmarks(currentQuery), currentQuery);
});

staleBarClear.addEventListener('click', () => {
  staleBar.hidden = true;
});


// --- Sort ---
sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderBookmarks(filterBookmarks(currentQuery), currentQuery);
});

// --- Similar filter bar ---
similarFilterClear.addEventListener('click', () => {
  activeSimilarTo = null;
  similarFilterBar.hidden = true;
  renderBookmarks(filterBookmarks(currentQuery), currentQuery);
});

// --- Title parsing ---

function sortBookmarks(list) {
  if (currentSort === 'default') return list;
  const sorted = [...list];
  if (currentSort === 'popular') {
    sorted.sort((a, b) => (bookmarkStats[b.id]?.count || 0) - (bookmarkStats[a.id]?.count || 0));
    return sorted;
  }
  if (currentSort === 'az')     sorted.sort((a, b) => a.title.localeCompare(b.title));
  if (currentSort === 'za')     sorted.sort((a, b) => b.title.localeCompare(a.title));
  if (currentSort === 'domain') sorted.sort((a, b) => {
    const da = urlHostname(a.url) ?? '';
    const db = urlHostname(b.url) ?? '';
    return da.localeCompare(db) || a.title.localeCompare(b.title);
  });
  return sorted;
}

function filterBookmarks(query) {
  let list = allBookmarks;
  if (showOnlyStale) {
    list = list.filter((bm) => isStale(bm, bookmarkStats, pluginInstalledAt));
  } else if (showOnlyDuplicates) {
    const dupIds = new Set(findDuplicateGroups(allBookmarks).flat().map((b) => b.id));
    list = list.filter((bm) => dupIds.has(bm.id));
  } else if (activeSimilarTo) {
    const ids = new Set(findSimilar(activeSimilarTo, allBookmarks).map((b) => b.id));
    list = list.filter((bm) => ids.has(bm.id));
  } else if (activeTagFilter) {
    list = list.filter((bm) => bm.tags.includes(activeTagFilter));
  }
  if (!query.trim()) return list;
  const q = query.toLowerCase();
  return list.filter(
    (bm) => bm.title.toLowerCase().includes(q) || bm.url.toLowerCase().includes(q)
  );
}

function renderBookmarks(bookmarks, query) {
  bookmarksList.innerHTML = '';

  const total = allBookmarks.length;
  const shown = bookmarks.length;

  if (query.trim() || activeTagFilter) {
    resultsCount.textContent = `${shown} z ${total} zakładek`;
  } else {
    resultsCount.textContent = total === 0 ? '' : `${total} zakładek`;
  }

  if (bookmarks.length === 0) {
    bookmarksList.hidden = true;
    emptyState.hidden = false;
    emptyMessage.textContent = query.trim()
      ? `Brak wyników dla „${query}"`
      : activeTagFilter
        ? `Brak zakładek z etykietą „${activeTagFilter}"`
        : 'Brak zakładek';
    return;
  }

  bookmarksList.hidden = false;
  emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  for (const bm of sortBookmarks(bookmarks)) fragment.appendChild(createBookmarkRow(bm, query));
  bookmarksList.appendChild(fragment);
}

function updateResultsCount() {
  const total = allBookmarks.length;
  const shown = bookmarksList.children.length;
  if (currentQuery.trim() || activeTagFilter) {
    resultsCount.textContent = `${shown} z ${total} zakładek`;
  } else {
    resultsCount.textContent = total === 0 ? '' : `${total} zakładek`;
  }
}

// --- Row ---

function createBookmarkRow(bm, query) {
  const li = document.createElement('li');
  li.className = 'bookmark-row';
  li.dataset.id = bm.id;

  if (settings.favicons) {
    const host = urlHostname(bm.url);
    const img = document.createElement('img');
    img.className = 'bookmark-favicon';
    img.src = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : '';
    img.width = 14; img.height = 14; img.alt = '';
    img.onerror = () => { img.style.display = 'none'; };
    li.appendChild(img);
  }

  const a = document.createElement('a');
  a.className = 'bookmark-link';
  a.href = bm.url;
  a.title = bm.url;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    openBookmark(bm);
  });

  const titleEl = document.createElement('span');
  titleEl.className = 'bookmark-title';
  titleEl.innerHTML = highlight(bm.title, query);

  const urlEl = document.createElement('span');
  urlEl.className = 'bookmark-url';
  urlEl.innerHTML = highlight(bm.url, query);

  a.appendChild(titleEl);
  a.appendChild(urlEl);

  const openCount = bookmarkStats[bm.id]?.count || 0;
  if (openCount > 0) {
    const countEl = document.createElement('span');
    countEl.className = 'open-count';
    countEl.textContent = `↗ ${openCount}`;
    countEl.title = `Otwarto ${openCount} ${openCount === 1 ? 'raz' : 'razy'}`;
    a.appendChild(countEl);
  }

  if (bm.parseError) {
    const errBadge = document.createElement('button');
    errBadge.className = 'parse-error-badge';
    errBadge.title = bm.parseError;
    errBadge.innerHTML = svgWarn() + '<span>Błąd etykiet</span>';
    errBadge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTagsErrorPage(bm);
    });
    a.appendChild(errBadge);
  } else if (bm.tags.length > 0) {
    a.appendChild(buildTagChips(bm));
  }

  // Copy — always visible
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.title = 'Kopiuj link';
  copyBtn.innerHTML = svgCopy();
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyLink(bm.url, copyBtn);
  });

  // Hidden actions
  const actions = document.createElement('div');
  actions.className = 'bookmark-actions';

  const similarBtn = document.createElement('button');
  similarBtn.className = 'action-btn' + (activeSimilarTo?.id === bm.id ? ' action-btn--active' : '');
  similarBtn.title = 'Pokaż podobne';
  similarBtn.innerHTML = svgSimilar();
  similarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeSimilarTo?.id === bm.id) {
      activeSimilarTo = null;
      similarFilterBar.hidden = true;
    } else {
      activeSimilarTo = bm;
      activeTagFilter = null;
      tagFilterBar.hidden = true;
      similarFilterLabel.textContent = bm.title;
      similarFilterBar.hidden = false;
    }
    renderBookmarks(filterBookmarks(currentQuery), currentQuery);
  });

  const labelBtn = document.createElement('button');
  labelBtn.className = 'action-btn';
  labelBtn.title = 'Etykiety';
  labelBtn.innerHTML = svgLabel();
  labelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTagEditor(bm, li, labelBtn);
  });

  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn';
  editBtn.title = 'Edytuj';
  editBtn.innerHTML = svgEdit();
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEdit(bm, li);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'action-btn action-btn--danger';
  deleteBtn.title = 'Usuń';
  deleteBtn.innerHTML = svgTrash();
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteBookmark(bm.id, li);
  });

  if (settings.aiEnabled) {
    const aiBtn = document.createElement('button');
    aiBtn.className = 'action-btn';
    aiBtn.title = 'Sugestie etykiet AI';
    aiBtn.innerHTML = svgAI();
    aiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runAISuggest(bm, li, aiBtn, (updated) => refreshRowTags(updated, li));
    });
    actions.appendChild(aiBtn);
  }

  actions.appendChild(similarBtn);
  actions.appendChild(labelBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  li.appendChild(a);
  li.appendChild(copyBtn);
  li.appendChild(actions);
  return li;
}

// --- Tag chips ---

function buildTagChips(bm) {
  const container = document.createElement('div');
  container.className = 'row-tags';
  for (const tag of bm.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (tag === activeTagFilter ? ' tag-chip--active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeTagFilter = tag;
      tagFilterLabel.textContent = tag;
      tagFilterBar.hidden = false;
      renderBookmarks(filterBookmarks(currentQuery), currentQuery);
    });
    container.appendChild(chip);
  }
  return container;
}

function refreshRowTags(bm, li) {
  const a = li.querySelector('.bookmark-link');
  const existing = a.querySelector('.row-tags');
  if (existing) existing.remove();
  if (bm.tags.length > 0) a.appendChild(buildTagChips(bm));
}

// --- Tag editor ---

function toggleTagEditor(bm, li, btn) {
  const existing = li.querySelector('.tag-editor');
  if (existing) {
    existing.remove();
    btn.classList.remove('action-btn--active');
    return;
  }

  btn.classList.add('action-btn--active');

  const editor = document.createElement('div');
  editor.className = 'tag-editor';

  const chipsRow = document.createElement('div');
  chipsRow.className = 'tag-editor-chips';

  function renderEditorChips() {
    chipsRow.innerHTML = '';
    chipsRow.hidden = bm.tags.length === 0;
    for (const tag of bm.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip tag-chip--removable';
      chip.textContent = tag;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'tag-chip-remove';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Usuń etykietę';
      removeBtn.addEventListener('click', () => {
        const rawTitleBefore = bm.rawTitle;
        bm.tags = bm.tags.filter((t) => t !== tag);
        bm.rawTitle = buildRawTitle(bm.title, bm.tags);
        bookmarksApi.update(bm.id, { title: bm.rawTitle }).catch((err) => showToast(`Błąd: ${err.message}`, 'err'));
        historyPush({ type: 'tag_remove', id: bm.id, title: bm.title, tag, rawTitleBefore, url: bm.url, ts: Date.now() });
        renderEditorChips();
        refreshRowTags(bm, li);
        if (activeTagFilter === tag) {
          activeTagFilter = null;
          tagFilterBar.hidden = true;
          renderBookmarks(filterBookmarks(currentQuery), currentQuery);
        }
      });

      chip.appendChild(removeBtn);
      chipsRow.appendChild(chip);
    }
  }

  renderEditorChips();

  const inputRow = document.createElement('div');
  inputRow.className = 'tag-input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = 'Nowa etykieta…';
  input.maxLength = 32;

  function addTag() {
    const tag = input.value.trim();
    if (!tag || bm.tags.includes(tag)) { input.value = ''; return; }
    const rawTitleBefore = bm.rawTitle;
    bm.tags = [...bm.tags, tag];
    bm.rawTitle = buildRawTitle(bm.title, bm.tags);
    bookmarksApi.update(bm.id, { title: bm.rawTitle }).catch((err) => showToast(`Błąd: ${err.message}`, 'err'));
    historyPush({ type: 'tag_add', id: bm.id, title: bm.title, tag, rawTitleBefore, url: bm.url, ts: Date.now() });
    renderEditorChips();
    refreshRowTags(bm, li);
    input.value = '';
    input.focus();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    if (e.key === 'Escape') { editor.remove(); btn.classList.remove('action-btn--active'); }
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'tag-add-btn';
  addBtn.textContent = '+';
  addBtn.title = 'Dodaj etykietę';
  addBtn.addEventListener('click', addTag);

  inputRow.appendChild(input);
  inputRow.appendChild(addBtn);
  editor.appendChild(chipsRow);
  editor.appendChild(inputRow);
  li.appendChild(editor);

  input.focus();
}

// --- Inline edit ---

function startEdit(bm, li) {
  li.innerHTML = '';
  li.classList.add('bookmark-row--editing');

  const form = document.createElement('form');
  form.className = 'edit-form';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'edit-input';
  titleInput.value = bm.title;   // display title without tags
  titleInput.placeholder = 'Tytuł';
  titleInput.required = true;

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'edit-input';
  urlInput.value = bm.url;
  urlInput.placeholder = 'URL';
  urlInput.required = true;

  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.className = 'edit-input';
  tagsInput.value = bm.tags.join(', ');
  tagsInput.placeholder = 'Etykiety (oddzielone przecinkami)';

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'edit-save';
  saveBtn.textContent = 'Zapisz';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'edit-cancel';
  cancelBtn.textContent = 'Anuluj';

  cancelBtn.addEventListener('click', () => {
    li.classList.remove('bookmark-row--editing');
    li.replaceWith(createBookmarkRow(bm, currentQuery));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTitle = titleInput.value.trim();
    const newUrl = urlInput.value.trim();
    if (!newTitle || !newUrl) return;
    const newTags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);

    const snapshot = { type: 'edit', id: bm.id, title: bm.title, rawTitleBefore: bm.rawTitle, urlBefore: bm.url, ts: Date.now() };
    const newRaw = buildRawTitle(newTitle, newTags);
    try {
      await bookmarksApi.update(bm.id, { title: newRaw, url: newUrl });
      historyPush(snapshot);
      bm.title = newTitle;
      bm.url = newUrl;
      bm.tags = newTags;
      bm.rawTitle = newRaw;
      li.classList.remove('bookmark-row--editing');
      li.replaceWith(createBookmarkRow(bm, currentQuery));
      updateResultsCount();
      showToast(`Zapisano „${newTitle}"`, 'ok', async () => {
        await undoHistoryEntry(snapshot, async () => {
          const tree = await bookmarksApi.getTree();
          allBookmarks = flattenBookmarks(tree);
          renderBookmarks(filterBookmarks(currentQuery), currentQuery);
          showToast('Cofnięto edycję', 'ok');
        });
      });
    } catch (err) {
      showToast(`Błąd zapisu: ${err.message}`, 'err');
    }
  });

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  form.appendChild(titleInput);
  form.appendChild(urlInput);
  form.appendChild(tagsInput);
  form.appendChild(btnRow);
  li.appendChild(form);

  titleInput.focus();
  titleInput.select();
}

// --- Delete modal ---

let pendingDelete = null;

modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
// --- Keyboard navigation ---

let highlightedIndex = -1;

function getRows() {
  return [...bookmarksList.querySelectorAll('.bookmark-row:not([hidden])')];
}

function setHighlight(index) {
  const rows = getRows();
  rows.forEach((r) => r.classList.remove('highlighted'));
  highlightedIndex = Math.max(-1, Math.min(index, rows.length - 1));
  if (highlightedIndex >= 0) {
    rows[highlightedIndex].classList.add('highlighted');
    rows[highlightedIndex].scrollIntoView({ block: 'nearest' });
  }
}

searchInput.addEventListener('keydown', (e) => {
  if (bookmarksList.hidden) return;
  const count = getRows().length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setHighlight(highlightedIndex >= count - 1 ? 0 : highlightedIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setHighlight(highlightedIndex <= 0 ? count - 1 : highlightedIndex - 1);
  } else if (e.key === 'Enter' && highlightedIndex >= 0) {
    e.preventDefault();
    const rows = getRows();
    const id = rows[highlightedIndex]?.dataset.id;
    const bm = allBookmarks.find((b) => b.id === id);
    if (bm) openBookmark(bm);
  } else if (e.key === 'Escape') {
    if (highlightedIndex >= 0) { setHighlight(-1); return; }
  }
});

// Reset highlight on new search results
searchInput.addEventListener('input', () => { highlightedIndex = -1; });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
});

modalConfirm.addEventListener('click', async () => {
  if (!pendingDelete) return;
  const { id, li } = pendingDelete;
  const bm = allBookmarks.find((b) => b.id === id);
  const snapshot = bm
    ? { type: 'delete', title: bm.title, rawTitle: bm.rawTitle, url: bm.url, ts: Date.now() }
    : null;
  closeModal();
  try {
    await bookmarksApi.remove(id);
    if (snapshot) historyPush(snapshot);
    allBookmarks = allBookmarks.filter((b) => b.id !== id);
    li.remove();
    updateResultsCount();
    if (bookmarksList.children.length === 0) {
      bookmarksList.hidden = true;
      emptyState.hidden = false;
      emptyMessage.textContent = currentQuery.trim()
        ? `Brak wyników dla „${currentQuery}"`
        : 'Brak zakładek';
    }
    if (snapshot) {
      showToast(`Usunięto „${snapshot.title}"`, 'ok', async () => {
        await undoHistoryEntry(snapshot, async () => {
          const tree = await bookmarksApi.getTree();
          allBookmarks = flattenBookmarks(tree);
          renderBookmarks(filterBookmarks(currentQuery), currentQuery);
          checkDuplicates();
          showToast('Cofnięto usunięcie', 'ok');
        });
      });
    }
  } catch (err) {
    showToast(`Błąd usuwania: ${err.message}`, 'err');
  }
});

function deleteBookmark(id, li) {
  const bm = allBookmarks.find((b) => b.id === id);
  modalDesc.textContent = bm ? bm.title : '';
  pendingDelete = { id, li };
  modalOverlay.hidden = false;
  modalConfirm.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  pendingDelete = null;
}

// --- Open bookmark ---

function openBookmark(bm) {
  const url = bm.url;
  if (!isAllowedProtocol(url)) {
    openErrorPage(url);
    return;
  }
  BookmarkStats.increment(bm.id);
  const prev = bookmarkStats[bm.id];
  bookmarkStats[bm.id] = { count: (prev?.count || 0) + 1, lastOpened: Date.now() };
  chrome.tabs.create({ url });
}

function openErrorPage(badUrl) {
  const base = chrome.runtime.getURL('error.html');
  chrome.tabs.create({ url: `${base}?type=url&value=${encodeURIComponent(badUrl)}` });
}

function openTagsErrorPage(bm) {
  const base = chrome.runtime.getURL('error.html');
  const params = new URLSearchParams({
    type: 'tags',
    value: bm.rawTitle,
    reason: bm.parseError,
    id: bm.id,
  });
  chrome.tabs.create({ url: `${base}?${params}` });
}

// --- Copy ---

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = svgCheck();
    btn.classList.add('copy-btn--copied');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('copy-btn--copied');
    }, 1500);
  });
}

// --- AI tag suggestions ---

async function suggestTagsAI(bm) {
  if (!settings.openaiKey) {
    showToast('Ustaw klucz OpenAI w widoku pełnym (Ustawienia)', 'warn');
    return null;
  }
  const prompt =
    `Zaproponuj 2-5 krótkich etykiet (1-2 słowa każda) dla tej zakładki.\n` +
    `Tytuł: ${bm.title}\nURL: ${bm.url}\n` +
    (bm.tags.length ? `Istniejące etykiety: ${bm.tags.join(', ')}\n` : '') +
    `Odpowiedź: tylko lista etykiet rozdzielona przecinkami, bez dodatkowego tekstu.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openaiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 60, temperature: 0.3 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content
    .trim().split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter((t) => t && !bm.tags.includes(t));
}

function showAISuggestPanel(bm, li, onTagAdded) {
  li.querySelector('.ai-suggest-panel')?.remove();

  const panel = document.createElement('div');
  panel.className = 'ai-suggest-panel';

  const label = document.createElement('span');
  label.className = 'ai-suggest-label';
  label.textContent = 'AI:';
  panel.appendChild(label);

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'ai-suggest-chips';

  function addChip(tag) {
    const chip = document.createElement('button');
    chip.className = 'ai-chip';
    chip.textContent = `+ ${tag}`;
    chip.addEventListener('click', () => {
      if (bm.tags.includes(tag)) { chip.remove(); return; }
      const rawTitleBefore = bm.rawTitle;
      bm.tags = [...bm.tags, tag];
      bm.rawTitle = buildRawTitle(bm.title, bm.tags);
      bookmarksApi.update(bm.id, { title: bm.rawTitle }).catch((err) => showToast(`Błąd: ${err.message}`, 'err'));
      historyPush({ type: 'tag_add', id: bm.id, title: bm.title, tag, rawTitleBefore, url: bm.url, ts: Date.now() });
      chip.remove();
      onTagAdded(bm);
      if (!chipsWrap.children.length) panel.remove();
    });
    chipsWrap.appendChild(chip);
  }

  panel.appendChild(chipsWrap);

  const dismiss = document.createElement('button');
  dismiss.className = 'ai-suggest-dismiss';
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', () => panel.remove());
  panel.appendChild(dismiss);

  li.appendChild(panel);
  return { addChip };
}

async function runAISuggest(bm, li, aiBtn, onTagAdded) {
  aiBtn.disabled = true;
  aiBtn.classList.add('action-btn--loading');
  try {
    const tags = await suggestTagsAI(bm);
    if (!tags || tags.length === 0) { showToast('Brak nowych sugestii', 'warn'); return; }
    const { addChip } = showAISuggestPanel(bm, li, onTagAdded);
    tags.forEach(addChip);
  } catch (err) {
    showToast(`Błąd AI: ${err.message}`, 'err');
  } finally {
    aiBtn.disabled = false;
    aiBtn.classList.remove('action-btn--loading');
  }
}

// --- Export ---

function exportBookmarks() {
  const rows = [['title', 'url', 'tags']];
  for (const bm of allBookmarks) {
    rows.push([bm.title, bm.url, bm.tags.join(';')]);
  }
  const csv = rows.map(csvRow).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks-${dateStamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Wyeksportowano ${allBookmarks.length} zakładek`, 'ok');
}

// --- Import ---

async function importBookmarks(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    showToast('Nie można odczytać pliku', 'err');
    return;
  }

  const rows = parseCsv(text);
  if (rows.length < 2) {
    showToast('Plik jest pusty lub ma nieprawidłowy format', 'warn');
    return;
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const titleIdx = header.indexOf('title');
  const urlIdx   = header.indexOf('url');
  const tagsIdx  = header.indexOf('tags');

  if (titleIdx === -1 || urlIdx === -1) {
    showToast('Brak kolumn "title" lub "url" w nagłówku', 'err');
    return;
  }

  const dataRows = rows.slice(1).filter((r) => r[urlIdx]?.trim());
  let added = 0, skipped = 0;

  for (const row of dataRows) {
    const url   = row[urlIdx]?.trim();
    const title = row[titleIdx]?.trim() || url;
    const tags  = tagsIdx !== -1
      ? (row[tagsIdx] || '').split(';').map((t) => t.trim()).filter(Boolean)
      : [];

    // Skip duplicates already in allBookmarks
    if (allBookmarks.some((b) => b.url === url)) { skipped++; continue; }

    const rawTitle = buildRawTitle(title, tags);
    try {
      await bookmarksApi.create({ title: rawTitle, url });
      added++;
    } catch {
      skipped++;
    }
  }

  // Reload list
  try {
    const tree = await bookmarksApi.getTree();
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(filterBookmarks(currentQuery), currentQuery);
  } catch (err) {
    showToast(`Błąd odświeżania: ${err.message}`, 'err');
  }

  if (added === 0) {
    showToast(`Nic nie dodano — ${skipped} pominiętych (duplikaty)`, 'warn');
  } else {
    const msg = skipped > 0
      ? `Dodano ${added}, pominięto ${skipped} (duplikaty)`
      : `Zaimportowano ${added} zakładek`;
    showToast(msg, 'ok');
  }
}

// --- Toast ---

let toastTimer;
function showToast(msg, type = 'ok', undoFn = null) {
  toastEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  toastEl.appendChild(span);
  if (undoFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo-btn';
    btn.textContent = 'Cofnij';
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      toastEl.hidden = true;
      undoFn();
    });
    toastEl.appendChild(btn);
  }
  toastEl.className = `toast toast--${type}`;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, undoFn ? 6000 : 3500);
}

