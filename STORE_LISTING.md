# Chrome Web Store — materiały do publikacji

---

## Krótki opis *(maks. 132 znaki)*

```
Przeglądaj, wyszukuj i porządkuj zakładki za pomocą etykiet. Historia zmian, cofanie i wykrywanie duplikatów.
```

*(109 znaków)*

---

## Szczegółowy opis

```
Ponad Kodem — Zakładki to rozszerzenie dla osób, które mają dużo zakładek i chcą je sprawnie ogarnąć — bez zakładania kont, bez chmury, bez reklam.

━━━ JAK DZIAŁAJĄ ETYKIETY ━━━

Etykiety przechowywane są bezpośrednio w tytule zakładki według prostej konwencji:

    Nazwa strony | etykieta1, etykieta2

Dzięki temu etykiety synchronizują się automatycznie przez konto Google razem z zakładkami — bez żadnego dodatkowego magazynu danych. Wystarczy raz nadać etykiety, a będą dostępne na każdym urządzeniu.

━━━ CO OFERUJE ROZSZERZENIE ━━━

🔍 Wyszukiwanie w czasie rzeczywistym
Wyszukuje po tytule i URL — nie tylko od początku, ale też w środku i na końcu tekstu.

🏷 Etykiety i filtrowanie
Dodawaj etykiety bezpośrednio z listy zakładek. Formularz podpowiada istniejące i ostatnio używane etykiety. Kliknij etykietę, aby przefiltrować widok.

📥 Inbox
Osobny widok pokazuje zakładki bez etykiet, aby można było szybko uporządkować nowe wpisy.

✅ Operacje masowe
Zaznacz wiele zakładek i jednym działaniem dodaj etykiety, przenieś je do folderu Chrome albo usuń.

↩ Historia zmian z cofaniem (Undo)
Każde usunięcie, edycja i zmiana etykiety jest rejestrowana. Możesz cofnąć operację przyciskiem w powiadomieniu (6 sekund) lub z panelu historii w widoku pełnym.

⚠ Wykrywanie duplikatów
Automatycznie porównuje adresy URL, ignorując www, parametry śledzące (UTM, fbclid itp.) i kotwice #. Przy dodawaniu nie tworzy kolejnej kopii — pozwala uzupełnić etykiety istniejącej zakładki.

📋 Eksport i import CSV
Pobierz wszystkie zakładki jako plik .csv (kompatybilny z Excel) lub wczytaj zakładki z zewnętrznego pliku. Format: tytuł, URL, etykiety.

⌨ Skróty klawiaturowe
Alt+Shift+B — otwórz popup
Alt+Shift+D — zapisz aktywną stronę jako zakładkę z paskiem narzędzi
J/K — poruszaj się po pełnym widoku
X — zaznacz zakładkę do operacji masowej

🧭 Dwa tryby pracy
Mały popup służy do wyszukiwania, otwierania, kopiowania i dodawania zakładek. Pełny widok zawiera edycję, usuwanie, porządkowanie duplikatów oraz import i eksport.

🖼 Favicony na liście
Wyświetla ikonę domeny przy każdej zakładce na liście.

━━━ PRYWATNOŚĆ ━━━

Dane zakładek, historia zmian i ustawienia są przechowywane lokalnie. Po włączeniu favicon domena zakładki jest wysyłana do usługi favicon Google.
```

---

## Kategoria i tagi

- **Kategoria:** Produktywność
- **Tagi sugerowane:** zakładki, bookmarks, etykiety, tags, organizer, produktywność, wyszukiwanie, menedżer zakładek

---

## Opis w języku angielskim *(opcjonalny, dla szerszego zasięgu)*

**Krótki:**
```
Search, tag and organize Chrome bookmarks. Includes duplicate detection, change history with undo, and CSV import and export.
```
*(125 znaków)*

**Szczegółowy:**
```
Ponad Kodem Bookmarks is a no-account, no-cloud extension for people with large bookmark collections who want to keep them organized.

━━━ HOW TAGS WORK ━━━

Tags are stored directly inside the bookmark title using a simple convention:

    Page Name | tag1, tag2

This means tags automatically sync across your devices via your Google account — no extra storage, no external servers.

━━━ FEATURES ━━━

🔍 Real-time search — searches title and URL, including mid-word matches

🏷 Labels & filtering — add tags inline with suggestions for existing and recently used tags

📥 Inbox — review all bookmarks without tags in one focused view

✅ Bulk actions — add tags, move to a Chrome folder, or delete multiple selected bookmarks

↩ Change history with Undo — every deletion, edit and tag change is logged; undo from a 6-second toast or the history sidebar

⚠ Duplicate prevention and detection — prevents duplicate additions and groups existing duplicates for cleanup

📋 CSV export / import — download all bookmarks as a .csv file or import from one; Excel-compatible with UTF-8 BOM

⌨ Keyboard shortcuts — Alt+Shift+B to open, Alt+Shift+D to save, J/K to navigate, and X to select

🧭 Two focused views — a quick popup for search, open, copy, and add; a full-page view for organization and destructive actions

🖼 Favicons in list — shows domain icon next to each bookmark in list view

━━━ PRIVACY ━━━

Bookmark data, change history, and settings are stored locally. When favicons are enabled, bookmark domains are sent to Google's favicon service.
```

---

## Uprawnienia — uzasadnienie *(wymagane przy publikacji)*

| Uprawnienie | Powód |
|---|---|
| `bookmarks` | Odczyt, tworzenie, edycja i usuwanie zakładek Chrome |
| `tabs` | Pobieranie URL aktywnej karty przy zapisywaniu skrótem Alt+Shift+D |
| `storage` | Zapisywanie historii zmian, ostatnio używanych etykiet i ustawień lokalnie w przeglądarce |
| `host_permissions: https://www.google.com/*` | Opcjonalne pobieranie faviconów domen z usługi Google |
