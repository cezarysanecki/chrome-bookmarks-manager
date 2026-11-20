import { STORAGE_KEYS, HISTORY_MAX, DEBOUNCE_MS } from './src/config.js';
import { normalizeUrl, urlHostname, isAllowedProtocol } from './src/lib/url.js';
import { escapeHtml, highlight } from './src/lib/dom.js';
import { csvRow, parseCsv, dateStamp } from './src/lib/csv.js';
import { buildRawTitle, flattenBookmarks, flattenFolders } from './src/bookmarks/parse.js';
import { findBookmarkByUrl, findDuplicateGroups } from './src/bookmarks/duplicates.js';
import { mergeTags } from './src/bookmarks/tags.js';
import { svgEdit, svgTrash, svgCopy, svgCheck, svgWarn, svgLabel } from './src/ui/icons.js';
import { bookmarksApi } from './src/bookmarks/api.js';

let allBookmarks = [];   // [{ id, rawTitle, title, url, tags[], parseError }]
let currentQuery    = '';
let activeTag       = null;
let groupMode       = false;
let currentSort     = 'default';
let duplicatesMode  = false;
let settings        = { favicons: false };
let folders         = [];
let selectedIds     = new Set();
let keyboardBookmarkId = null;

// --- DOM ---
const searchEl       = document.getElementById('search');
const clearSearchEl  = document.getElementById('clear-search');
const tagListEl      = document.getElementById('tag-list');
const containerEl    = document.getElementById('bookmarks-container');
const resultsCountEl = document.getElementById('results-count');
const activeFilterEl  = document.getElementById('active-filter');
const filterPrefixEl  = document.getElementById('active-filter-prefix');
const filterLabelEl   = document.getElementById('active-filter-label');
const filterClearEl   = document.getElementById('active-filter-clear');
const btnGroup       = document.getElementById('btn-group');
const modalOverlay   = document.getElementById('modal-overlay');
const modalDesc      = document.getElementById('modal-desc');
const modalCancel    = document.getElementById('modal-cancel');
const modalConfirm   = document.getElementById('modal-confirm');
const toastEl        = document.getElementById('toast');
const importFileEl   = document.getElementById('import-file');
const bulkSelectAllEl = document.getElementById('bulk-select-all');
const bulkCountEl     = document.getElementById('bulk-count');
const bulkActionsEl   = document.getElementById('bulk-actions');
const bulkTagEl       = document.getElementById('bulk-tag');
const bulkFolderEl    = document.getElementById('bulk-folder');

// --- History (chrome.storage.local) ---

function historyPush(entry) {
  historyPushMany([entry]);
}

function historyPushMany(entries) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(STORAGE_KEYS.HISTORY, (data) => {
    const list = data[STORAGE_KEYS.HISTORY] || [];
    const now = Date.now();
    list.unshift(...entries.map((entry, index) => ({ ...entry, ts: entry.ts ?? now + index })));
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: list }, renderHistory);
  });
}

function historyRemoveByTs(ts) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(STORAGE_KEYS.HISTORY, (data) => {
    const list = (data[STORAGE_KEYS.HISTORY] || []).filter((e) => e.ts !== ts);
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: list }, renderHistory);
  });
}

async function undoHistoryEntry(entry, onDone) {
  try {
    if (entry.type === 'delete') {
      const details = { title: entry.rawTitle, url: entry.url };
      if (entry.parentId) details.parentId = entry.parentId;
      if (Number.isInteger(entry.index)) details.index = entry.index;
      await bookmarksApi.create(details);
    } else if (entry.type === 'edit' || entry.type === 'tag_add' || entry.type === 'tag_remove') {
      await bookmarksApi.update(entry.id, { title: entry.rawTitleBefore, url: entry.urlBefore ?? entry.url });
    } else if (entry.type === 'move') {
      await bookmarksApi.move(entry.id, { parentId: entry.parentIdBefore, index: entry.indexBefore });
    }
    historyRemoveByTs(entry.ts);
    onDone?.();
  } catch (err) {
    showToast(`Błąd cofania: ${err.message}`, 'err');
  }
}

function historyLabel(entry) {
  const t = entry.title || '';
  switch (entry.type) {
    case 'delete':     return `Usunięto: ${t}`;
    case 'edit':       return `Edytowano: ${t}`;
    case 'tag_add':    return `+etykieta „${entry.tag}" → ${t}`;
    case 'tag_remove': return `-etykieta „${entry.tag}" z ${t}`;
    case 'move':       return `Przeniesiono: ${t}`;
    default:           return entry.type;
  }
}

