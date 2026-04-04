'use strict';

let allBookmarks = [];   // [{ id, rawTitle, title, url, tags[], parseError }]
let currentQuery    = '';
let activeTag       = null;
let groupMode       = false;
let gridMode        = false;
let activeSimilarTo = null;
let currentSort     = 'default';
let duplicatesMode  = false;
let settings        = { favicons: false, deadLinkCheck: false, aiEnabled: false, openaiKey: '' };
let deadLinks       = new Set();   // URLs confirmed unreachable
let checkRunning    = false;

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

// --- History (chrome.storage.local) ---

const HISTORY_KEY = 'bm_history';
const HISTORY_MAX = 30;

function historyPush(entry) {
  chrome.storage.local.get(HISTORY_KEY, (data) => {
    const list = data[HISTORY_KEY] || [];
    list.unshift({ ...entry, ts: Date.now() });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    chrome.storage.local.set({ [HISTORY_KEY]: list }, renderHistory);
  });
}

function historyRemoveByTs(ts) {
  chrome.storage.local.get(HISTORY_KEY, (data) => {
    const list = (data[HISTORY_KEY] || []).filter((e) => e.ts !== ts);
    chrome.storage.local.set({ [HISTORY_KEY]: list }, renderHistory);
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

function historyLabel(entry) {
  const t = entry.title || '';
  switch (entry.type) {
    case 'delete':     return `Usunięto: ${t}`;
    case 'edit':       return `Edytowano: ${t}`;
    case 'tag_add':    return `+etykieta „${entry.tag}" → ${t}`;
    case 'tag_remove': return `-etykieta „${entry.tag}" z ${t}`;
    default:           return entry.type;
  }
}

function renderHistory() {
  const historyListEl = document.getElementById('history-list');
  if (!historyListEl) return;
  chrome.storage.local.get(HISTORY_KEY, (data) => {
    const entries = data[HISTORY_KEY] || [];
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
      undoBtn.addEventListener('click', () => {
        undoHistoryEntry(entry, () => {
          chrome.bookmarks.getTree((tree) => {
            allBookmarks = flattenBookmarks(tree);
            renderSidebar();
            renderAll();
            showToast('Cofnięto', 'ok');
          });
        });
      });

      li.appendChild(text);
      li.appendChild(undoBtn);
      historyListEl.appendChild(li);
    }
  });
}

// --- Init ---
chrome.storage.local.get('bm_settings', (data) => {
  settings = { favicons: false, deadLinkCheck: false, aiEnabled: false, openaiKey: '', ...(data.bm_settings || {}) };
  document.getElementById('setting-favicons').checked    = settings.favicons;
  document.getElementById('setting-dead-links').checked  = settings.deadLinkCheck;
  document.getElementById('setting-ai-enabled').checked  = settings.aiEnabled;
  document.getElementById('setting-openai-key').value    = settings.openaiKey;

  chrome.bookmarks.getTree((tree) => {
    allBookmarks = flattenBookmarks(tree);
    renderSidebar();
    renderAll();
    renderHistory();
    if (settings.deadLinkCheck) checkDeadLinks();
  });
});

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
});

// --- Search ---
let debounce;
searchEl.addEventListener('input', () => {
  clearSearchEl.hidden = !searchEl.value;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    currentQuery = searchEl.value;
    renderAll();
  }, 250);
});

clearSearchEl.addEventListener('click', () => {
  searchEl.value = '';
  clearSearchEl.hidden = true;
  currentQuery = '';
  renderAll();
});

// --- Tag / similar filter clear ---
filterClearEl.addEventListener('click', () => {
  activeSimilarTo = null;
  setTagFilter(null);
});

// --- Group toggle ---
btnGroup.addEventListener('click', () => {
  groupMode = !groupMode;
  btnGroup.classList.toggle('toggle-btn--active', groupMode);
  renderAll();
});

// --- Grid toggle ---
document.getElementById('btn-grid').addEventListener('click', () => {
  gridMode = !gridMode;
  document.getElementById('btn-grid').classList.toggle('toggle-btn--active', gridMode);
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
  chrome.storage.local.set({ bm_settings: settings });
  renderAll();
});

document.getElementById('setting-ai-enabled').addEventListener('change', (e) => {
  settings.aiEnabled = e.target.checked;
  chrome.storage.local.set({ bm_settings: settings });
  renderAll();
});

