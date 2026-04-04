'use strict';

const params = new URLSearchParams(location.search);
const type   = params.get('type') || 'url';
const value  = params.get('value') || '';
const reason = params.get('reason') || '';
const card   = document.getElementById('card');

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (type === 'url') {
  card.appendChild(el('div', 'icon icon--url',
    `<svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  ));
  card.appendChild(el('h1', null, 'Nie można otworzyć zakładki'));
  card.appendChild(el('p', 'subtitle', 'Adres URL tej zakładki jest nieprawidłowy lub używa niedozwolonego protokołu.'));
  card.appendChild(el('p', 'label', 'Problematyczny adres'));
  card.appendChild(el('div', 'value-box value-box--url', escapeHtml(value)));
  card.appendChild(el('p', 'hint',
    'Otwórz <strong>Bookmarks Manager</strong>, znajdź tę zakładkę i popraw jej adres URL.'
  ));
} else {
  card.appendChild(el('div', 'icon icon--tags',
    `<svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  ));
  card.appendChild(el('h1', null, 'Nieprawidłowy format etykiet'));
  card.appendChild(el('p', 'subtitle', 'Nazwa zakładki zawiera sekcję etykiet (<code> | </code>), ale jej format jest błędny.'));
  card.appendChild(el('p', 'label', 'Pełna nazwa zakładki'));
  card.appendChild(el('div', 'value-box value-box--raw', escapeHtml(value)));
  card.appendChild(el('p', 'label', 'Przyczyna'));
  card.appendChild(el('div', 'value-box value-box--warn', escapeHtml(reason)));
  card.appendChild(el('p', 'hint',
    'Poprawny format to: <strong>Tytuł | etykieta1, etykieta2</strong>'
  ));
  card.appendChild(el('div', 'example', escapeHtml('GitHub | dev, tools')));
}