function renderHistory() {
  const historyListEl = document.getElementById('history-list');
  if (!historyListEl) return;
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(STORAGE_KEYS.HISTORY, (data) => {
    const entries = data[STORAGE_KEYS.HISTORY] || [];
    historyListEl.innerHTML = '';
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'Brak historii';
      historyListEl.appendChild(li);
      return;
    }
    for (const entry of entries.slice(0, 10)) {
      const li = document.createElement('li');
      li.className = 'history-item';

      const text = document.createElement('span');
      text.className = 'history-text';
      text.title = historyLabel(entry);
      text.textContent = historyLabel(entry);

      const undoBtn = document.createElement('button');
      undoBtn.className = 'history-undo-btn';
      undoBtn.title = 'Cofnij';
      undoBtn.textContent = '↩';
      undoBtn.addEventListener('click', async () => {
        await undoHistoryEntry(entry, async () => {
          try {
            const tree = await bookmarksApi.getTree();
            allBookmarks = flattenBookmarks(tree);
            folders = flattenFolders(tree);
            renderFolderOptions();
            renderSidebar();
            renderAll();
            showToast('Cofnięto', 'ok');
          } catch (err) {
            showToast(`Błąd odświeżania: ${err.message}`, 'err');
          }
        });
      });

      li.appendChild(text);
      li.appendChild(undoBtn);
      historyListEl.appendChild(li);
    }
  });
}

function saveSettings() {
  if (chrome.storage?.local) chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

// --- Init ---
function applySettings(s) {
  settings = { favicons: false, ...s };
  document.getElementById('setting-favicons').checked = settings.favicons;
}

async function initBookmarks() {
  try {
    const tree = await bookmarksApi.getTree();
    allBookmarks = flattenBookmarks(tree);
    folders = flattenFolders(tree);
    selectedIds = new Set([...selectedIds].filter((id) => allBookmarks.some((bookmark) => bookmark.id === id)));
    renderFolderOptions();
    renderSidebar();
    renderAll();
    renderHistory();
  } catch (err) {
    showToast(`Błąd ładowania zakładek: ${err.message}`, 'err');
  }
}

if (chrome.storage?.local) {
  chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.VIEW_PREFS], (data) => {
    applySettings(data[STORAGE_KEYS.SETTINGS] || {});
    const prefs = data[STORAGE_KEYS.VIEW_PREFS] || {};
    if (prefs.groupMode) { groupMode = true; btnGroup.classList.add('toggle-btn--active'); }
    if (['default', 'az', 'za', 'domain'].includes(prefs.sort)) {
      currentSort = prefs.sort;
      const sortEl = document.getElementById('sort-select');
      if (sortEl) sortEl.value = prefs.sort;
    }
    initBookmarks();
  });
} else {
  applySettings({});
  initBookmarks();
}

// --- Global keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
  if (e.key === '/' && !inInput) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
  if (e.key === 'Escape' && inInput && document.activeElement === searchEl) {
    searchEl.blur();
  }
  if (inInput || tag === 'SELECT' || !modalOverlay.hidden || !settingsOverlay.hidden) return;

  const rows = getNavigableRows();
  if (['j', 'J', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    moveKeyboardFocus(1, rows);
  } else if (['k', 'K', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    moveKeyboardFocus(-1, rows);
  } else if (e.key === 'Enter') {
    const bookmark = getKeyboardBookmark();
    if (bookmark) { e.preventDefault(); openBookmark(bookmark); }
  } else if (['x', 'X', ' '].includes(e.key)) {
    const bookmark = getKeyboardBookmark();
    if (bookmark) { e.preventDefault(); toggleSelection(bookmark.id); }
  } else if (['e', 'E'].includes(e.key)) {
    const row = getKeyboardRow();
    const bookmark = getKeyboardBookmark();
    if (row && bookmark) { e.preventDefault(); startEdit(bookmark, row); }
  } else if (['t', 'T'].includes(e.key)) {
    const row = getKeyboardRow();
    const bookmark = getKeyboardBookmark();
    const button = row?.querySelector('.bm-action[title="Etykiety"]');
    if (row && bookmark && button) { e.preventDefault(); toggleTagEditor(bookmark, row, button); }
  } else if (['y', 'Y'].includes(e.key)) {
    const row = getKeyboardRow();
    const bookmark = getKeyboardBookmark();
    const button = row?.querySelector('.bm-copy');
    if (bookmark && button) { e.preventDefault(); copyLink(bookmark.url, button); }
  } else if (e.key === 'Delete') {
    const row = getKeyboardRow();
    const bookmark = getKeyboardBookmark();
    if (row && bookmark) { e.preventDefault(); confirmDelete(bookmark.id, row); }
  }
});

// --- Search ---
let debounce;
searchEl.addEventListener('input', () => {
  clearSearchEl.hidden = !searchEl.value;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    currentQuery = searchEl.value;
    renderAll();
  }, DEBOUNCE_MS);
});

clearSearchEl.addEventListener('click', () => {
  searchEl.value = '';
  clearSearchEl.hidden = true;
  currentQuery = '';
  renderAll();
});