document.getElementById('setting-dead-links').addEventListener('change', (e) => {
  settings.deadLinkCheck = e.target.checked;
  chrome.storage.local.set({ bm_settings: settings });
});

document.getElementById('btn-check-now').addEventListener('click', () => {
  settingsOverlay.hidden = true;
  checkDeadLinks();
});

// --- OpenAI key ---
const openaiKeyInput = document.getElementById('setting-openai-key');
openaiKeyInput.addEventListener('change', () => {
  settings.openaiKey = openaiKeyInput.value.trim();
  chrome.storage.local.set({ bm_settings: settings });
});

document.getElementById('btn-show-key').addEventListener('click', () => {
  openaiKeyInput.type = openaiKeyInput.type === 'password' ? 'text' : 'password';
});

// --- AI tag suggestions ---

async function suggestTagsAI(bm) {
  if (!settings.openaiKey) {
    showToast('Ustaw klucz OpenAI w Ustawieniach', 'warn');
    return null;
  }
  const prompt =
    `Zaproponuj 2-5 krótkich etykiet (1-2 słowa każda) dla tej zakładki.\n` +
    `Tytuł: ${bm.title}\nURL: ${bm.url}\n` +
    (bm.tags.length ? `Istniejące etykiety: ${bm.tags.join(', ')}\n` : '') +
    `Odpowiedź: tylko lista etykiet rozdzielona przecinkami, bez dodatkowego tekstu.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content
    .trim()
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter((t) => t && !bm.tags.includes(t));
}

function showAISuggestPanel(bm, container, onTagAdded) {
  container.querySelector('.ai-suggest-panel')?.remove();

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
    chip.title = `Dodaj etykietę „${tag}"`;
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
  dismiss.title = 'Odrzuć sugestie';
  dismiss.addEventListener('click', () => panel.remove());
  panel.appendChild(dismiss);

  container.appendChild(panel);
  return { chipsWrap, addChip };
}

async function runAISuggest(bm, container, aiBtn, onTagAdded) {
  aiBtn.disabled = true;
  aiBtn.classList.add('bm-action--loading');
  try {
    const tags = await suggestTagsAI(bm);
    if (!tags || tags.length === 0) {
      showToast('Brak nowych sugestii', 'warn');
      return;
    }
    const { addChip } = showAISuggestPanel(bm, container, onTagAdded);
    tags.forEach(addChip);
  } catch (err) {
    showToast(`Błąd AI: ${err.message}`, 'err');
  } finally {
    aiBtn.disabled = false;
    aiBtn.classList.remove('bm-action--loading');
  }
}

// --- Dead link checking ---

async function checkDeadLinks() {
  if (checkRunning) return;
  checkRunning = true;
  deadLinks.clear();

  const urls = [...new Set(allBookmarks.map((b) => b.url).filter((u) => u.startsWith('http')))];
  const total = urls.length;
  let done = 0;

  updateCheckStatus(`Sprawdzanie 0/${total}…`);

  const CONCURRENCY = 5;
  let idx = 0;

  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      const alive = await checkUrl(url);
      if (!alive) deadLinks.add(url);
      done++;
      updateCheckStatus(`Sprawdzanie ${done}/${total}…`);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker);
  await Promise.all(workers);

  checkRunning = false;
  const count = deadLinks.size;
  if (count === 0) {
    updateCheckStatus('Wszystkie linki działają', 6000);
  } else {
    updateCheckStatus(`Martwe linki: ${count}`, 0);
  }
  renderAll();
}

async function checkUrl(url) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(tid);
    if (res.status === 405) return true; // HEAD blocked but server responded
    return res.status < 400;
  } catch {
    clearTimeout(tid);
    return false;
  }
}

const deadCheckStatusEl = document.getElementById('dead-check-status');
let deadStatusTimer;

function updateCheckStatus(msg, autohideMs = null) {
  deadCheckStatusEl.textContent = msg;
  deadCheckStatusEl.hidden = false;
  clearTimeout(deadStatusTimer);
  if (autohideMs !== null && autohideMs > 0) {
    deadStatusTimer = setTimeout(() => { deadCheckStatusEl.hidden = true; }, autohideMs);
  }
}

// --- Sort ---
document.getElementById('sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderAll();
});

