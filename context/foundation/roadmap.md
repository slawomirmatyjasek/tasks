---
project: "Pilne"
version: 1
status: active
created: 2026-09-12
updated: 2026-09-12
prd_version: 1
main_goal: speed
top_blocker: external
---

# Roadmap: Pilne

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Osoba prowadząca kilkanaście prywatnych spraw po godzinach zapisuje je z terminami, ale przy dłuższej liście przestaje widzieć, co wymaga działania dziś. Samo sortowanie po dacie pokazuje kolejność, nie odpowiedź. Produkt daje jeden automatyczny sygnał — "pilne" — wyliczany z terminu i statusu ukończenia, bez ręcznego priorytetyzowania.

Roadmapa jest spisana **po fakcie dla większości zakresu**: reguła pilności, CRUD, kontrola dostępu i testy jednostkowe są już zaimplementowane (patrz `## Done`). Otwarta pozostaje droga z działającego kodu do działającej instalacji: realna baza, weryfikacja end-to-end, publiczny deployment i repozytorium uruchamiające CI.

## North star

**S-03: użytkownik widzi swoje zadania z poprawnie wyliczoną flagą pilności** — to jedyna rzecz, która odróżnia ten produkt od zwykłej listy zadań; jeśli flaga jest zła albo niewidoczna, reszta funkcji nie ma znaczenia.

> "Gwiazda przewodnia" (north star) to tu: najmniejszy pełny przepływ od bazy do ekranu, którego poprawne działanie dowodzi, że produkt spełnia swoją obietnicę — umieszczany tak wcześnie, jak pozwalają zależności.
>
> Uwaga do statusu: S-03 jest `done` na poziomie kodu i testów jednostkowych, ale **nie był jeszcze wykonany przez realnego użytkownika na realnej bazie** — to dokładnie zakres S-07.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                         | Prerequisites                                                                      | PRD refs                                              | Status   |
| ---- | ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| F-01 | project-bootstrap         | (foundation) szkielet aplikacji, lint, typecheck i CI stoją                  | —                                                                                  | NFR (przeglądarki), tech-stack                        | done     |
| F-02 | tasks-table-with-rls      | (foundation) jedyna encja danych istnieje jako migracja z RLS                | F-01                                                                               | Access Control, US-05, FR-004..FR-008, Business Logic | done     |
| F-03 | test-runner-and-ci-gate   | (foundation) reguła pilności i warstwa danych dają się weryfikować           | F-01                                                                               | Business Logic, US-02, FR-009                         | done     |
| F-04 | live-supabase-environment | (foundation) aplikacja mówi do prawdziwej bazy z zastosowaną migracją        | F-02, konto Supabase z założonym projektem, sekrety w lokalnym pliku środowiskowym | Access Control, US-05, FR-004..FR-009                 | ready    |
| F-05 | github-repo-and-ci-run    | (foundation) każda zmiana przechodzi przez lint + testy + build              | F-01, F-03, konto GitHub, zatwierdzenie bieżącej kopii roboczej                    | Business Logic, US-02                                 | ready    |
| F-06 | e2e-critical-flow         | (foundation) kluczowy przepływ jest weryfikowany bez ręcznego klikania       | F-04                                                                               | US-01, US-02, US-05, FR-009                           | proposed |
| S-01 | account-and-session       | użytkownik zakłada konto, loguje się i wylogowuje                            | F-01                                                                               | US-05, FR-001, FR-002, FR-003                         | done     |
| S-02 | add-and-list-tasks        | użytkownik dodaje zadanie z terminem i widzi listę posortowaną po terminie   | F-02, S-01                                                                         | US-01, FR-004, FR-005                                 | done     |
| S-03 | urgency-flag              | użytkownik widzi swoje zadania z poprawnie wyliczoną flagą pilności          | S-02                                                                               | US-02, FR-009, Business Logic                         | done     |
| S-04 | complete-and-reopen-task  | użytkownik oznacza zadanie jako ukończone i cofa to oznaczenie               | S-02                                                                               | US-03, FR-008                                         | done     |
| S-05 | edit-and-delete-task      | użytkownik zmienia tytuł lub termin zadania albo je usuwa                    | S-02                                                                               | US-04, FR-006, FR-007                                 | done     |
| S-06 | urgent-only-filter        | użytkownik zawęża listę do samych pilnych zadań                              | S-03                                                                               | FR-010                                                | done     |
| S-07 | end-to-end-on-real-data   | użytkownik korzysta z aplikacji na trwałych danych i nie widzi cudzych zadań | F-04, S-01, S-05                                                                   | US-05, FR-001..FR-009, NFR (izolacja, 1 s)            | proposed |
| S-08 | public-deployment         | użytkownik otwiera aplikację pod publicznym adresem z dowolnej przeglądarki  | F-05, S-07, konto Cloudflare                                                       | FR-002, FR-005, NFR (przeglądarki)                    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                     | Chain                                               | Note                                                                                  |
| ------ | ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A      | Konto i dostęp            | `F-01` → `S-01`                                     | Domknięty. Warunek wstępny dla wszystkiego, co per-użytkownik.                        |
| B      | Zadania i reguła pilności | `F-02` → `S-02` → `S-03` → `S-04` / `S-05` → `S-06` | Domknięty w kodzie. Zawiera gwiazdę przewodnią `S-03`.                                |
| C      | Bramki jakości            | `F-03` → `F-05` → `F-06`                            | `F-06` dołącza też do strumienia D w `F-04` — bez realnej bazy nie ma czego testować. |
| D      | Uruchomienie produkcyjne  | `F-04` → `S-07` → `S-08`                            | Jedyny strumień z realną pracą do zrobienia; `S-08` czeka dodatkowo na `F-05`.        |