// --- Tag filter clear ---
filterClearEl.addEventListener('click', () => {
  setTagFilter(null);
});

function saveViewPrefs() {
  if (chrome.storage?.local) {
    chrome.storage.local.set({ [STORAGE_KEYS.VIEW_PREFS]: { groupMode, sort: currentSort } });
  }
}

// --- Group toggle ---
btnGroup.addEventListener('click', () => {
  groupMode = !groupMode;
  btnGroup.classList.toggle('toggle-btn--active', groupMode);
  saveViewPrefs();
  renderAll();
});

// --- Settings modal ---
const settingsOverlay = document.getElementById('settings-overlay');

document.getElementById('btn-settings').addEventListener('click', () => {
  settingsOverlay.hidden = false;
});
document.getElementById('settings-close').addEventListener('click', () => {
  settingsOverlay.hidden = true;
});
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.hidden = true;
});

document.getElementById('setting-favicons').addEventListener('change', (e) => {
  settings.favicons = e.target.checked;
  saveSettings();
  renderAll();
});

// --- Sort ---
document.getElementById('sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  saveViewPrefs();
  renderAll();
});

// --- Export / Import ---
document.getElementById('btn-export').addEventListener('click', exportBookmarks);
document.getElementById('btn-import').addEventListener('click', () => importFileEl.click());
importFileEl.addEventListener('change', () => {
  if (importFileEl.files[0]) importBookmarks(importFileEl.files[0]);
  importFileEl.value = '';
});

// --- Filtering ---

function filtered() {
  let list = allBookmarks;
  if (activeTag === '__untagged__') {
    list = list.filter((b) => b.tags.length === 0);
  } else if (activeTag) {
    list = list.filter((b) => b.tags.includes(activeTag));
  }
  if (!currentQuery.trim()) return list;
  const q = currentQuery.toLowerCase();
  return list.filter((b) => b.title.toLowerCase().includes(q)
    || b.url.toLowerCase().includes(q)
    || b.tags.some((t) => t.toLowerCase().includes(q)));
}

// --- Sidebar ---

function renderSidebar() {
  tagListEl.innerHTML = '';

  const tagCounts = new Map();
  let untagged = 0;
  for (const bm of allBookmarks) {
    if (bm.tags.length === 0) { untagged++; continue; }
    for (const t of bm.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }

  const allItem = makeTagItem('Wszystkie', allBookmarks.length, null);
  tagListEl.appendChild(allItem);

  const inboxItem = makeTagItem('Inbox', untagged, '__untagged__');
  inboxItem.classList.add('tag-item--inbox');
  tagListEl.appendChild(inboxItem);

  const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sorted) {
    tagListEl.appendChild(makeTagItem(tag, count, tag));
  }

  const dupGroups = findDuplicateGroups(allBookmarks);
  const dupCount  = dupGroups.reduce((s, g) => s + g.length, 0);
  if (dupCount > 0) {
    const dupItem = document.createElement('li');
    dupItem.className = 'tag-item tag-item--divider tag-item--danger'
      + (duplicatesMode ? ' tag-item--active' : '');
    dupItem.innerHTML = `<span>⚠ Duplikaty</span>
      <span class="tag-count tag-count--danger">${dupCount}</span>`;
    dupItem.addEventListener('click', () => {
      duplicatesMode = !duplicatesMode;
      if (duplicatesMode) { activeTag = null; activeFilterEl.hidden = true; }
      renderSidebar(); renderAll();
    });
    tagListEl.appendChild(dupItem);
  }
}

function makeTagItem(label, count, value) {
  const li = document.createElement('li');
  li.className = 'tag-item' + (activeTag === value ? ' tag-item--active' : '');
  li.innerHTML = `<span>${escapeHtml(label)}</span>
    <span class="tag-count">${count}</span>`;
  li.addEventListener('click', () => setTagFilter(value));
  return li;
}

function setTagFilter(tag) {
  activeTag = tag;
  duplicatesMode = false;
  if (tag) {
    filterPrefixEl.textContent = tag === '__untagged__' ? 'Widok:' : 'Etykieta:';
    filterLabelEl.textContent = tag === '__untagged__' ? 'Inbox' : tag;
    activeFilterEl.hidden = false;
  } else {
    activeFilterEl.hidden = true;
  }
  renderSidebar();
  renderAll();
}

// --- Main render ---

function renderAll() {
  const list = filtered();
  containerEl.innerHTML = '';

  const total = allBookmarks.length;
  if (currentQuery.trim() || activeTag) {
    resultsCountEl.textContent = `${list.length} z ${total} zakładek`;
  } else {
    resultsCountEl.textContent = `${total} zakładek`;
  }

  if (duplicatesMode) {
    const groups = findDuplicateGroups(allBookmarks);
    if (groups.length === 0) {
      containerEl.appendChild(emptyState('Brak duplikatów — wszystko w porządku!'));
    } else {
      renderDuplicateGroups(groups);
    }
    syncSelectionUi();
    restoreKeyboardFocus();
    return;
  }

  if (list.length === 0) {
    containerEl.appendChild(emptyState());
    syncSelectionUi();
    return;
  }

  if (groupMode && !activeTag) {
    renderGrouped(list);
  } else {
    renderFlat(list);
  }
  syncSelectionUi();
  restoreKeyboardFocus();
}