// --- Export / Import ---
document.getElementById('btn-export').addEventListener('click', exportBookmarks);
document.getElementById('btn-import').addEventListener('click', () => importFileEl.click());
importFileEl.addEventListener('change', () => {
  if (importFileEl.files[0]) importBookmarks(importFileEl.files[0]);
  importFileEl.value = '';
});

// --- Title parsing (same contract as popup.js) ---

function parseTitle(raw) {
  const sep = raw.indexOf(' | ');
  if (sep === -1) return { title: raw, tags: [], parseError: null };

  const title       = raw.slice(0, sep).trim();
  const rawTagSection = raw.slice(sep + 3);

  if (!rawTagSection.trim())
    return { title, tags: [], parseError: `Sekcja etykiet jest pusta — usuń " | " lub dodaj etykietę` };

  const parts     = rawTagSection.split(',');
  const emptyPart = parts.some((t) => !t.trim());
  if (emptyPart)
    return { title, tags: parts.map((t) => t.trim()).filter(Boolean),
      parseError: `Pusta etykieta w "${rawTagSection.trim()}" — usuń nadmiarowe przecinki` };

  const tags      = parts.map((t) => t.trim());
  const withPipe  = tags.filter((t) => t.includes('|'));
  if (withPipe.length)
    return { title, tags,
      parseError: `Etykieta nie może zawierać "|": ${withPipe.map((t) => `"${t}"`).join(', ')}` };

  return { title, tags, parseError: null };
}

function buildRawTitle(title, tags) {
  return tags.length ? `${title} | ${tags.join(', ')}` : title;
}

function flattenBookmarks(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.url) {
      const raw = node.title || node.url;
      const { title, tags, parseError } = parseTitle(raw);
      out.push({ id: node.id, rawTitle: raw, title, url: node.url, tags, parseError });
    }
    if (node.children) out.push(...flattenBookmarks(node.children));
  }
  return out;
}

// --- Filtering ---