## Baseline

What's already in place in the codebase as of `2026-09-12` (auto-researched).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + wyspy React 19 + Tailwind 4; widok listy `src/pages/dashboard.astro`, komponenty `src/components/tasks/`.
- **Backend / API:** present — endpointy Astro `src/pages/api/tasks/index.ts` (POST) i `src/pages/api/tasks/[id].ts` (PATCH, DELETE). **Brak endpointu GET** — lista jest renderowana serwerowo na stronie, nie przez API.
- **Data:** partial — migracja `supabase/migrations/20260912141556_create_tasks.sql` (tabela `tasks` + 4 polityki RLS + trigger `updated_at`) i warstwa dostępu `src/lib/tasks.ts` istnieją, ale **migracja nie została uruchomiona na żadnej realnej bazie**; brak `.env` / `.dev.vars`, więc lokalnie klient Supabase zwraca `null`.
- **Auth:** present — Supabase Auth (email + hasło) ze startera: `src/lib/supabase.ts`, `src/middleware.ts` (`PROTECTED_ROUTES = ["/dashboard"]`), strony i endpointy `auth/*`. Nietknięte od bootstrapu.
- **Deploy / infra:** partial — `wrangler.jsonc` i adapter Cloudflare skonfigurowane przez starter, `.github/workflows/ci.yml` obecny (lint → test → build). **Brak repozytorium zdalnego** (`git remote` pusty), więc CI nigdy się nie uruchomił; **brak deploymentu**; `wrangler.jsonc` ma wciąż nazwę startera `10x-astro-starter`.
- **Observability:** partial — włączone `observability` w `wrangler.jsonc` (logi Cloudflare po deployu); brak trackingu błędów i metryk. Poza zakresem PRD — nie jest fundamentem.

**Uwaga do stanu repozytorium:** jedyny commit to bootstrap (2026-09-08). Cała praca z `## Done` poniżej jest w kopii roboczej jako pliki niezatwierdzone (45 zmodyfikowanych, 12 nieśledzonych). To wprost blokuje `F-05`.

## Foundations

### F-01: Szkielet aplikacji z konwencjami i bramkami lokalnymi

- **Outcome:** (foundation) szkielet aplikacji stoi — SSR, komponenty, ścisły TypeScript, lint, formatowanie, hook pre-commit i plik workflow CI.
- **Change ID:** project-bootstrap
- **PRD refs:** NFR (dwie najnowsze wersje przeglądarek), `tech-stack.md`
- **Unlocks:** F-02, F-03, S-01 — bez szkieletu nie ma gdzie umieścić ani encji, ani testów, ani ekranów.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sklonowany starter przynosi własne konwencje i własne zależności; ryzyko było w tym, że narzucą kształt sprzeczny z PRD. Zmaterializowało się tylko w jednym miejscu — dwie zależności tranzytywne z podatnością HIGH, których naprawa wymaga zmiany major frameworka (patrz `health-check.md`); świadomie odłożone.
- **Status:** done