function sortBookmarks(list) {
  if (currentSort === 'default') return list;
  const sorted = [...list];
  if (currentSort === 'az')     sorted.sort((a, b) => a.title.localeCompare(b.title));
  if (currentSort === 'za')     sorted.sort((a, b) => b.title.localeCompare(a.title));
  if (currentSort === 'domain') sorted.sort((a, b) => {
    const da = urlHostname(a.url) ?? '';
    const db = urlHostname(b.url) ?? '';
    return da.localeCompare(db) || a.title.localeCompare(b.title);
  });
  return sorted;
}

function renderFlat(list) {
  const frag = document.createDocumentFragment();
  for (const bm of sortBookmarks(list)) frag.appendChild(createRow(bm));
  containerEl.appendChild(frag);
}

function renderGrouped(list) {
  // Build groups: each tag + untagged
  const groups = new Map();   // tag -> bm[]
  const untagged = [];

  for (const bm of list) {
    if (bm.tags.length === 0) { untagged.push(bm); continue; }
    for (const tag of bm.tags) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(bm);
    }
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  if (untagged.length) sorted.push(['__untagged__', untagged]);

  for (const [tag, bms] of sorted) {
    const label = tag === '__untagged__' ? 'Bez etykiet' : tag;
    containerEl.appendChild(createGroup(label, bms));
  }
}

function createGroup(label, bms) {
  const wrap = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML =
    `<span class="group-header-label">${escapeHtml(label)}</span>
     <span class="group-header-count">${bms.length}</span>
     <span class="group-header-toggle">▾</span>`;

  const body = document.createElement('div');
  body.className = 'group-body';
  for (const bm of sortBookmarks(bms)) body.appendChild(createRow(bm));

  header.addEventListener('click', () => {
    const collapsed = body.classList.toggle('collapsed');
    header.classList.toggle('collapsed', collapsed);
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function renderDuplicateGroups(groups) {
  for (const group of groups) {
    const normalized = normalizeUrl(group[0].url);
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML =
      `<span class="group-header-label group-header-label--danger">${escapeHtml(normalized)}</span>
       <span class="group-header-count group-header-count--danger">${group.length}</span>
       <span class="group-header-toggle">▾</span>`;

    const body = document.createElement('div');
    body.className = 'group-body';
    for (const bm of group) body.appendChild(createRow(bm));

    header.addEventListener('click', () => {
      const c = body.classList.toggle('collapsed');
      header.classList.toggle('collapsed', c);
    });

    containerEl.appendChild(header);
    containerEl.appendChild(body);
  }
}

// --- Bookmark row ---

function createRow(bm) {
  const row = document.createElement('div');
  row.className = 'bm-row';
  row.dataset.id = bm.id;
  row.addEventListener('mouseenter', () => setKeyboardFocus(bm.id, false, row));

  const select = document.createElement('input');
  select.type = 'checkbox';
  select.className = 'bm-select';
  select.title = 'Zaznacz zakładkę';
  select.checked = selectedIds.has(bm.id);
  select.addEventListener('click', (event) => {
    event.stopPropagation();
    setSelection(bm.id, select.checked);
    setKeyboardFocus(bm.id, false, row);
  });
  row.appendChild(select);

  if (settings.favicons) {
    const host = urlHostname(bm.url);
    const img = document.createElement('img');
    img.className = 'bm-row-favicon';
    img.src = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : '';
    img.width = 14; img.height = 14; img.alt = '';
    img.onerror = () => { img.style.display = 'none'; };
    row.appendChild(img);
  }

  const link = document.createElement('a');
  link.className = 'bm-link';
  link.href = bm.url;
  link.title = bm.url;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    setKeyboardFocus(bm.id, false, row);
    openBookmark(bm);
  });

  const titleEl = document.createElement('span');
  titleEl.className = 'bm-title';
  titleEl.innerHTML = highlight(bm.title, currentQuery);

  const urlEl = document.createElement('span');
  urlEl.className = 'bm-url';
  urlEl.innerHTML = highlight(bm.url, currentQuery);

  link.appendChild(titleEl);
  link.appendChild(urlEl);

  if (bm.parseError) {
    const badge = document.createElement('button');
    badge.className = 'parse-error-badge';
    badge.title = bm.parseError;
    badge.innerHTML = svgWarn() + '<span>Błąd etykiet</span>';
    badge.addEventListener('click', (e) => { e.stopPropagation(); openTagsErrorPage(bm); });
    link.appendChild(badge);
  } else if (bm.tags.length > 0) {
    link.appendChild(buildTagChips(bm));
  }

  // Copy — always visible
  const copyBtn = document.createElement('button');
  copyBtn.className = 'bm-copy';
  copyBtn.title = 'Kopiuj link';
  copyBtn.innerHTML = svgCopy();
  copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyLink(bm.url, copyBtn); });

  // Hidden actions
  const actions = document.createElement('div');
  actions.className = 'bm-actions';

  const labelBtn = makeActionBtn('Etykiety', svgLabel());
  labelBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTagEditor(bm, row, labelBtn); });

  const editBtn = makeActionBtn('Edytuj', svgEdit());
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEdit(bm, row); });

  const delBtn = makeActionBtn('Usuń', svgTrash());
  delBtn.classList.add('bm-action--danger');
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(bm.id, row); });

  actions.appendChild(labelBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  row.appendChild(link);
  row.appendChild(copyBtn);
  row.appendChild(actions);
  return row;
}