function filtered() {
  let list = allBookmarks;
  if (activeSimilarTo) {
    const ids = new Set(findSimilar(activeSimilarTo).map((b) => b.id));
    list = list.filter((b) => ids.has(b.id));
  } else if (activeTag === '__untagged__') {
    list = list.filter((b) => b.tags.length === 0);
  } else if (activeTag) {
    list = list.filter((b) => b.tags.includes(activeTag));
  }
  if (!currentQuery.trim()) return list;
  const q = currentQuery.toLowerCase();
  return list.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
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

  const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sorted) {
    tagListEl.appendChild(makeTagItem(tag, count, tag));
  }

  if (untagged > 0) {
    const divItem = makeTagItem('Bez etykiet', untagged, '__untagged__');
    divItem.classList.add('tag-item--divider');
    tagListEl.appendChild(divItem);
  }

  const dupGroups = findDuplicateGroups();
  const dupCount  = dupGroups.reduce((s, g) => s + g.length, 0);
  if (dupCount > 0) {
    const dupItem = document.createElement('li');
    dupItem.className = 'tag-item tag-item--divider tag-item--danger'
      + (duplicatesMode ? ' tag-item--active' : '');
    dupItem.innerHTML = `<span>⚠ Duplikaty</span>
      <span class="tag-count tag-count--danger">${dupCount}</span>`;
    dupItem.addEventListener('click', () => {
      duplicatesMode = !duplicatesMode;
      if (duplicatesMode) {
        activeTag = null;
        activeSimilarTo = null;
        activeFilterEl.hidden = true;
      }
      renderSidebar();
      renderAll();
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
  activeSimilarTo = null;
  duplicatesMode = false;
  if (tag && tag !== '__untagged__') {
    filterPrefixEl.textContent = 'Etykieta:';
    filterLabelEl.textContent = tag;
    activeFilterEl.hidden = false;
  } else {
    activeFilterEl.hidden = true;
  }
  renderSidebar();
  renderAll();
}

function setSimilarFilter(bm) {
  if (activeSimilarTo?.id === bm.id) {
    activeSimilarTo = null;
    activeFilterEl.hidden = true;
  } else {
    activeSimilarTo = bm;
    activeTag = null;
    duplicatesMode = false;
    filterPrefixEl.textContent = 'Podobne do:';
    filterLabelEl.textContent = bm.title;
    activeFilterEl.hidden = false;
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
    const groups = findDuplicateGroups();
    if (groups.length === 0) {
      containerEl.appendChild(emptyState('Brak duplikatów — wszystko w porządku!'));
    } else {
      renderDuplicateGroups(groups);
    }
    return;
  }

  if (list.length === 0) {
    containerEl.appendChild(emptyState());
    return;
  }

  if (gridMode) {
    renderGrid(list);
  } else if (groupMode && !activeTag) {
    renderGrouped(list);
  } else {
    renderFlat(list);
  }
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

function renderGrid(list) {
  const grid = document.createElement('div');
  grid.className = 'bm-grid';
  for (const bm of sortBookmarks(list)) grid.appendChild(createCard(bm));
  containerEl.appendChild(grid);
}

function createCard(bm) {
  const card = document.createElement('div');
  card.className = 'bm-card';
  card.dataset.id = bm.id;

  // Favicon + domain header
  const cardHeader = document.createElement('div');
  cardHeader.className = 'bm-card-header';

  const favicon = document.createElement('img');
  favicon.className = 'bm-card-favicon';
  const host = urlHostname(bm.url);
  favicon.src = host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=32`
    : '';
  favicon.width = 16;
  favicon.height = 16;
  favicon.alt = '';
  favicon.onerror = () => { favicon.style.display = 'none'; };

  const domain = document.createElement('span');
  domain.className = 'bm-card-domain';
  domain.textContent = host || '—';

  // Copy button (always visible in card)
  const copyBtn = document.createElement('button');
  copyBtn.className = 'bm-card-copy';
  copyBtn.title = 'Kopiuj link';
  copyBtn.innerHTML = svgCopy();
  copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyLink(bm.url, copyBtn); });

  cardHeader.appendChild(favicon);
  cardHeader.appendChild(domain);
  if (deadLinks.has(bm.url)) {
    const dead = document.createElement('span');
    dead.className = 'bm-dead-badge bm-dead-badge--card';
    dead.textContent = 'Niedostępny';
    cardHeader.appendChild(dead);
  }
  cardHeader.appendChild(copyBtn);

  // Body (clickable)
  const cardBody = document.createElement('a');
  cardBody.className = 'bm-card-body';
  cardBody.href = bm.url;
  cardBody.title = bm.url;
  cardBody.addEventListener('click', (e) => { e.preventDefault(); openBookmark(bm.url); });

  const titleEl = document.createElement('span');
  titleEl.className = 'bm-card-title';
  titleEl.innerHTML = highlight(bm.title, currentQuery);

  const urlEl = document.createElement('span');
  urlEl.className = 'bm-card-url';
  urlEl.innerHTML = highlight(bm.url, currentQuery);

  cardBody.appendChild(titleEl);
  cardBody.appendChild(urlEl);

  if (bm.tags.length > 0) {
    const tagsEl = document.createElement('div');
    tagsEl.className = 'bm-card-tags';
    for (const tag of bm.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (tag === activeTag ? ' tag-chip--active' : '');
      chip.textContent = tag;
      chip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTagFilter(tag); });
      tagsEl.appendChild(chip);
    }
    cardBody.appendChild(tagsEl);
  }

  if (bm.parseError) {
    const badge = document.createElement('button');
    badge.className = 'parse-error-badge';
    badge.title = bm.parseError;
    badge.innerHTML = svgWarn() + '<span>Błąd etykiet</span>';
    badge.addEventListener('click', (e) => { e.stopPropagation(); openTagsErrorPage(bm); });
    cardBody.appendChild(badge);
  }

  // Action overlay (on hover)
  const actions = document.createElement('div');
  actions.className = 'bm-card-actions';

  if (settings.aiEnabled) {
    const aiBtn = makeActionBtn('Sugestie etykiet AI', svgAI());
    aiBtn.addEventListener('click', (e) => { e.stopPropagation(); runAISuggest(bm, card, aiBtn, () => refreshRowTags(bm, card)); });
    actions.appendChild(aiBtn);
  }

  const similarBtn = makeActionBtn('Pokaż podobne', svgSimilar());
  if (activeSimilarTo?.id === bm.id) similarBtn.classList.add('bm-action--active');
  similarBtn.addEventListener('click', (e) => { e.stopPropagation(); setSimilarFilter(bm); });

  const labelBtn = makeActionBtn('Etykiety', svgLabel());
  labelBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTagEditor(bm, card, labelBtn); });

  const editBtn = makeActionBtn('Edytuj', svgEdit());
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEdit(bm, card); });

  const delBtn = makeActionBtn('Usuń', svgTrash());
  delBtn.classList.add('bm-action--danger');
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(bm.id, card); });

  actions.appendChild(similarBtn);
  actions.appendChild(labelBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  card.appendChild(cardHeader);
  card.appendChild(cardBody);
  card.appendChild(actions);
  return card;
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
  for (const bm of bms) body.appendChild(createRow(bm));

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
  link.addEventListener('click', (e) => { e.preventDefault(); openBookmark(bm.url); });

  const titleEl = document.createElement('span');
  titleEl.className = 'bm-title';
  titleEl.innerHTML = highlight(bm.title, currentQuery);

  const urlEl = document.createElement('span');
  urlEl.className = 'bm-url';
  urlEl.innerHTML = highlight(bm.url, currentQuery);

  link.appendChild(titleEl);
  link.appendChild(urlEl);

  if (deadLinks.has(bm.url)) {
    const dead = document.createElement('span');
    dead.className = 'bm-dead-badge';
    dead.textContent = 'Niedostępny';
    link.appendChild(dead);
  }

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

  if (settings.aiEnabled) {
    const aiBtn = makeActionBtn('Sugestie etykiet AI', svgAI());
    aiBtn.addEventListener('click', (e) => { e.stopPropagation(); runAISuggest(bm, row, aiBtn, () => refreshRowTags(bm, row)); });
    actions.appendChild(aiBtn);
  }

  const similarBtn = makeActionBtn('Pokaż podobne', svgSimilar());
  if (activeSimilarTo?.id === bm.id) similarBtn.classList.add('bm-action--active');
  similarBtn.addEventListener('click', (e) => { e.stopPropagation(); setSimilarFilter(bm); });

  const labelBtn = makeActionBtn('Etykiety', svgLabel());
  labelBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTagEditor(bm, row, labelBtn); });

  const editBtn = makeActionBtn('Edytuj', svgEdit());
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEdit(bm, row); });

  const delBtn = makeActionBtn('Usuń', svgTrash());
  delBtn.classList.add('bm-action--danger');
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(bm.id, row); });

  actions.appendChild(similarBtn);
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
  if (row.classList.contains('bm-card')) {
    // In grid mode, rebuild the whole card
    row.replaceWith(createCard(bm));
    return;
  }
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
        chrome.bookmarks.update(bm.id, { title: bm.rawTitle });
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
    chrome.bookmarks.update(bm.id, { title: bm.rawTitle });
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

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-buttons';

  const save = document.createElement('button');
  save.type = 'submit'; save.className = 'edit-save'; save.textContent = 'Zapisz';

  const isCard = row.classList.contains('bm-card');
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'edit-cancel'; cancel.textContent = 'Anuluj';
  cancel.addEventListener('click', () => {
    row.classList.remove('bm-row--editing');
    row.replaceWith(isCard ? createCard(bm) : createRow(bm));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newTitle = titleIn.value.trim(), newUrl = urlIn.value.trim();
    if (!newTitle || !newUrl) return;
    const snapshot = { type: 'edit', id: bm.id, title: bm.title, rawTitleBefore: bm.rawTitle, urlBefore: bm.url, ts: Date.now() };
    const newRaw = buildRawTitle(newTitle, bm.tags);
    chrome.bookmarks.update(bm.id, { title: newRaw, url: newUrl }, () => {
      historyPush(snapshot);
      bm.title = newTitle; bm.url = newUrl; bm.rawTitle = newRaw;
      row.classList.remove('bm-row--editing');
      row.replaceWith(isCard ? createCard(bm) : createRow(bm));
      showToast(`Zapisano „${newTitle}"`, 'ok', () => {
        undoHistoryEntry(snapshot, () => {
          chrome.bookmarks.getTree((tree) => {
            allBookmarks = flattenBookmarks(tree);
            renderSidebar();
            renderAll();
            showToast('Cofnięto edycję', 'ok');
          });
        });
      });
    });
  });

  btnRow.appendChild(save); btnRow.appendChild(cancel);
  form.appendChild(titleIn); form.appendChild(urlIn); form.appendChild(btnRow);
  row.appendChild(form);
  titleIn.focus(); titleIn.select();
}