### F-02: Encja zadania z izolacją na poziomie bazy

- **Outcome:** (foundation) jedyna encja danych aplikacji istnieje jako migracja, z RLS wymuszającym własność wierszy i bez kolumny przechowującej pilność.
- **Change ID:** tasks-table-with-rls
- **PRD refs:** Access Control, US-05, FR-004..FR-008, Business Logic
- **Unlocks:** S-02, S-03, S-04, S-05 oraz weryfikację izolacji z S-07.
- **Prerequisites:** F-01
- **Parallel with:** F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowane przed jakimkolwiek zapisem, bo dołożenie RLS do istniejących danych jest trudniejsze niż zaprojektowanie ich od razu z polityką. Realne ryzyko rezydualne: polityki są napisane, ale nigdy nie wykonane na serwerze — dowód poprawności odkłada się na F-04/S-07.
- **Status:** done

### F-03: Weryfikowalność reguły biznesowej

- **Outcome:** (foundation) reguła pilności i warstwa danych dają się sprawdzić jedną komendą, lokalnie i w CI, bez bazy i bez zegara systemowego.
- **Change ID:** test-runner-and-ci-gate
- **PRD refs:** Business Logic, US-02, FR-009
- **Unlocks:** S-03 (dowód poprawności progu 48h), F-05 (bramka testowa w CI ma co uruchamiać), F-06.
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Bez wstrzykiwanego momentu odniesienia testy graniczne byłyby niedeterministyczne i migałyby w CI; to zostało wymuszone regułą w `AGENTS.md`. Rezydualne: runner pokrywa wyłącznie moduły czyste — wszystko, co dotyka HTTP i bazy, nadal nie ma żadnego testu.
- **Status:** done

### F-04: Realne środowisko Supabase z zastosowaną migracją

- **Outcome:** (foundation) aplikacja łączy się z prawdziwym projektem Supabase, migracja jest wykonana, a polityki RLS są aktywne na serwerze, nie tylko w pliku.
- **Change ID:** live-supabase-environment
- **PRD refs:** Access Control, US-05, FR-004..FR-009
- **Unlocks:** S-07 (nie ma czego weryfikować end-to-end bez bazy), S-08, F-06.
- **Prerequisites:** F-02, konto Supabase z założonym projektem, sekrety w lokalnym pliku środowiskowym
- **Parallel with:** F-05
- **Blockers:** założenie konta Supabase i projektu — czynność poza repozytorium
- **Unknowns:**
  - Czy używamy jednego projektu Supabase dla lokalnego dev i produkcji, czy dwóch? — Owner: użytkownik. Block: no (start z jednym jest dopuszczalny dla MVP).
- **Risk:** Sekwencjonowane jako pierwsze z pozostałych, bo wszystko inne od tego zależy. Co może pójść źle: migracja przejdzie, ale RLS nie zadziała tak, jak zakłada kod — warstwa danych świadomie nie dokłada `where user_id = ...`, więc nieaktywna polityka oznacza natychmiastowy wyciek, a nie degradację.
- **Status:** ready

### F-05: Repozytorium zdalne uruchamiające CI

- **Outcome:** (foundation) kod jest w repozytorium zdalnym, a każdy push i PR uruchamia lint, testy i build.
- **Change ID:** github-repo-and-ci-run
- **PRD refs:** Business Logic (ochrona reguły przed regresją), US-02
- **Unlocks:** S-08 (deployment potrzebuje źródła prawdy poza laptopem), nazwaną ścieżkę weryfikacji: "zielony przebieg CI na pushu".
- **Prerequisites:** F-01, F-03, konto GitHub, zatwierdzenie bieżącej kopii roboczej
- **Parallel with:** F-04
- **Blockers:** założenie repozytorium zdalnego — czynność poza repozytorium
- **Unknowns:**
  - Czy sekrety `SUPABASE_URL` / `SUPABASE_KEY` mają trafić do sekretów repozytorium (krok build ich wymaga), czy build ma je traktować jako opcjonalne? — Owner: użytkownik. Block: no.
- **Risk:** Plik workflow istnieje od bootstrapu i nigdy nie został wykonany — pierwszy przebieg jest równocześnie pierwszym testem samego workflow. Dodatkowo cała praca jest niezatwierdzona, więc pierwszy push jest duży i nie da się go sensownie przejrzeć po kawałku.
- **Status:** ready