function makeActionBtn(title, svg) {
  const b = document.createElement('button');
  b.className = 'bm-action';
  b.title = title;
  b.innerHTML = svg;
  return b;
}

// --- Selection and bulk actions ---

function getVisibleBookmarkIds() {
  return [...new Set(getNavigableRows().map((row) => row.dataset.id))];
}

function setSelection(id, selected) {
  if (selected) selectedIds.add(id);
  else selectedIds.delete(id);
  syncSelectionUi();
}

function toggleSelection(id) {
  setSelection(id, !selectedIds.has(id));
}

function syncSelectionUi() {
  const visibleIds = getVisibleBookmarkIds();
  for (const checkbox of containerEl.querySelectorAll('.bm-select')) {
    checkbox.checked = selectedIds.has(checkbox.closest('.bm-row').dataset.id);
  }
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
  bulkSelectAllEl.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  bulkSelectAllEl.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  bulkCountEl.textContent = `${selectedIds.size} zaznaczonych`;
  bulkActionsEl.hidden = selectedIds.size === 0;
}

bulkSelectAllEl.addEventListener('change', () => {
  for (const id of getVisibleBookmarkIds()) {
    if (bulkSelectAllEl.checked) selectedIds.add(id);
    else selectedIds.delete(id);
  }
  syncSelectionUi();
});

document.getElementById('bulk-clear').addEventListener('click', () => {
  selectedIds.clear();
  syncSelectionUi();
});

document.getElementById('bulk-add-tag').addEventListener('click', async () => {
  const tags = bulkTagEl.value.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (tags.length === 0 || selectedIds.size === 0) return;

  const history = [];
  let updated = 0;
  try {
    for (const id of selectedIds) {
      const bookmark = allBookmarks.find((item) => item.id === id);
      if (!bookmark) continue;
      const merged = mergeTags(bookmark.tags, tags);
      if (merged.length === bookmark.tags.length) continue;
      const snapshot = {
        type: 'edit',
        id,
        title: bookmark.title,
        rawTitleBefore: bookmark.rawTitle,
        urlBefore: bookmark.url,
      };
      const newRawTitle = buildRawTitle(bookmark.title, merged);
      await bookmarksApi.update(id, { title: newRawTitle });
      history.push(snapshot);
      bookmark.tags = merged;
      bookmark.rawTitle = newRawTitle;
      updated++;
    }
    if (history.length) historyPushMany(history);
    bulkTagEl.value = '';
    renderSidebar();
    renderAll();
    showToast(updated ? `Dodano etykiety do ${updated} zakładek` : 'Wybrane zakładki mają już te etykiety', updated ? 'ok' : 'warn');
  } catch (err) {
    if (history.length) historyPushMany(history);
    await initBookmarks();
    showToast(`Nie udało się dodać etykiet: ${err.message}`, 'err');
  }
});

function renderFolderOptions() {
  bulkFolderEl.innerHTML = '<option value="">Wybierz folder…</option>';
  for (const folder of folders) {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folder.path;
    bulkFolderEl.appendChild(option);
  }
}

document.getElementById('bulk-move').addEventListener('click', async () => {
  const parentId = bulkFolderEl.value;
  if (!parentId || selectedIds.size === 0) return;

  const history = [];
  let moved = 0;
  try {
    for (const id of selectedIds) {
      const bookmark = allBookmarks.find((item) => item.id === id);
      if (!bookmark || bookmark.parentId === parentId) continue;
      const snapshot = {
        type: 'move',
        id,
        title: bookmark.title,
        parentIdBefore: bookmark.parentId,
        indexBefore: bookmark.index,
      };
      const result = await bookmarksApi.move(id, { parentId });
      history.push(snapshot);
      bookmark.parentId = result.parentId;
      bookmark.index = result.index;
      moved++;
    }
    if (history.length) historyPushMany(history);
    showToast(moved ? `Przeniesiono ${moved} zakładek` : 'Zakładki są już w tym folderze', moved ? 'ok' : 'warn');
  } catch (err) {
    if (history.length) historyPushMany(history);
    await initBookmarks();
    showToast(`Nie udało się przenieść zakładek: ${err.message}`, 'err');
  }
});

