// TODO (future iterations):
//   - Find similar bookmarks (by domain, keywords)
//   - AI-powered automatic categorization

// Tags are stored directly in the bookmark title using the format:
//   "Display Title | tag1, tag2, tag3"
// No external storage needed — tags travel with the bookmark.

'use strict';

let allBookmarks = [];   // [{ id, rawTitle, title, url, tags[] }]
let currentQuery = '';
let activeTagFilter = null;
let activeSimilarTo = null;  // bm object | null
let currentSort = 'popular';
let bookmarkStats = {};  // { [id]: { count, lastOpened } }
let showOnlyStale = false;
const STALE_MS        = 30 * 24 * 60 * 60 * 1000;
const INSTALLED_AT_KEY = 'bm_installed_at';
let   pluginInstalledAt = Date.now();

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

const HISTORY_KEY = 'bm_history';
const HISTORY_MAX = 30;

function historyPush(entry) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(HISTORY_KEY, (data) => {
    const list = data[HISTORY_KEY] || [];
    list.unshift({ ...entry, ts: Date.now() });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    chrome.storage.local.set({ [HISTORY_KEY]: list });
  });
}

function historyRemoveByTs(ts) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(HISTORY_KEY, (data) => {
    const list = (data[HISTORY_KEY] || []).filter((e) => e.ts !== ts);
    chrome.storage.local.set({ [HISTORY_KEY]: list });
  });
}

function undoHistoryEntry(entry, onDone) {
  if (entry.type === 'delete') {
    chrome.bookmarks.create({ title: entry.rawTitle, url: entry.url }, () => {
      historyRemoveByTs(entry.ts);
      onDone?.();
    });
  } else if (entry.type === 'edit' || entry.type === 'tag_add' || entry.type === 'tag_remove') {
    chrome.bookmarks.update(entry.id, { title: entry.rawTitleBefore, url: entry.urlBefore ?? entry.url }, () => {
      historyRemoveByTs(entry.ts);
      onDone?.();
    });
  }
}

// --- Bootstrap ---
function initBookmarks() {
  chrome.bookmarks.getTree((tree) => {
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(filterBookmarks(''), '');
    checkDuplicates();
    checkStale();
  });
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

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = addTitleInput.value.trim();
  const url   = addUrlInput.value.trim();
  const tags  = addTagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
  if (!title || !url) return;

  const rawTitle = buildRawTitle(title, tags);
  chrome.bookmarks.create({ title: rawTitle, url }, () => {
    closeAddPanel();
    chrome.bookmarks.getTree((tree) => {
      allBookmarks = flattenBookmarks(tree);
      renderBookmarks(filterBookmarks(currentQuery), currentQuery);
      checkDuplicates();
    });
    showToast(`Dodano „${title}"`, 'ok');
  });
});

if (chrome.storage?.local) {
  chrome.storage.local.get(['bm_settings', BookmarkStats.KEY, 'bm_pending_add', INSTALLED_AT_KEY], (data) => {
    settings = { favicons: false, aiEnabled: false, openaiKey: '', ...(data.bm_settings || {}) };
    bookmarkStats = data[BookmarkStats.KEY] || {};
    if (data[INSTALLED_AT_KEY]) {
      pluginInstalledAt = data[INSTALLED_AT_KEY];
    } else {
      pluginInstalledAt = Date.now();
      chrome.storage.local.set({ [INSTALLED_AT_KEY]: pluginInstalledAt });
    }
    initBookmarks();
    if (data.bm_pending_add) {
      const { title, url } = data.bm_pending_add;
      chrome.storage.local.remove('bm_pending_add');
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
  }, 300);
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
  const groups = findDuplicateGroups();
  const count  = groups.reduce((s, g) => s + g.length, 0);
  if (count > 0) {
    dupBarText.textContent = `${count} zakładek to duplikaty`;
    dupBar.hidden = false;
  }
}

function isStale(bm) {
  const stat = bookmarkStats[bm.id];
  const refDate = stat?.lastOpened
    ?? Math.max(bm.dateAdded || 0, pluginInstalledAt);
  return Date.now() - refDate > STALE_MS;
}

function checkStale() {
  const count = allBookmarks.filter(isStale).length;
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

const TRACKING_P = new Set([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
  'fbclid','gclid','gclsrc','dclid','msclkid','twclid','mc_cid','mc_eid','mkt_tok',
]);

function normalizeUrl(url) {
  try {
    const u = new URL(url.toLowerCase());
    u.hostname = u.hostname.replace(/^www\./, '');
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_P.has(k) || k.startsWith('utm_')) u.searchParams.delete(k);
    }
    u.searchParams.sort();
    return u.toString();
  } catch { return url.toLowerCase(); }
}

