# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-12

## 1. Strategy

Testy w tym projekcie podlegają trzem regułom, od których nie ma odstępstw:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał dla danego ryzyka. Nie awansujemy testu do E2E dlatego, że "tak bezpieczniej". Nie dokładamy warstwy nad deterministycznym sprawdzeniem, które i tak wyłapuje regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyko zakotwiczone w "boimy się X, awaria wyszłaby gdzieś w obszarze Y" waży tyle samo co linia z PRD czy dane o zmienności kodu.
3. **Ryzyka to scenariusze, nie lokalizacje w kodzie.** Ten plan opisuje _co może zawieść_ i _dlaczego uważamy to za prawdopodobne_ — na podstawie dokumentów, rozmowy i sygnału z repozytorium (zmienność, struktura, stan testów). NIE twierdzi, że wie, która linia odpowiada za awarię. Tę wiedzę produkuje `/10x-research` w ramach każdej fazy wdrożenia. Jeśli plan i research nie zgadzają się co do tego, gdzie mieszka awaria — prawdą jest research.

Zakres skanowania zmienności użyty do ważenia prawdopodobieństwa: `src/`, `supabase/`.
**Zastrzeżenie:** historia gita to jeden commit (bootstrap, 2026-09-08) — poniżej progu 5 commitów/30 dni. Skan zmienności nie dał sygnału; oceny prawdopodobieństwa opierają się wyłącznie na PRD, roadmapie i stanie artefaktów. Nie przeprowadzono też wywiadu z użytkownikiem (Faza 2 procedury) — to jest znany, jawny brak tego planu i pierwsza rzecz do uzupełnienia przy `--refresh`.

**Stan bazowy — uczciwie.** Zaktualizowane 2026-09-13. 150 testów jednostkowych w czterech plikach (reguła pilności, warstwa danych na ręcznej atrapie klienta bazy, kontrakt endpointów, konwersja terminów) oraz **8 testów integracyjnych wobec prawdziwej instancji Supabase** (`src/lib/rls.itest.ts`, osobny runner `npm run test:integration`). Zero testów E2E — żaden test nie przechodzi przez prawdziwe żądanie HTTP do aplikacji ani przez przeglądarkę; testy integracyjne rozmawiają z bazą bezpośrednio, z pominięciem warstwy Astro. Profil bazy testowej: `sparse` — testy skupione w `src/lib/`, strony, middleware i komponenty bez pokrycia automatycznego.

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane wg ryzyka = wpływ × prawdopodobieństwo. Ryzyka są opisane jako awarie widziane przez użytkownika, nie jako nazwy testów. Kolumna źródła cytuje _dowód, który wyniósł ryzyko na tę listę_ — nigdy pliku jako "miejsca, gdzie mieszka awaria" (§1, reguła 3).

