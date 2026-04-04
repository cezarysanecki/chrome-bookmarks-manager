# Bookmarks Manager — rozszerzenie Chrome

Prywatny menedżer zakładek działający bezpośrednio w przeglądarce. Umożliwia szybkie wyszukiwanie, porządkowanie za pomocą etykiet, eksport danych oraz opcjonalne funkcje AI — bez żadnych zewnętrznych kont ani synchronizacji w chmurze.

---

## Instalacja

1. Pobierz lub sklonuj repozytorium na swój komputer.
2. Otwórz Chrome i przejdź do `chrome://extensions`.
3. Włącz **Tryb dewelopera** (prawy górny róg).
4. Kliknij **Wczytaj rozpakowane** i wskaż folder z rozszerzeniem.
5. Ikona pojawi się na pasku narzędzi przeglądarki.

---

## Szybki start

| Akcja | Jak |
|---|---|
| Otwórz menedżer | Kliknij ikonę na pasku **lub** `Ctrl+Shift+B` |
| Dodaj zakładkę z aktywnej strony | `Ctrl+Shift+D` |
| Otwórz widok pełnoekranowy | Przycisk **Widok** w popupie |
| Wyszukaj zakładkę | Zacznij pisać — wyniki filtrują się w czasie rzeczywistym |

---

## Funkcje

### Wyszukiwanie
Wyszukiwanie działa na **całym tytule i URL** — nie tylko od początku, ale też w środku i na końcu tekstu. Wystarczy wpisać fragment.

### Etykiety
Zakładki można oznaczać etykietami w celu grupowania tematycznego. Format w tytule:

```
Nazwa strony | etykieta1, etykieta2
```

- Kliknij ikonę **etykiety** (znaczek) przy zakładce, aby dodać lub usunąć etykiety.
- Kliknij etykietę na liście, aby przefiltrować wyłącznie zakładki z tą etykietą.
- W widoku pełnym — lewy panel pokazuje wszystkie etykiety z liczbą zakładek.

### Edycja i usuwanie
Najedź kursorem na zakładkę, aby zobaczyć przyciski akcji:
- **Edytuj** — zmień tytuł i URL bezpośrednio na liście.
- **Usuń** — pojawi się okno potwierdzenia. Po usunięciu masz **6 sekund** na cofnięcie akcji przyciskiem **Cofnij** w powiadomieniu.

### Historia zmian i cofanie (Undo)
Każde usunięcie, edycja i zmiana etykiety jest rejestrowana. W widoku pełnym lewy panel zawiera sekcję **Historia** z ostatnimi 10 operacjami — każdą można cofnąć przyciskiem `↩`.

### Kopiowanie linku
Ikona kopiowania jest zawsze widoczna przy każdej zakładce — kliknięcie natychmiast kopiuje adres URL do schowka.

### Podobne zakładki
Przycisk **Podobne** (ikona grafu) przy zakładce filtruje listę do zakładek z tej samej domeny lub o zbliżonym tytule — przydatne do odkrywania duplikatów tematycznych.

### Wykrywanie duplikatów URL
Rozszerzenie automatycznie porównuje adresy URL (ignorując `www`, parametry śledzące, kotwice `#`). Jeśli wykryje duplikaty:
- W popupie pojawi się żółty pasek z liczbą duplikatów i przyciskiem **Pokaż**.
- W widoku pełnym — pozycja **Duplikaty** w lewym panelu grupuje je do przejrzenia i usunięcia.

### Eksport i import CSV
- **Eksport** — pobiera plik `.csv` z tytułami, URL-ami i etykietami wszystkich zakładek (kompatybilny z Excel).
- **Import** — wczytuje plik `.csv` w tym samym formacie; zakładki już istniejące są pomijane.

Format kolumn: `title`, `url`, `tags` (etykiety oddzielone średnikiem).

### Sortowanie
Zarówno popup jak i widok pełny oferują sortowanie listy:
- Domyślna kolejność (z Chrome)
- A → Z
- Z → A
- Według domeny

### Widok siatki
W widoku pełnym przycisk **Siatka** przełącza listę na kafelki z ikoną domeny, tytułem i etykietami.

---

## Ustawienia (widok pełny → przycisk Ustawienia)

### Favicon przy zakładkach *(domyślnie wyłączone)*
Wyświetla ikonę domeny obok każdej zakładki na liście. W widoku siatki ikony są zawsze widoczne.

### Sprawdzanie martwych linków *(domyślnie wyłączone)*
Przy każdym otwarciu widoku pełnego rozszerzenie sprawdza dostępność wszystkich zakładek (żądania HEAD, timeout 6 s). Niedostępne zakładki oznaczane są plakietką **Niedostępny**.

> **Uwaga:** przy dużej liczbie zakładek może znacznie spowolnić działanie. Dostępny też przycisk **Sprawdź teraz** do ręcznego uruchomienia.

### Sugestie etykiet AI *(domyślnie wyłączone, wymaga klucza OpenAI)*
Po włączeniu i podaniu klucza API przy każdej zakładce pojawi się przycisk gwiazdki. Kliknięcie wysyła tytuł i URL do modelu **GPT-4o mini** i zwraca propozycje etykiet jako klikalne chipsy — wystarczy kliknąć, aby dodać etykietę.

Klucz OpenAI przechowywany jest wyłącznie lokalnie w przeglądarce i trafia tylko do serwera OpenAI.

---

## Skróty klawiaturowe

| Skrót | Działanie |
|---|---|
| `Ctrl+Shift+B` | Otwórz/zamknij popup menedżera |
| `Ctrl+Shift+D` | Zapisz aktywną stronę jako zakładkę |
| `/` | Skup fokus na polu wyszukiwania (widok pełny) |
| `Escape` | Zamknij modal / wyczyść wyszukiwanie |

---

## Prywatność i bezpieczeństwo

- Wszystkie dane zakładek pozostają w Chrome — żadne informacje nie są wysyłane na zewnętrzne serwery (z wyjątkiem opcjonalnych wywołań OpenAI API, gdy funkcja AI jest włączona).
- Etykiety są przechowywane bezpośrednio w tytule zakładki Chrome — synchronizują się automatycznie między urządzeniami przez konto Google, bez dodatkowej infrastruktury.
- Historia zmian i ustawienia zapisywane są lokalnie (`chrome.storage.local`) i nie opuszczają przeglądarki.