function findDuplicateGroups() {
  const groups = new Map();
  for (const bm of allBookmarks) {
    const key = normalizeUrl(bm.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bm);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

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

/**
 * Parse "Display Title | tag1, tag2" into { title, tags, parseError }.
 * parseError is a human-readable string when the tag section is malformed,
 * or null when everything is fine (including no tags at all).
 *
 * Rules that produce a parseError:
 *   - " | " present but nothing (or only whitespace) follows it
 *   - any individual tag is empty after trimming (e.g. "Title | , tag2")
 *   - any tag contains a pipe character (nested separators)
 */
function parseTitle(raw) {
  const sep = raw.indexOf(' | ');
  if (sep === -1) return { title: raw, tags: [], parseError: null };

  const title = raw.slice(0, sep).trim();
  const rawTagSection = raw.slice(sep + 3);

  if (!rawTagSection.trim()) {
    return {
      title,
      tags: [],
      parseError: `Sekcja etykiet jest pusta — usuń " | " lub dodaj etykietę`,
    };
  }

  const parts = rawTagSection.split(',');
  const emptyParts = parts.filter((t) => !t.trim());
  if (emptyParts.length > 0) {
    return {
      title,
      tags: parts.map((t) => t.trim()).filter(Boolean),
      parseError: `Pusta etykieta w "${rawTagSection.trim()}" — usuń nadmiarowe przecinki`,
    };
  }

  const tags = parts.map((t) => t.trim());
  const withPipe = tags.filter((t) => t.includes('|'));
  if (withPipe.length > 0) {
    return {
      title,
      tags,
      parseError: `Etykieta nie może zawierać "|": ${withPipe.map((t) => `"${t}"`).join(', ')}`,
    };
  }

  return { title, tags, parseError: null };
}

/** Rebuild raw title from display title + tags array. */
function buildRawTitle(title, tags) {
  return tags.length > 0 ? `${title} | ${tags.join(', ')}` : title;
}

// --- Bookmarks ---

function flattenBookmarks(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.url) {
      const raw = node.title || node.url;
      const { title, tags, parseError } = parseTitle(raw);
      result.push({ id: node.id, rawTitle: raw, title, url: node.url, tags, parseError, dateAdded: node.dateAdded || 0 });
    }
    if (node.children) result.push(...flattenBookmarks(node.children));
  }
  return result;
}

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
    list = list.filter(isStale);
  } else if (showOnlyDuplicates) {
    const dupIds = new Set(findDuplicateGroups().flat().map((b) => b.id));
    list = list.filter((bm) => dupIds.has(bm.id));
  } else if (activeSimilarTo) {
    const ids = new Set(findSimilar(activeSimilarTo).map((b) => b.id));
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
        chrome.bookmarks.update(bm.id, { title: bm.rawTitle });
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
    chrome.bookmarks.update(bm.id, { title: bm.rawTitle });
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newTitle = titleInput.value.trim();
    const newUrl = urlInput.value.trim();
    if (!newTitle || !newUrl) return;
    const newTags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);

    const snapshot = { type: 'edit', id: bm.id, title: bm.title, rawTitleBefore: bm.rawTitle, urlBefore: bm.url, ts: Date.now() };
    const newRaw = buildRawTitle(newTitle, newTags);
    chrome.bookmarks.update(bm.id, { title: newRaw, url: newUrl }, () => {
      historyPush(snapshot);
      bm.title = newTitle;
      bm.url = newUrl;
      bm.tags = newTags;
      bm.rawTitle = newRaw;
      li.classList.remove('bookmark-row--editing');
      li.replaceWith(createBookmarkRow(bm, currentQuery));
      updateResultsCount();
      showToast(`Zapisano „${newTitle}"`, 'ok', () => {
        undoHistoryEntry(snapshot, () => {
          chrome.bookmarks.getTree((tree) => {
            allBookmarks = flattenBookmarks(tree);
            renderBookmarks(filterBookmarks(currentQuery), currentQuery);
            showToast('Cofnięto edycję', 'ok');
          });
        });
      });
    });
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
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setHighlight(highlightedIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (highlightedIndex <= 0) { setHighlight(-1); return; }
    setHighlight(highlightedIndex - 1);
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

modalConfirm.addEventListener('click', () => {
  if (!pendingDelete) return;
  const { id, li } = pendingDelete;
  const bm = allBookmarks.find((b) => b.id === id);
  const snapshot = bm
    ? { type: 'delete', title: bm.title, rawTitle: bm.rawTitle, url: bm.url, ts: Date.now() }
    : null;
  chrome.bookmarks.remove(id, () => {
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
      showToast(`Usunięto „${snapshot.title}"`, 'ok', () => {
        undoHistoryEntry(snapshot, () => {
          chrome.bookmarks.getTree((tree) => {
            allBookmarks = flattenBookmarks(tree);
            renderBookmarks(filterBookmarks(currentQuery), currentQuery);
            checkDuplicates();
            showToast('Cofnięto usunięcie', 'ok');
          });
        });
      });
    }
  });
  closeModal();
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

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];

function openBookmark(bm) {
  const url = bm.url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    openErrorPage(url);
    return;
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
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

// --- Highlight & escape ---

function highlight(text, query) {
  const escaped = escapeHtml(text);
  if (!query.trim()) return escaped;
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(escapeRegex(escapedQuery), 'gi');
  return escaped.replace(regex, '<mark>$&</mark>');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- SVG icons ---

function svgEdit() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`;
}

function svgTrash() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6h12M8 6V4h4v2M7 6v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgCopy() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
    <path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

function svgCheck() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 10l5 5 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// --- Similarity ---

function findSimilar(bm) {
  const host  = urlHostname(bm.url);
  const words = sigWords(bm.title);
  return allBookmarks.filter((other) => {
    if (other.id === bm.id) return false;
    if (host && urlHostname(other.url) === host) return true;
    return sigWords(other.title).filter((w) => words.includes(w)).length >= 2;
  });
}

function urlHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

function sigWords(title) {
  return [...new Set(title.toLowerCase().split(/[\s\-_/.,]+/).filter((w) => w.length >= 4))];
}

function svgSimilar() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="15" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="15" cy="15" r="2.5" stroke="currentColor" stroke-width="1.4"/>
    <path d="M7.5 10h2M9.5 10l3-4M9.5 10l3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`;
}

function svgWarn() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 7v4M10 13h.01M8.57 2.9L1.52 15a1.67 1.67 0 0 0 1.43 2.5h14.1A1.67 1.67 0 0 0 18.48 15L11.43 2.9a1.67 1.67 0 0 0-2.86 0z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgLabel() {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 10L10 3h7v7l-7 7-7-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="13.5" cy="6.5" r="1" fill="currentColor"/>
  </svg>`;
}

function svgAI() {
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 15l-1.5-4.5L4 8l4.5-1.5L10 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M16 2l.8 2L19 5l-2.2.8L16 8l-.8-2.2L13 5l2.2-.8L16 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
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
      chrome.bookmarks.update(bm.id, { title: bm.rawTitle });
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
      await new Promise((resolve, reject) =>
        chrome.bookmarks.create({ title: rawTitle, url }, (bm) =>
          chrome.runtime.lastError ? reject() : resolve(bm)
        )
      );
      added++;
    } catch {
      skipped++;
    }
  }

  // Reload list
  chrome.bookmarks.getTree((tree) => {
    allBookmarks = flattenBookmarks(tree);
    renderBookmarks(filterBookmarks(currentQuery), currentQuery);
  });

  if (added === 0) {
    showToast(`Nic nie dodano — ${skipped} pominiętych (duplikaty)`, 'warn');
  } else {
    const msg = skipped > 0
      ? `Dodano ${added}, pominięto ${skipped} (duplikaty)`
      : `Zaimportowano ${added} zakładek`;
    showToast(msg, 'ok');
  }
}

// --- CSV helpers ---

/** Encode a single CSV row (RFC 4180). */
function csvRow(fields) {
  return fields.map((f) => {
    const s = String(f ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

/**
 * Parse CSV text into a 2-D array of strings (RFC 4180, UTF-8 with optional BOM).
 * Handles quoted fields, embedded commas, newlines and doubled-quote escapes.
 */
function parseCsv(text) {
  // Strip BOM if present
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((f) => f !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    i++;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
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

// --- Date stamp for filename ---
function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