| #   | Ryzyko (scenariusz awarii)                                                                                                                                                                                                                                          | Wpływ  | Prawdop. | Źródło (dowód, nie kotwica)                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Użytkownik loguje się na wdrożonej aplikacji i zamiast swoich zadań widzi pustkę albo komunikat o braku konfiguracji — sekrety bazy nie dojechały do środowiska hostingu albo migracja nigdy nie została tam wykonana.                                              | High   | High     | `roadmap.md` §Baseline (Data i Deploy — `partial`); `decisions-log.md` krok 6 (deployment niewykonany); `health-check.md` (krok build wymaga sekretów)                                                           |
| 2   | Zalogowany użytkownik widzi lub edytuje cudze zadania, bo polityka RLS nie objęła danej operacji albo nie jest aktywna na realnej bazie — warstwa danych świadomie nie dokłada własnego filtra po właścicielu, więc nie ma drugiej linii obrony.                    | High   | Medium   | PRD §Guardrails i US-05 ("nigdy nie są widoczne dla innego użytkownika"); `AGENTS.md` §Hard rules (RLS obowiązkowe); `roadmap.md` F-02 (polityki nigdy nie wykonane na serwerze)                                 |
| 3   | Użytkownik wpisuje termin "jutro 9:00", a zapisany moment jest przesunięty o offset jego strefy — flaga pilności zapala się lub gaśnie o kilka godzin obok terminu, który widzi na ekranie.                                                                         | High   | Medium   | PRD §Business Logic i US-02 (próg liczony od bieżącego momentu); `roadmap.md` S-02 (konwersja strefy świadomie po stronie przeglądarki); brak testów przekraczających granicę HTTP                               |
| 4   | Zadanie "miga": tuż po otwarciu strony ma inną flagę niż po chwili, bo pilność jest liczona dwa razy — raz przy renderze po stronie serwera (zegar UTC), raz w przeglądarce (zegar użytkownika). Przy rozjeździe zegarów lub tuż przy granicy wynik jest niespójny. | Medium | High     | PRD US-02 (flaga wyliczana przy każdym wyświetleniu, nie zapisywana); `roadmap.md` S-03 §Risk (dwa niezależne momenty odniesienia)                                                                               |
| 5   | Nieudana rejestracja lub logowanie ujawnia, czy dany adres e-mail jest już zarejestrowany — komunikat dostawcy uwierzytelniania trafia do użytkownika w oryginalnym brzmieniu.                                                                                      | Medium | Medium   | PRD §NFR ("nieudane logowanie nie ujawnia, czy adres jest zarejestrowany"); `roadmap.md` S-01 §Risk (kod uwierzytelniania przyjęty ze startera bez przeglądu)                                                    |
| 6   | Zadanie przeterminowane albo z terminem dokładnie na granicy 48h przestaje być pokazywane jako pilne i użytkownik przegapia termin — czyli dokładnie to, przed czym produkt ma chronić.                                                                             | High   | Low      | PRD US-02 §Kryteria akceptacji i §Open Questions p. 1; `roadmap.md` F-03 (69 testów jednostkowych pokrywa obie strony granicy — ryzyko rezydualne leży na drodze wartości przez API i ekran, nie w samej regule) |
| 7   | Użytkownik bezpowrotnie traci zadanie: potwierdzenie usunięcia da się ominąć (podwójne kliknięcie, żądanie wprost do API), albo ukończone zadanie znika z jedynej listy bez drogi powrotu.                                                                          | High   | Low      | PRD §Guardrails ("ukończenie nigdy nie usuwa w tle"), US-03 i US-04 §Kryteria akceptacji; `roadmap.md` §Open Roadmap Questions p. 3 (brak osobnego widoku ukończonych)                                           |

Wysoki wpływ × niskie prawdopodobieństwo (np. awaria dostawcy bazy) świadomie nie trafia na tę listę — to materiał na obserwowalność po deploymencie, nie na test.

### Risk Response Guidance