### F-06: Automatyczna weryfikacja kluczowego przepływu (opcjonalna)

- **Outcome:** (foundation) kluczowy przepływ — zalogowanie, dodanie zadania z terminem w progu, zobaczenie flagi — jest sprawdzany automatycznie w przeglądarce, bez ręcznego klikania.
- **Change ID:** e2e-critical-flow
- **PRD refs:** US-01, US-02, US-05, FR-009
- **Unlocks:** nazwaną ścieżkę weryfikacji dla S-07 i regresji S-08 — dziś ten przepływ potwierdza wyłącznie człowiek.
- **Prerequisites:** F-04
- **Parallel with:** S-08
- **Blockers:** —
- **Unknowns:**
  - Czy E2E wchodzi w zakres MVP, czy wystarczy ręczna weryfikacja z S-07? — Owner: użytkownik. Block: yes (dopóki nie ma decyzji, nie ma sensu dobierać narzędzia).
  - Skąd biorą się konta testowe przy włączonym potwierdzaniu e-maila w Supabase? — Owner: użytkownik. Block: no.
- **Risk:** Świadomie ostatni i świadomie opcjonalny: to jedyna pozycja w roadmapie, która nie jest wymagana, żeby produkt działał. Ryzyko odwrotne niż zwykle — E2E napisany przed stabilnym środowiskiem będzie kosztował więcej czasu na utrzymanie niż da sygnału.
- **Status:** proposed

## Slices

### S-01: Konto i sesja

- **Outcome:** użytkownik zakłada konto e-mailem i hasłem, loguje się, wylogowuje, a wchodząc na listę zadań bez sesji trafia na ekran logowania.
- **Change ID:** account-and-session
- **PRD refs:** US-05, FR-001, FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** F-02, F-03
- **Blockers:** —
- **Unknowns:**
  - Czy komunikaty błędów uwierzytelniania spełniają wymaganie z PRD (nieujawnianie, czy e-mail jest zarejestrowany)? — Owner: użytkownik. Block: no.
- **Risk:** Slice odziedziczony ze startera bez zmian, więc koszt był zerowy, ale i przegląd był zerowy: komunikat błędu dostawcy trafia wprost do adresu strony, po angielsku i w oryginalnym brzmieniu. Przekierowanie chroni dokładnie jedną ścieżkę wymienioną na liście — nowa ścieżka zadań nie zostanie objęta automatycznie.
- **Status:** done

### S-02: Dodanie zadania i lista

- **Outcome:** użytkownik dodaje zadanie z tytułem i terminem i od razu widzi je na swojej liście, uporządkowanej po terminie.
- **Change ID:** add-and-list-tasks
- **PRD refs:** US-01, FR-004, FR-005
- **Prerequisites:** F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowane przed regułą pilności, bo reguła bez danych wejściowych jest niesprawdzalna. Co mogło pójść źle i wymagało decyzji: termin wpisany w polu bez strefy czasowej — konwersja została świadomie zostawiona po stronie przeglądarki, bo serwer działa w UTC i przesunąłby termin o offset użytkownika.
- **Status:** done

### S-03: Automatyczna flaga pilności (gwiazda przewodnia)

- **Outcome:** użytkownik widzi swoje zadania z poprawnie wyliczoną flagą pilności — bez ustawiania priorytetu i bez filtrowania.
- **Change ID:** urgency-flag
- **PRD refs:** US-02, FR-009, Business Logic
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy zadanie po terminie ma mieć osobną etykietę ("zaległe")? — Owner: użytkownik. Block: no (przyjęto założenie domyślne z PRD: traktowane jak pilne).
- **Risk:** Umieszczone możliwie wcześnie, bo to jedyna funkcja odróżniająca produkt od zwykłej listy. Główne ryzyko było trwałością: zapisanie flagi w bazie sprawiłoby, że zadanie "stawałoby się pilne" dopiero przy kolejnym zapisie — stąd twarda reguła, że pilność jest wyłącznie wartością odczytu. Rezydualne: flaga jest liczona w dwóch miejscach (render serwerowy i wyspa w przeglądarce) względem dwóch różnych zegarów.
- **Status:** done

### S-04: Ukończenie i cofnięcie ukończenia