document.getElementById('bulk-delete').addEventListener('click', () => {
  if (selectedIds.size === 0) return;
  modalDesc.textContent = `${selectedIds.size} zaznaczonych zakładek`;
  pendingDelete = { ids: [...selectedIds] };
  modalOverlay.hidden = false;
  modalConfirm.focus();
});

// --- Keyboard navigation ---

function getNavigableRows() {
  return [...containerEl.querySelectorAll('.bm-row')].filter((row) => row.offsetParent !== null);
}

function getKeyboardRow() {
  return containerEl.querySelector('.bm-row--keyboard')
    ?? getNavigableRows().find((row) => row.dataset.id === keyboardBookmarkId)
    ?? null;
}

function getKeyboardBookmark() {
  return allBookmarks.find((bookmark) => bookmark.id === keyboardBookmarkId) ?? null;
}

function setKeyboardFocus(id, scroll = true, targetRow = null) {
  keyboardBookmarkId = id;
  for (const row of getNavigableRows()) row.classList.remove('bm-row--keyboard');
  const row = targetRow ?? getNavigableRows().find((item) => item.dataset.id === id);
  row?.classList.add('bm-row--keyboard');
  if (scroll) row?.scrollIntoView({ block: 'nearest' });
}

function moveKeyboardFocus(delta, rows = getNavigableRows()) {
  if (rows.length === 0) return;
  const current = rows.findIndex((row) => row.dataset.id === keyboardBookmarkId);
  const next = current === -1
    ? (delta > 0 ? 0 : rows.length - 1)
    : (current + delta + rows.length) % rows.length;
  setKeyboardFocus(rows[next].dataset.id, true, rows[next]);
}

function restoreKeyboardFocus() {
  if (!keyboardBookmarkId || !getKeyboardRow()) keyboardBookmarkId = null;
  if (keyboardBookmarkId) setKeyboardFocus(keyboardBookmarkId, false);
}

// --- Tag chips ---