| Ryzyko | Co dowiedzie ochrony                                                                                                                                          | Co trzeba podważyć                                                                                                    | Kontekst, który musi ugruntować `/10x-research`                                                                                                      | Najtańsza prawdopodobna warstwa                                              | Antywzorzec do uniknięcia                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| #1     | Zapis zadania i jego ponowny odczyt po restarcie procesu dają ten sam wiersz; brak konfiguracji kończy się jawnym, rozpoznawalnym błędem, a nie pustą listą.  | Że "pusta lista" znaczy "użytkownik nie ma zadań". Może znaczyć: brak sekretów, odmowa RLS albo niewykonana migracja. | Jak wygląda ścieżka startu bez konfiguracji, jaki błąd dostaje użytkownik, jak środowisko hostingu dostarcza sekrety.                                | integracyjny + ręczny smoke po deployu                                       | Test, który mockuje klienta bazy i przez to nie odróżnia "baza nieskonfigurowana" od "brak wierszy".                         |
| #2     | Konto B nie odczyta, nie zmieni i nie usunie zadania konta A — dla każdej z czterech operacji osobno, przez prawdziwą politykę bazy.                          | Że test happy-path na jednym koncie cokolwiek mówi o izolacji. Że "zalogowany" znaczy "właściciel".                   | Jak sesja zamienia się na tożsamość w zapytaniu, które operacje mają własną politykę, co zwraca baza przy odmowie (błąd czy 0 wierszy).              | integracyjny na prawdziwej instancji bazy                                    | Mockowanie klienta bazy — atrapa zawsze przepuści zapytanie, bo RLS w niej nie istnieje. To test, który zawsze jest zielony. |
| #3     | Termin wpisany w strefie użytkownika daje na liście tę samą godzinę i tę samą flagę, co wpisano — także dla strefy innej niż strefa serwera.                  | Że konwersja "działa", bo działa na maszynie w tej samej strefie co serwer. Że napis bez strefy jest jednoznaczny.    | Gdzie napis z formularza zamienia się w moment absolutny i w którą stronę; jaka strefa obowiązuje w środowisku uruchomieniowym.                      | integracyjny (kontrakt żądanie → zapisany moment)                            | Asercja z oczekiwaną wartością wyliczoną tą samą konwersją, którą testujemy — test tautologiczny, zielony także dla błędu.   |
| #4     | Flaga widziana zaraz po otwarciu strony i flaga po odświeżeniu momentu są tą samą decyzją dla tych samych danych i zbliżonego czasu.                          | Że skoro reguła jest czysta i przetestowana, to jej dwa wywołania w dwóch środowiskach dadzą ten sam wynik.           | Ile razy i wobec jakiego momentu odniesienia liczona jest flaga na drodze od bazy do ekranu; co dzieje się przy przejęciu strony przez przeglądarkę. | integracyjny; E2E dopiero gdy problem jest widoczny wyłącznie w przeglądarce | Snapshot całego ekranu zamiast asercji na jednej decyzji — złapie każdą zmianę stylu i żadnej zmiany reguły.                 |
| #5     | Nieudane logowanie i rejestracja na adres już istniejący dają komunikat, z którego nie da się wywnioskować, czy konto istnieje.                               | Że skoro kod uwierzytelniania pochodzi ze startera, to spełnia wymagania niefunkcjonalne tego PRD.                    | Jak komunikat błędu dostawcy dociera do użytkownika i czy po drodze jest tłumaczony lub ujednolicany.                                                | ręczny smoke + jeden test kontraktu odpowiedzi                               | Asercja na dokładną treść komunikatu dostawcy — przy zmianie brzmienia test pada bez żadnej regresji produktu.               |
| #6     | Zadanie na granicy progu i zadanie po terminie są oznaczone jako pilne na ekranie, nie tylko w regule — dla danych, które przeszły przez zapis i odczyt.      | Że pokrycie reguły jednostkowo oznacza poprawność produktu. Wartość może zgubić się między bazą, API i ekranem.       | Czy na drodze do ekranu wartość terminu jest gdziekolwiek obcinana, formatowana lub przeliczana.                                                     | integracyjny na istniejącej regule; bez nowego unitu                         | Dokładanie kolejnych wariantów testu jednostkowego reguły — ta warstwa jest już nasycona, nowe przypadki nie dodają sygnału. |
| #7     | Usunięcie następuje wyłącznie po jawnym potwierdzeniu, a ukończenie jest odwracalne i nie kasuje wiersza — sprawdzone także dla żądania z pominięciem ekranu. | Że potwierdzenie w interfejsie jest zabezpieczeniem. API jest osiągalne bez niego.                                    | Co dokładnie jest trwale usuwane, co jest odwracalne i czy istnieje ścieżka powrotu dla zadania ukończonego.                                         | integracyjny na poziomie API + E2E dla potwierdzenia                         | Test sprawdzający, że przycisk otwiera okno potwierdzenia — to test interfejsu, nie utraty danych.                           |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrożenia, która otworzy własny folder zmiany przez `/10x-new`. Status przesuwa się od lewej do prawej; orkiestrator aktualizuje go, gdy artefakty pojawiają się na dysku.