- **Outcome:** użytkownik oznacza zadanie jako ukończone, traci ono flagę pilności, i może cofnąć to oznaczenie.
- **Change ID:** complete-and-reopen-task
- **PRD refs:** US-03, FR-008
- **Prerequisites:** S-02
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - PRD zakłada, że ukończone zadanie "pozostaje dostępne, np. w osobnym widoku"; zaimplementowano je jako pozycję zepchniętą na koniec tej samej listy. Czy to wystarcza? — Owner: użytkownik. Block: no.
- **Risk:** Ryzykiem było naruszenie zabezpieczenia z PRD ("ukończenie nigdy nie kasuje zadania w tle") — obsłużone przez odwracalną zmianę statusu zamiast usunięcia wiersza. Ukończone zadania zostają widoczne, co jest bezpieczniejszym błędem niż ich zniknięcie.
- **Status:** done

### S-05: Edycja i usunięcie zadania

- **Outcome:** użytkownik zmienia tytuł lub termin zadania, albo usuwa je po potwierdzeniu, a pilność jest przeliczana od nowa.
- **Change ID:** edit-and-delete-task
- **PRD refs:** US-04, FR-006, FR-007
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Usunięcie jest nieodwracalne, więc potwierdzenie jest jedyną barierą — ryzyko przesunięte na warstwę interfejsu, gdzie jest tanie, zamiast na kosz na śmieci, którego PRD nie przewiduje. Próba sięgnięcia po cudze zadanie kończy się tym samym komunikatem co zadanie nieistniejące, żeby identyfikator nie zdradzał istnienia rekordu.
- **Status:** done

### S-06: Filtr pilnych

- **Outcome:** użytkownik zawęża listę do samych pilnych zadań i widzi ich liczbę.
- **Change ID:** urgent-only-filter
- **PRD refs:** FR-010
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jedyna pozycja o priorytecie "nice-to-have"; zrobiona, bo filtr operuje na wartości już liczonej przy renderze i nie dokłada ani zapytania, ani stanu. Gdyby wymagała własnego zapytania do bazy, powinna była wylądować w `## Parked`.
- **Status:** done

### S-07: Działający przepływ na trwałych danych

- **Outcome:** użytkownik przechodzi pełną ścieżkę na realnej bazie — zakłada konto, dodaje zadanie, widzi flagę, edytuje, ukończa, usuwa — dane przeżywają restart, a drugie konto nie widzi jego zadań.
- **Change ID:** end-to-end-on-real-data
- **PRD refs:** US-05, FR-001..FR-009, NFR (izolacja danych, potwierdzenie operacji w ciągu 1 s)
- **Prerequisites:** F-04, S-01, S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy potwierdzanie adresu e-mail przy rejestracji zostaje włączone? Wpływa na to, ile kont da się założyć do testu izolacji. — Owner: użytkownik. Block: no.
- **Risk:** To pierwszy moment, w którym cokolwiek z `## Done` jest sprawdzane poza atrapami. Najgroźniejszy możliwy wynik: wszystko działa dla jednego konta, a izolacja nie działa dla dwóch — dlatego weryfikacja dwoma kontami jest częścią wyniku slice'a, nie opcją.
- **Status:** proposed

### S-08: Publiczny adres aplikacji

- **Outcome:** użytkownik otwiera aplikację pod publicznym adresem, loguje się i widzi swoje zadania — na przeglądarce desktopowej i mobilnej.
- **Change ID:** public-deployment
- **PRD refs:** FR-002, FR-005, NFR (dwie najnowsze wersje głównych przeglądarek)
- **Prerequisites:** F-05, S-07, konto Cloudflare
- **Parallel with:** F-06
- **Blockers:** założenie konta Cloudflare — czynność poza repozytorium
- **Unknowns:**
  - Czy adres publiczny ma być udostępniony jawnie, czy tylko do oceny? Wpływa na to, czy rejestracja pozostaje otwarta. — Owner: użytkownik. Block: no.