function buildTagChips(bm) {
  const div = document.createElement('div');
  div.className = 'bm-tags';
  for (const tag of bm.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (tag === activeTag ? ' tag-chip--active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTagFilter(tag); });
    div.appendChild(chip);
  }
  return div;
}

function refreshRowTags(bm, row) {
  const link = row.querySelector('.bm-link');
  link.querySelector('.bm-tags')?.remove();
  link.querySelector('.parse-error-badge')?.remove();
  if (bm.tags.length > 0) link.appendChild(buildTagChips(bm));
}

// --- Tag editor ---

function toggleTagEditor(bm, row, btn) {
  const existing = row.querySelector('.tag-editor');
  if (existing) { existing.remove(); btn.classList.remove('bm-action--active'); return; }
  btn.classList.add('bm-action--active');

  const editor = document.createElement('div');
  editor.className = 'tag-editor';

  const chipsRow = document.createElement('div');
  chipsRow.className = 'tag-editor-chips';

  function rerender() {
    chipsRow.innerHTML = '';
    chipsRow.hidden = bm.tags.length === 0;
    for (const tag of bm.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip tag-chip--removable';
      chip.textContent = tag;
      const x = document.createElement('button');
      x.className = 'tag-chip-remove';
      x.innerHTML = '×';
      x.addEventListener('click', () => {
        const rawTitleBefore = bm.rawTitle;
        bm.tags = bm.tags.filter((t) => t !== tag);
        bm.rawTitle = buildRawTitle(bm.title, bm.tags);
        bookmarksApi.update(bm.id, { title: bm.rawTitle }).catch((err) => showToast(`Błąd: ${err.message}`, 'err'));
        historyPush({ type: 'tag_remove', id: bm.id, title: bm.title, tag, rawTitleBefore, url: bm.url, ts: Date.now() });
        rerender();
        refreshRowTags(bm, row);
        renderSidebar();
      });
      chip.appendChild(x);
      chipsRow.appendChild(chip);
    }
  }

  rerender();

  const inputRow = document.createElement('div');
  inputRow.className = 'tag-input-row';
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'tag-input';
  input.placeholder = 'Nowa etykieta…'; input.maxLength = 32;

  function addTag() {
    const tag = input.value.trim();
    if (!tag || bm.tags.includes(tag)) { input.value = ''; return; }
    const rawTitleBefore = bm.rawTitle;
    bm.tags = [...bm.tags, tag];
    bm.rawTitle = buildRawTitle(bm.title, bm.tags);
    bookmarksApi.update(bm.id, { title: bm.rawTitle }).catch((err) => showToast(`Błąd: ${err.message}`, 'err'));
    historyPush({ type: 'tag_add', id: bm.id, title: bm.title, tag, rawTitleBefore, url: bm.url, ts: Date.now() });
    rerender(); refreshRowTags(bm, row); renderSidebar();
    input.value = ''; input.focus();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    if (e.key === 'Escape') { editor.remove(); btn.classList.remove('bm-action--active'); }
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'tag-add-btn'; addBtn.textContent = '+';
  addBtn.addEventListener('click', addTag);

  inputRow.appendChild(input); inputRow.appendChild(addBtn);
  editor.appendChild(chipsRow); editor.appendChild(inputRow);
  row.appendChild(editor);
  input.focus();
}

// --- Inline edit ---

function startEdit(bm, row) {
  row.innerHTML = '';
  row.classList.add('bm-row--editing');

  const form = document.createElement('form');
  form.className = 'edit-form';

  const titleIn = document.createElement('input');
  titleIn.type = 'text'; titleIn.className = 'edit-input';
  titleIn.value = bm.title; titleIn.placeholder = 'Tytuł'; titleIn.required = true;

  const urlIn = document.createElement('input');
  urlIn.type = 'url'; urlIn.className = 'edit-input';
  urlIn.value = bm.url; urlIn.placeholder = 'URL'; urlIn.required = true;

  const tagsIn = document.createElement('input');
  tagsIn.type = 'text'; tagsIn.className = 'edit-input';
  tagsIn.value = bm.tags.join(', '); tagsIn.placeholder = 'Etykiety (oddzielone przecinkami)';

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-buttons';

  const save = document.createElement('button');
  save.type = 'submit'; save.className = 'edit-save'; save.textContent = 'Zapisz';

  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'edit-cancel'; cancel.textContent = 'Anuluj';
  cancel.addEventListener('click', () => {
    row.classList.remove('bm-row--editing');
    row.replaceWith(createRow(bm));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTitle = titleIn.value.trim(), newUrl = urlIn.value.trim();
    if (!newTitle || !newUrl) return;
    const newTags = tagsIn.value.split(',').map((t) => t.trim()).filter(Boolean);
    const snapshot = { type: 'edit', id: bm.id, title: bm.title, rawTitleBefore: bm.rawTitle, urlBefore: bm.url, ts: Date.now() };
    const newRaw = buildRawTitle(newTitle, newTags);
    try {
      await bookmarksApi.update(bm.id, { title: newRaw, url: newUrl });
      historyPush(snapshot);
      bm.title = newTitle; bm.url = newUrl; bm.tags = newTags; bm.rawTitle = newRaw;
      row.classList.remove('bm-row--editing');
      row.replaceWith(createRow(bm));
      showToast(`Zapisano „${newTitle}"`, 'ok', async () => {
        await undoHistoryEntry(snapshot, async () => {
          try {
            const tree = await bookmarksApi.getTree();
            allBookmarks = flattenBookmarks(tree);
            folders = flattenFolders(tree);
            renderFolderOptions();
            renderSidebar();
            renderAll();
            showToast('Cofnięto edycję', 'ok');
          } catch (err2) {
            showToast(`Błąd odświeżania: ${err2.message}`, 'err');
          }
        });
      });
    } catch (err) {
      showToast(`Błąd zapisu: ${err.message}`, 'err');
    }
  });

  btnRow.appendChild(save); btnRow.appendChild(cancel);
  form.appendChild(titleIn); form.appendChild(urlIn); form.appendChild(tagsIn); form.appendChild(btnRow);
  row.appendChild(form);
  titleIn.focus(); titleIn.select();
}

// --- Delete ---

let pendingDelete = null;
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden) { closeModal(); return; }
  if (!settingsOverlay.hidden) { settingsOverlay.hidden = true; }
});