| #   | Phase name                        | Goal (one line)                                                                                  | Risks covered   | Test types            | Status                                                                                     | Change folder |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- | --------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| 1   | Izolacja i trwałość danych        | Udowodnić, że dane przeżywają zapis na prawdziwej bazie i że konto B nie sięgnie zadań konta A   | #1, #2          | integration           | częściowo — #2 pokryte (`src/lib/rls.itest.ts`), #1 nie                                    | —             |
| 2   | Reguła czasu poza modułem czystym | Udowodnić, że termin i flaga pilności przetrwają drogę formularz → zapis → odczyt → ekran        | #3, #4, #6      | integration, contract | częściowo — #3 i #6 pokryte na ścieżce zapis → odczyt, #4 (rozjazd SSR ↔ przeglądarka) nie | —             |
| 3   | Kluczowy przepływ w przeglądarce  | Udowodnić przepływ z US-01/US-02/US-05 bez ręcznego klikania, wraz z nieodwracalnością usunięcia | #2, #7          | e2e                   | not started                                                                                | —             |
| 4   | Bramki i higiena dostępu          | Zablokować regresję w CI i domknąć wymaganie o nieujawnianiu istnienia konta                     | #5, przekrojowe | gates, manual smoke   | not started                                                                                | —             |

Ryzyko #7 (nieodwracalna utrata zadania) zostało pokryte poza swoją fazą — test „ukończenie nie kasuje wiersza i daje się cofnąć" wszedł razem z Fazą 1, bo korzysta z tej samej infrastruktury dwóch kont. W Fazie 3 zostaje z niego wyłącznie potwierdzenie usunięcia w interfejsie.

Faza 3 jest warunkowa — zależy od decyzji z `roadmap.md` §Open Roadmap Questions p. 4 (czy E2E wchodzi w zakres MVP). Jeśli odpowiedź brzmi "nie", fazę zamyka się z jednolinijkową notatką o pominięciu, a jej ryzyka zostają przy Fazach 1 i 2 plus ręczny smoke.

## 4. Stack

Klasyczna baza testowa projektu. Wersje odczytane z manifestu i plików konfiguracyjnych repozytorium na dzień 2026-09-12.

| Warstwa                    | Narzędzie                                     | Wersja | Uwagi                                                                                                    |
| -------------------------- | --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| jednostkowe + integracyjne | Vitest                                        | 5.0.0  | `npm test` (jednorazowo), `npm run test:watch`. Środowisko `node`, `globals: false` — importy jawne.     |
| pokrycie                   | @vitest/coverage-v8                           | 5.0.0  | `npm run test:coverage`. Skonfigurowane, ale **bez progu** — nic nie pada przy spadku pokrycia.          |
| mockowanie API             | brak — ręczna atrapa klienta bazy             | n/a    | Świadoma decyzja z `AGENTS.md`: bez dodatkowych bibliotek. Atrapa nie zna RLS — patrz ryzyko #2.         |
| integracyjne z bazą        | brak — patrz §3 Faza 1                        | n/a    | Wymaga lokalnej instancji bazy (CLI dostawcy jest już zależnością dev) albo osobnego projektu testowego. |
| e2e                        | brak — patrz §3 Faza 3                        | n/a    | Narzędzie nie zostało wybrane; wybór należy do fazy, nie do tego planu.                                  |
| lint + typy                | ESLint 9 + typescript-eslint 8 + Prettier 3.8 | —      | `npm run lint`, `npm run format`. `tsconfig` w trybie `strict`, typecheck przez `astro sync` w CI.       |
| dostępność                 | eslint-plugin-jsx-a11y                        | 6.10.2 | Wyłącznie analiza statyczna. Brak `axe-core` i brak testów dostępności w czasie wykonania.               |
| hooki lokalne              | husky 9 + lint-staged 16                      | —      | Pre-commit uruchamia lint i formatowanie. **Nie uruchamia testów.**                                      |