// --- Delete ---

let pendingDelete = null;
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalOverlay.hidden) closeModal(); });

modalConfirm.addEventListener('click', () => {
  if (!pendingDelete) return;
  const { id, row } = pendingDelete;
  const bm = allBookmarks.find((b) => b.id === id);
  const snapshot = bm
    ? { type: 'delete', title: bm.title, rawTitle: bm.rawTitle, url: bm.url, ts: Date.now() }
    : null;
  chrome.bookmarks.remove(id, () => {
    if (snapshot) historyPush(snapshot);
    allBookmarks = allBookmarks.filter((b) => b.id !== id);
    row.remove();
    renderSidebar();
    resultsCountEl.textContent = `${allBookmarks.length} zakładek`;
    if (snapshot) {
      showToast(`Usunięto „${snapshot.title}"`, 'ok', () => {
        undoHistoryEntry(snapshot, () => {
          chrome.bookmarks.getTree((tree) => {
            allBookmarks = flattenBookmarks(tree);
            renderSidebar();
            renderAll();
            showToast('Cofnięto usunięcie', 'ok');
          });
        });
      });
    }
  });
  closeModal();
});

function confirmDelete(id, row) {
  const bm = allBookmarks.find((b) => b.id === id);
  modalDesc.textContent = bm ? bm.title : '';
  pendingDelete = { id, row };
  modalOverlay.hidden = false;
  modalConfirm.focus();
}

