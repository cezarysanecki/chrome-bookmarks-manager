# Chrome Web Store — materiały do publikacji

---

## Krótki opis *(maks. 132 znaki)*

```
Przeglądaj, wyszukuj i porządkuj zakładki za pomocą etykiet. Historia zmian, wykrywanie duplikatów i opcjonalne AI.
```

*(118 znaków)*

---

## Szczegółowy opis

```
Bookmarks Manager to rozszerzenie dla osób, które mają dużo zakładek i chcą je sprawnie ogarnąć — bez zakładania kont, bez chmury, bez reklam.

━━━ JAK DZIAŁAJĄ ETYKIETY ━━━

Etykiety przechowywane są bezpośrednio w tytule zakładki według prostej konwencji:

    Nazwa strony | etykieta1, etykieta2

Dzięki temu etykiety synchronizują się automatycznie przez konto Google razem z zakładkami — bez żadnego dodatkowego magazynu danych. Wystarczy raz nadać etykiety, a będą dostępne na każdym urządzeniu.

━━━ CO OFERUJE ROZSZERZENIE ━━━

🔍 Wyszukiwanie w czasie rzeczywistym
Wyszukuje po tytule i URL — nie tylko od początku, ale też w środku i na końcu tekstu.

🏷 Etykiety i filtrowanie
Dodawaj etykiety bezpośrednio z listy zakładek. Kliknij etykietę, aby przefiltrować widok. W pełnoekranowym widoku lewy panel zestawia wszystkie etykiety z liczbą zakładek.

↩ Historia zmian z cofaniem (Undo)
Każde usunięcie, edycja i zmiana etykiety jest rejestrowana. Możesz cofnąć operację przyciskiem w powiadomieniu (6 sekund) lub z panelu historii w widoku pełnym.

⚠ Wykrywanie duplikatów
Automatycznie porównuje adresy URL, ignorując www, parametry śledzące (UTM, fbclid itp.) i kotwice #. Duplikaty grupowane są do szybkiego przejrzenia i usunięcia.

🔗 Podobne zakładki
Jeden klik pokazuje zakładki z tej samej domeny lub o zbliżonym tytule — idealne do odkrywania powtórzeń i porządkowania kolekcji.

📋 Eksport i import CSV
Pobierz wszystkie zakładki jako plik .csv (kompatybilny z Excel) lub wczytaj zakładki z zewnętrznego pliku. Format: tytuł, URL, etykiety.

⌨ Skróty klawiaturowe
Ctrl+Shift+B — otwórz popup
Ctrl+Shift+D — zapisz aktywną stronę jako zakładkę z paskiem narzędzi

🖼 Dwa widoki
Lista klasyczna lub siatka kafelków z ikoną domeny — do wyboru w widoku pełnoekranowym.

━━━ OPCJONALNE (domyślnie wyłączone) ━━━

🌐 Sprawdzanie martwych linków
Weryfikuje dostępność zakładek przez żądania HEAD. Niedostępne oznaczane są plakietką. Uwaga: przy dużej liczbie zakładek może spowolnić działanie.

✨ Sugestie etykiet AI (wymaga klucza OpenAI)
Po włączeniu i wpisaniu klucza API przycisk gwiazdki przy zakładce wysyła tytuł i URL do GPT-4o mini, który proponuje etykiety jako klikalne chipsy.

🖼 Favicony na liście
Wyświetla ikonę domeny przy każdej zakładce na liście.

━━━ PRYWATNOŚĆ ━━━

Żadne dane nie opuszczają Twojej przeglądarki — z wyjątkiem opcjonalnych wywołań OpenAI API (tylko gdy funkcja AI jest aktywna). Historia zmian i ustawienia zapisywane są lokalnie.
```

---

## Kategoria i tagi

- **Kategoria:** Produktywność
- **Tagi sugerowane:** zakładki, bookmarks, etykiety, tags, organizer, produktywność, wyszukiwanie, menedżer zakładek

---

## Opis w języku angielskim *(opcjonalny, dla szerszego zasięgu)*

**Krótki:**
```
Search, tag and organize your Chrome bookmarks. Duplicate detection, change history with undo, and optional AI tag suggestions.
```
*(114 znaków)*

**Szczegółowy:**
```
Bookmarks Manager is a no-account, no-cloud extension for people with large bookmark collections who want to keep them organized.

━━━ HOW TAGS WORK ━━━

Tags are stored directly inside the bookmark title using a simple convention:

    Page Name | tag1, tag2

This means tags automatically sync across your devices via your Google account — no extra storage, no external servers.

━━━ FEATURES ━━━

🔍 Real-time search — searches title and URL, including mid-word matches

🏷 Labels & filtering — add tags inline, click any tag to filter the list; full-page view shows a tag sidebar with counts

↩ Change history with Undo — every deletion, edit and tag change is logged; undo from a 6-second toast or the history sidebar

⚠ Duplicate detection — compares normalized URLs (strips www, UTM params, anchors); groups duplicates for easy cleanup

🔗 Similar bookmarks — one click shows bookmarks from the same domain or with matching title keywords

📋 CSV export / import — download all bookmarks as a .csv file or import from one; Excel-compatible with UTF-8 BOM

⌨ Keyboard shortcuts — Ctrl+Shift+B to open, Ctrl+Shift+D to save current tab

🖼 Grid view — switch between list and card grid in the full-page view

━━━ OPTIONAL FEATURES (off by default) ━━━

🌐 Dead link checker — sends HEAD requests to verify bookmark availability; marks unreachable links
✨ AI tag suggestions — requires OpenAI API key; uses GPT-4o mini to suggest tags per bookmark
🖼 Favicons in list — shows domain icon next to each bookmark in list view

━━━ PRIVACY ━━━

No data leaves your browser except optional OpenAI API calls when AI is enabled. Settings and history stored locally only.
```

---

## Uprawnienia — uzasadnienie *(wymagane przy publikacji)*

| Uprawnienie | Powód |
|---|---|
| `bookmarks` | Odczyt, tworzenie, edycja i usuwanie zakładek Chrome |
| `tabs` | Pobieranie URL aktywnej karty przy zapisywaniu skrótem Ctrl+Shift+D |
| `storage` | Zapisywanie historii zmian i ustawień lokalnie w przeglądarce |
| `host_permissions: <all_urls>` | Sprawdzanie dostępności zakładek (martwe linki) oraz pobieranie faviconów i opcjonalne wywołania OpenAI API |