**Stack grounding tools (current session):**

- Docs: brak (Context7 ani żaden MCP z dokumentacją nie jest dostępny w tej sesji) — wersje i komendy odczytane bezpośrednio z `package.json`, `vitest.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml`; checked: 2026-09-12
- Search: brak dedykowanego MCP wyszukiwania (Exa niedostępny); ogólne wyszukiwanie webowe dostępne w sesji, ale nieużyte — żadna rekomendacja w tym planie nie wymagała weryfikacji poza repozytorium; checked: 2026-09-12
- Runtime/browser: brak (żadnego MCP sterującego przeglądarką) — dobór narzędzia E2E musi nastąpić w §3 Fazie 3; checked: 2026-09-12
- Provider/platform: brak MCP dla dostawcy bazy, hostingu i repozytorium — weryfikacja środowiska w Fazach 1 i 4 będzie ręczna; checked: 2026-09-12

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść, zanim zmiana trafi na produkcję. "Wymagane po §3 Fazie N" znaczy, że bramka zaczyna obowiązywać po wdrożeniu tej fazy; wcześniej jej stan to `planned`.

| Bramka                                 | Gdzie               | Wymagana?              | Co łapie                                                          |
| -------------------------------------- | ------------------- | ---------------------- | ----------------------------------------------------------------- |
| lint + formatowanie (pre-commit)       | lokalnie            | wymagana (działa)      | dryf stylu i część błędów typowych przed commitem                 |
| lint + typecheck                       | CI                  | wymagana (działa)      | dryf składni i typów                                              |
| testy jednostkowe                      | lokalnie + CI       | wymagana (działa)      | regresje reguły pilności i walidacji w warstwie danych            |
| build produkcyjny                      | CI                  | wymagana (działa)      | błędy budowania i brakujące sekrety budowania                     |
| testy integracyjne na prawdziwej bazie | CI                  | wymagana po §3 Fazie 1 | wyciek między kontami, cicha odmowa RLS, nietrwały zapis          |
| test kontraktu czasu i strefy          | CI                  | wymagana po §3 Fazie 2 | przesunięty termin, niespójna flaga pilności                      |
| e2e kluczowego przepływu               | CI na PR            | wymagana po §3 Fazie 3 | przerwany przepływ US-01/US-02/US-05 widziany przez użytkownika   |
| audyt zależności                       | CI                  | wymagana po §3 Fazie 4 | nowe podatności; dzisiejsze 2 HIGH są świadomie odłożone          |
| smoke po deployu                       | między merge a prod | wymagana po §3 Fazie 4 | awarie zależne od środowiska: brak sekretów, niewykonana migracja |

Próg pokrycia celowo nie jest bramką — przy 69 testach skupionych w jednym katalogu liczba procentowa mierzyłaby kształt repozytorium, nie ochronę przed regresją.

## 6. Cookbook Patterns

Jak dodawać testy w tym projekcie. Każda podsekcja wypełnia się, gdy odpowiednia faza wdrożenia zostanie zamknięta; wcześniej brzmi "TBD — patrz §3 Faza N".

### 6.1 Dodanie testu jednostkowego

- **Lokalizacja**: obok testowanego modułu, `src/**/*.test.ts`.
- **Nazewnictwo**: `<moduł>.test.ts`.
- **Test referencyjny**: `src/lib/urgency.test.ts`.
- **Uruchomienie lokalne**: `npm test` (lub `npm run test:watch`).
- **Reguła**: `globals: false` — `describe`, `it`, `expect` importuje się jawnie.

### 6.2 Dodanie testu warstwy danych na atrapie