function closeModal() { modalOverlay.hidden = true; pendingDelete = null; }

// --- Open ---

const ALLOWED = ['http:', 'https:', 'ftp:', 'file:'];

function openBookmark(url) {
  let p;
  try { p = new URL(url); } catch { openErrorPage(url); return; }
  if (!ALLOWED.includes(p.protocol)) { openErrorPage(url); return; }
  chrome.tabs.create({ url });
}

function openErrorPage(u) {
  chrome.tabs.create({ url: `${chrome.runtime.getURL('error.html')}?type=url&value=${encodeURIComponent(u)}` });
}

function openTagsErrorPage(bm) {
  const p = new URLSearchParams({ type: 'tags', value: bm.rawTitle, reason: bm.parseError });
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
    if (allBookmarks.some((b) => b.url === url)) { skipped++; continue; }
    try {
      await new Promise((res, rej) =>
        chrome.bookmarks.create({ title: buildRawTitle(title, tags), url },
          (bm) => chrome.runtime.lastError ? rej() : res(bm)));
      added++;
    } catch { skipped++; }
  }

  chrome.bookmarks.getTree((tree) => {
    allBookmarks = flattenBookmarks(tree);
    renderSidebar(); renderAll();
  });

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

// --- Helpers ---

function highlight(text, query) {
  const e = escapeHtml(text);
  if (!query.trim()) return e;
  const eq = escapeHtml(query);
  return e.replace(new RegExp(escapeRegex(eq), 'gi'), '<mark>$&</mark>');
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function csvRow(fields) {
  return fields.map((f) => {
    const s = String(f ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',');
}

function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = []; let row = [], field = '', inQ = false, i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i+1] === '"') { field += '"'; i += 2; continue; } inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && src[i+1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((f) => f !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
    i++;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
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

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// --- SVG icons ---

function svgEdit() {
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}
function svgTrash() {
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M7 6v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function svgCopy() {
  return `<svg viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}
function svgCheck() {
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M4 10l5 5 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function svgLabel() {
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M3 10L10 3h7v7l-7 7-7-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="13.5" cy="6.5" r="1" fill="currentColor"/></svg>`;
}
// --- Duplicates ---

const TRACKING = new Set([
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
      if (TRACKING.has(k) || k.startsWith('utm_')) u.searchParams.delete(k);
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
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M10 7v4M10 13h.01M8.57 2.9L1.52 15a1.67 1.67 0 0 0 1.43 2.5h14.1A1.67 1.67 0 0 0 18.48 15L11.43 2.9a1.67 1.67 0 0 0-2.86 0z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function svgAI() {
  return `<svg viewBox="0 0 20 20" fill="none"><path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 15l-1.5-4.5L4 8l4.5-1.5L10 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M16 2l.8 2L19 5l-2.2.8L16 8l-.8-2.2L13 5l2.2-.8L16 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
}