- **Risk:** Ostatni w kolejności, bo deployment kodu, którego nikt nie uruchomił na realnej bazie, tylko przenosi diagnostykę do gorszego środowiska. Klasyczny tryb awarii tego kroku: brak sekretów po stronie hostingu — aplikacja startuje, ale lista zadań jest niedostępna, a użytkownik nie ma jak odróżnić tego od utraty danych.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                          | Ready for `/10x-plan` | Notes                                              |
| ---------- | ------------------------- | -------------------------------------------------------------- | --------------------- | -------------------------------------------------- |
| F-01       | project-bootstrap         | Bootstrap projektu ze startera                                 | no                    | Zrobione 2026-09-07/08                             |
| F-02       | tasks-table-with-rls      | Migracja tabeli `tasks` z politykami RLS                       | no                    | Zrobione; nieuruchomione na realnej bazie          |
| F-03       | test-runner-and-ci-gate   | Runner testów i bramka testowa w CI                            | no                    | Zrobione; 69 testów jednostkowych                  |
| F-04       | live-supabase-environment | Podłączenie realnego projektu Supabase i uruchomienie migracji | yes                   | Uruchom `/10x-plan live-supabase-environment`      |
| F-05       | github-repo-and-ci-run    | Repozytorium zdalne i pierwszy zielony przebieg CI             | yes                   | Wymaga wcześniejszego zatwierdzenia kopii roboczej |
| F-06       | e2e-critical-flow         | Test E2E kluczowego przepływu (opcjonalny)                     | no                    | Blokowane decyzją o zakresie E2E                   |
| S-01       | account-and-session       | Rejestracja, logowanie, wylogowanie, ochrona tras              | no                    | Zrobione; komunikaty błędów do przeglądu           |
| S-02       | add-and-list-tasks        | Dodawanie zadania i lista posortowana po terminie              | no                    | Zrobione                                           |
| S-03       | urgency-flag              | Automatyczna flaga pilności (48h, nieukończone)                | no                    | Zrobione; gwiazda przewodnia                       |
| S-04       | complete-and-reopen-task  | Ukończenie zadania i cofnięcie ukończenia                      | no                    | Zrobione                                           |
| S-05       | edit-and-delete-task      | Edycja i usuwanie zadania z potwierdzeniem                     | no                    | Zrobione                                           |
| S-06       | urgent-only-filter        | Filtr "tylko pilne"                                            | no                    | Zrobione                                           |
| S-07       | end-to-end-on-real-data   | Weryfikacja pełnego przepływu i izolacji na realnej bazie      | no                    | Czeka na F-04                                      |
| S-08       | public-deployment         | Deployment na Cloudflare i publiczny adres                     | no                    | Czeka na F-05 i S-07                               |

## Open Roadmap Questions

1. **Czy zadanie z terminem w przeszłości powinno mieć inną etykietę niż "pilne" (np. "zaległe")?** — Owner: użytkownik. Block: `S-03` (nie blokuje; w kodzie przyjęto już założenie domyślne z PRD — przeterminowane jest traktowane jak pilne, bez dolnej granicy progu). Zmiana odpowiedzi wymaga zmiany reguły i jej testów.
2. **Czy próg 48h jest odpowiedni?** — Owner: użytkownik. Block: `S-03` (nie blokuje; 48h jest wartością stałą, PRD wyklucza konfigurowalność).
3. **Czy ukończone zadania mają mieć osobny widok?** — Owner: użytkownik. Block: `S-04` (nie blokuje). PRD (US-03) mówi "znika z widoku aktywnych" i "pozostaje dostępne, np. w osobnym widoku"; zaimplementowano jedną listę z ukończonymi na końcu i filtrem pilnych. Wymaga potwierdzenia albo korekty PRD.
4. **Czy testy E2E wchodzą w zakres MVP?** — Owner: użytkownik. Block: `F-06`. Jedyne pytanie w tej roadmapie, które faktycznie blokuje pozycję.
5. **Kiedy zatwierdzić bieżącą kopię roboczą?** — Owner: użytkownik. Block: `F-05` (nie blokuje planowania, blokuje wykonanie). Cały zakres z `## Done` żyje dziś wyłącznie na dysku lokalnego komputera.

## Parked