- **Lokalizacja**: obok modułu, jak wyżej.
- **Polityka atrap**: ręczna atrapa klienta bazy (wzorzec `createSupabaseStub`), bez dodatkowych bibliotek do mockowania.
- **Test referencyjny**: `src/lib/tasks.test.ts`.
- **Kiedy NIE stosować**: do czegokolwiek, co ma dowodzić izolacji między użytkownikami — atrapa nie zna polityk bazy i przepuści zapytanie, które prawdziwa baza odrzuci (ryzyko #2).

### 6.3 Dodanie testu integracyjnego z prawdziwą bazą

- TBD — patrz §3 Faza 1 (wzorzec: dwa konta, cztery operacje, sprawdzenie odmowy dostępu, nie tylko sukcesu).

### 6.4 Dodanie testu dla endpointu API

- TBD — patrz §3 Faza 2 (wzorzec: kontrakt żądanie → zapisany moment → odczytany moment; źródłem oczekiwanej wartości jest wymaganie, nigdy ta sama konwersja, którą testujemy).

### 6.5 Dodanie testu reguły czasowej

- **Test referencyjny**: `src/lib/urgency.test.ts`.
- **Reguła bezwzględna**: każdy test zależny od czasu wstrzykuje własny moment odniesienia. Test korzystający z zegara systemowego przechodzi rano i pada wieczorem — jest gorszy niż jego brak.
- **Co już jest pokryte i czego nie ma sensu dublować**: obie strony granicy 48h, granica domknięta co do milisekundy, zadanie po terminie, zadanie ukończone (także przeterminowane), termin nieparsowalny, data nieistniejąca w kalendarzu.

### 6.6 Dodanie testu E2E

- TBD — patrz §3 Faza 3.

### 6.7 Notatki z faz wdrożenia

(Uzupełniane po zamknięciu każdej fazy — 2–3 linijki o tym, co faza wykazała.)

## 7. What We Deliberately Don't Test

Wyłączenia obowiązujące do czasu zmiany założenia. **Uwaga: nie przeprowadzono wywiadu z użytkownikiem**, więc poniższe wynika z PRD i reguł projektu, a nie z deklaracji właściciela produktu — do potwierdzenia przy `--refresh`.

- **Funkcje spoza FR-001–FR-010** — nazwane non-goals z PRD (podzadania, powiadomienia, współdzielenie, kategorie, aplikacja natywna, kalendarz, konfigurowalny próg). Nie istnieją, więc nie mają czego chronić. Rewizja przy zmianie PRD. (Źródło: PRD §Non-Goals, `AGENTS.md` §Hard rules.)
- **Komponenty prezentacyjne przyniesione przez starter** — baner, ekran powitalny, pasek górny. Zerowa logika, zerowy wpływ na dane. Rewizja, gdy zaczną decydować o czymkolwiek. (Źródło: `roadmap.md` §Baseline.)
- **Biblioteka uwierzytelniania dostawcy** — testujemy nasze użycie (ryzyka #2, #5), nie samo SDK. Rewizja przy zmianie dostawcy.
- **Snapshoty interfejsu** — przy jednym ekranie i jednej liście łapałyby zmiany stylowania, a nie regresje reguły. Rewizja, gdy pojawi się drugi widok o własnej logice.
- **Wydajność i skala** — docelowa skala z PRD to mała liczba użytkowników i niski ruch. Rewizja, gdy ta wartość się zmieni.

## 8. Freshness Ledger

- Strategia (§1–§5) ostatnio przeglądana: 2026-09-12
- Wersje narzędzi ostatnio zweryfikowane: 2026-09-12
- Odwołania do narzędzi wspomaganych modelem ostatnio zweryfikowane: 2026-09-12

Odśwież (`/10x-test-plan --refresh`), gdy:

- pojawi się nowe ryzyko z pierwszej trójki (najbliższy kandydat: cokolwiek, co wyjdzie z pierwszego uruchomienia na prawdziwej bazie),
- **zostanie wreszcie przeprowadzony wywiad z właścicielem produktu** — ten plan powstał wyłącznie z dokumentów i stanu kodu,
- data `checked:` któregoś z narzędzi przekroczy trzy miesiące,
- zmieni się stos technologiczny (nowy framework, nowy runner testów),
- §7 przestanie odpowiadać temu, w co zespół faktycznie wierzy.