modalConfirm.addEventListener('click', async () => {
  if (!pendingDelete) return;
  const ids = pendingDelete.ids || [pendingDelete.id];
  const snapshotTime = Date.now();
  const snapshots = ids.map((id) => allBookmarks.find((bookmark) => bookmark.id === id))
    .filter(Boolean)
    .map((bookmark, index) => ({
      type: 'delete',
      id: bookmark.id,
      title: bookmark.title,
      rawTitle: bookmark.rawTitle,
      url: bookmark.url,
      parentId: bookmark.parentId,
      index: bookmark.index,
      ts: snapshotTime + index,
    }));
  closeModal();

  const removedIds = [];
  try {
    for (const id of ids) {
      await bookmarksApi.remove(id);
      removedIds.push(id);
    }
    if (snapshots.length) historyPushMany(snapshots);
    const removedSet = new Set(removedIds);
    allBookmarks = allBookmarks.filter((bookmark) => !removedSet.has(bookmark.id));
    for (const id of removedIds) selectedIds.delete(id);
    renderSidebar();
    renderAll();
    if (snapshots.length === 1) {
      const [snapshot] = snapshots;
      showToast(`Usunięto „${snapshot.title}"`, 'ok', async () => {
        await undoHistoryEntry(snapshot, async () => {
          try {
            const tree = await bookmarksApi.getTree();
            allBookmarks = flattenBookmarks(tree);
            folders = flattenFolders(tree);
            renderFolderOptions();
            renderSidebar();
            renderAll();
            showToast('Cofnięto usunięcie', 'ok');
          } catch (err2) {
            showToast(`Błąd odświeżania: ${err2.message}`, 'err');
          }
        });
      });
    } else {
      showToast(`Usunięto ${removedIds.length} zakładek — można je cofnąć w historii`, 'ok');
    }
  } catch (err) {
    const removedSet = new Set(removedIds);
    const successfulSnapshots = snapshots.filter((snapshot) => removedSet.has(snapshot.id));
    if (successfulSnapshots.length) historyPushMany(successfulSnapshots);
    await initBookmarks();
    showToast(`Usunięto ${removedIds.length} z ${ids.length}. Błąd: ${err.message}`, 'err');
  }
});

function confirmDelete(id, row) {
  const bm = allBookmarks.find((b) => b.id === id);
  modalDesc.textContent = bm ? bm.title : '';
  pendingDelete = { id };
  modalOverlay.hidden = false;
  modalConfirm.focus();
}

function closeModal() { modalOverlay.hidden = true; pendingDelete = null; }

// --- Open ---

function openBookmark(bm) {
  const url = bm.url;
  if (!isAllowedProtocol(url)) { openErrorPage(url); return; }
  chrome.tabs.create({ url });
}

function openErrorPage(u) {
  chrome.tabs.create({ url: `${chrome.runtime.getURL('error.html')}?type=url&value=${encodeURIComponent(u)}` });
}

function openTagsErrorPage(bm) {
  const p = new URLSearchParams({ type: 'tags', value: bm.rawTitle, reason: bm.parseError, id: bm.id });
  chrome.tabs.create({ url: `${chrome.runtime.getURL('error.html')}?${p}` });
}

// --- Copy ---

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = svgCheck(); btn.classList.add('bm-copy--copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('bm-copy--copied'); }, 1500);
  });
}

// --- Export ---

function exportBookmarks() {
  const rows = [['title', 'url', 'tags']];
  for (const bm of allBookmarks) rows.push([bm.title, bm.url, bm.tags.join(';')]);
  const csv = rows.map(csvRow).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bookmarks-${dateStamp()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast(`Wyeksportowano ${allBookmarks.length} zakładek`, 'ok');
}

// --- Import ---

async function importBookmarks(file) {
  let text;
  try { text = await file.text(); } catch { showToast('Nie można odczytać pliku', 'err'); return; }

  const rows = parseCsv(text);
  if (rows.length < 2) { showToast('Plik jest pusty lub ma nieprawidłowy format', 'warn'); return; }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const ti = header.indexOf('title'), ui = header.indexOf('url'), gi = header.indexOf('tags');
  if (ti === -1 || ui === -1) { showToast('Brak kolumn "title" lub "url"', 'err'); return; }

  let added = 0, skipped = 0;
  for (const row of rows.slice(1).filter((r) => r[ui]?.trim())) {
    const url = row[ui].trim(), title = row[ti]?.trim() || url;
    const tags = gi !== -1 ? (row[gi] || '').split(';').map((t) => t.trim()).filter(Boolean) : [];
    if (findBookmarkByUrl(allBookmarks, url)) { skipped++; continue; }
    try {
      await bookmarksApi.create({ title: buildRawTitle(title, tags), url });
      added++;
    } catch { skipped++; }
  }

  try {
    const tree = await bookmarksApi.getTree();
    allBookmarks = flattenBookmarks(tree);
    folders = flattenFolders(tree);
    renderFolderOptions();
    renderSidebar(); renderAll();
  } catch (err) {
    showToast(`Błąd odświeżania: ${err.message}`, 'err');
  }

  showToast(added === 0
    ? `Nic nie dodano — ${skipped} pominiętych`
    : skipped > 0 ? `Dodano ${added}, pominięto ${skipped}` : `Zaimportowano ${added} zakładek`,
    added === 0 ? 'warn' : 'ok');
}

// --- Empty state ---

function emptyState(msg) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  const text = msg ?? (currentQuery ? `Brak wyników dla „${escapeHtml(currentQuery)}"` : 'Brak zakładek');
  div.innerHTML = `<svg viewBox="0 0 48 48" fill="none">
    <path d="M12 8h24a2 2 0 0 1 2 2v28l-14-7-14 7V10a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  </svg>
  <p>${text}</p>`;
  return div;
}

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