- **Podzadania / hierarchia zadań** — Why parked: PRD §Non-Goals; płaska lista, jedna encja.
- **Przypomnienia i powiadomienia push** — Why parked: PRD §Non-Goals; sygnał pilności widoczny wyłącznie po otwarciu aplikacji.
- **Współdzielenie zadań między użytkownikami** — Why parked: PRD §Non-Goals; własność jednoosobowa jest też fundamentem modelu dostępu.
- **Kategorie, tagi, projekty** — Why parked: PRD §Non-Goals.
- **Natywna aplikacja mobilna** — Why parked: PRD §Non-Goals; wyłącznie responsywna aplikacja webowa.
- **Integracja z kalendarzem zewnętrznym** — Why parked: PRD §Non-Goals.
- **Konfigurowalny próg pilności** — Why parked: PRD §Non-Goals; 48h stałe, żeby uniknąć ekranu ustawień.
- **Podniesienie frameworka do kolejnej wersji major (naprawa dwóch podatności tranzytywnych HIGH)** — Why parked: `health-check.md` — naprawa wymaga nieprzejrzanej zmiany major, sprzecznej z wyborem z `tech-stack.md`. Do rewizji po deploymencie.
- **Tracking błędów i metryki** — Why parked: poza wymaganiami PRD; po deployu wystarczają logi platformy.

## Done

Pozycje zamknięte przed spisaniem tej roadmapy — statusy odtworzone ze stanu kodu i historii repozytorium, nie z archiwum zmian.

- **F-01: (foundation) szkielet aplikacji, lint, typecheck i CI stoją** — Zamknięte 2026-09-08 → commit `85da495` (`feat: bootstrap projektu z 10x-astro-starter`). Weryfikacja: `context/foundation/health-check.md` (status `needs-attention`, brak blokerów). Lesson: —
- **F-02: (foundation) jedyna encja danych istnieje jako migracja z RLS** — Zamknięte 2026-09-12 → `supabase/migrations/20260912141556_create_tasks.sql` (tabela, 4 polityki per-operacja, trigger `updated_at`, brak kolumny pilności). Niezatwierdzone w repozytorium; niewykonane na realnej bazie. Lesson: —
- **F-03: (foundation) reguła pilności i warstwa danych dają się weryfikować** — Zamknięte 2026-09-12 → `vitest.config.ts`, krok `npm test` w `.github/workflows/ci.yml`. Stan: 69 testów jednostkowych, wszystkie zielone. Lesson: każdy test czasowy wstrzykuje moment odniesienia — zapisane jako reguła w `AGENTS.md`.
- **S-01: użytkownik zakłada konto, loguje się i wylogowuje** — Zamknięte 2026-09-08 → kod ze startera (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/auth/*`, `src/pages/api/auth/*`), przyjęty bez modyfikacji. Weryfikacja: wyłącznie przegląd kodu — brak testów i brak uruchomienia na realnym projekcie Supabase. Lesson: —
- **S-02: użytkownik dodaje zadanie z terminem i widzi listę posortowaną po terminie** — Zamknięte 2026-09-12 → `src/lib/tasks.ts`, `src/pages/api/tasks/index.ts`, `src/pages/dashboard.astro`, `src/components/tasks/`. Lesson: konwersja terminu ze strefy lokalnej na UTC musi zostać po stronie przeglądarki; serwer działa w UTC. Lista jest pobierana renderem serwerowym — endpointu GET świadomie nie ma.
- **S-03: użytkownik widzi swoje zadania z poprawnie wyliczoną flagą pilności** — Zamknięte 2026-09-12 → `src/lib/urgency.ts` (moduł czysty, próg 48h, granica domknięta, brak dolnej granicy, ukończone zawsze niepilne) + 41 testów w `src/lib/urgency.test.ts`. Lesson: flaga nie istnieje w bazie ani w propsach — jest liczona przy każdym renderze, także cyklicznie przy otwartej karcie.
- **S-04: użytkownik oznacza zadanie jako ukończone i cofa to oznaczenie** — Zamknięte 2026-09-12 → `src/pages/api/tasks/[id].ts` (PATCH), `src/components/tasks/TaskItem.tsx`. Odchylenie od PRD: brak osobnego widoku ukończonych — patrz Open Roadmap Question 3. Lesson: —
- **S-05: użytkownik zmienia tytuł lub termin zadania albo je usuwa** — Zamknięte 2026-09-12 → `src/pages/api/tasks/[id].ts` (PATCH, DELETE), potwierdzenie usunięcia w interfejsie. Lesson: data nieistniejąca w kalendarzu (np. 30 lutego) jest w JavaScripcie cicho przewijana na kolejny miesiąc — wymagała jawnej walidacji, bo przesuwała termin i wraz z nim flagę pilności.
- **S-06: użytkownik zawęża listę do samych pilnych zadań** — Zamknięte 2026-09-12 → `src/components/tasks/TaskList.tsx` (filtr i licznik liczone lokalnie z tej samej wartości co flaga). Lesson: —
