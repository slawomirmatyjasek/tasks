# Log ustaleń — projekt "Pilne" (projekt zaliczeniowy 10xDevs 3.0)

Zapisane 2026-09-04. Ten plik jest punktem powrotu, gdyby trzeba było wznowić pracę po przerwie/restarcie — czytaj go w całości przed kontynuowaniem.

## Kontekst kursu (skąd te wymagania)

Źródło: `C:\Users\slawomirmat\Desktop\td\prework\42-dobry-i-zly-projekt-kursowy.md` i `43-checklista-uczestnika-i-support-circle.md`, oraz materiały modułów 1–3 w tym samym folderze.

Kurs: **10xDevs 3.0** (Przeprogramowani.pl). Start pełnego programu: 18 maja 2026. Koniec szkolenia: 19 czerwca 2026. Terminy zgłoszenia projektu zaliczeniowego: 5 lipca / 10 sierpnia / 14 września 2026.

### 6 wymogów zaliczenia (dosłownie z pliku 42)
1. Kontrola dostępu odpowiednia do typu aplikacji
2. Zarządzanie danymi (sensowny CRUD, nie sztuczna lista)
3. Logika biznesowa opisywalna jednym zdaniem (klasyfikuje/rekomenduje/waliduje/przelicza)
4. Artefakty z modułów 1–3 (PRD, plany, kontekst dla AI)
5. Co najmniej jeden test z perspektywy użytkownika (kluczowy przepływ)
6. CI/CD (build + testy w pipeline)

Publiczny deployment i CI/CD są "mile widziane ponad minimum", ale kurs i tak prowadzi do publicznego deploymentu już w M1L5 (koniec tygodnia 1).

**Ostrzeżenie z pliku 42, które motywowało wybór pomysłu:** "pusty CRUD" to najczęstszy zły wzorzec — dosłowny przykład w pliku to "lista zadań bez reguły". Naprawa podana w tym samym zdaniu: dodać priorytetyzację. Stąd wybór projektu.

## Wybrany pomysł: "Pilne"

Prosta lista zadań z automatyczną flagą pilności — wybrana jako **najniższy możliwy nakład pracy, który wciąż bezpiecznie spełnia wszystkie 6 wymogów** (w przeciwieństwie do przykładu z kursu — generatora fiszek AI — który wymaga integracji z zewnętrznym LLM API i jest bardziej złożony/niedeterministyczny).

- **Problem:** użytkownik z długą listą zadań traci orientację, co wymaga działania teraz
- **Persona:** Kasia, 32 lata, koordynatorka projektów, prowadzi prywatną listę spraw po godzinach
- **Logika biznesowa (1 zdanie):** zadanie jest automatycznie oznaczane jako pilne, gdy termin przypada w ciągu 48h i zadanie nie jest ukończone
- **Non-goals:** podzadania, powiadomienia, współdzielenie, kategorie, aplikacja mobilna, integracja z kalendarzem, konfigurowalny próg pilności

Pełny PRD: [`prd.md`](./prd.md) w tym samym folderze — zgodny ze schematem `/10x-prd` z lekcji M1L1 (10 sekcji greenfield, źródło schematu: `td/1/zasoby i skille/claude-code/m1l1/skills/10x-shape/references/prd-schema.md`).

## Decyzja: kontrola dostępu — WYBRANO opcję 2 (Supabase Auth, multi-user)

Rozważane były dwie opcje:

1. **Passcode gate** (jedno wspólne hasło do całej apki, dane w Cloudflare D1, bez podziału na użytkowników) — absolutne minimum nakładu (1 konto zewnętrzne: Cloudflare), ale ryzykowna interpretacja wymogu "kontrola dostępu" — może zostać odebrana przez mentora jako obejście, nie realizacja
2. **Supabase Auth z pełną rejestracją wielu użytkowników** — ✅ **WYBRANE**. Nakład pracy praktycznie identyczny jak dla wariantu z jednym z góry ustawionym kontem (Supabase SDK daje rejestrację "za darmo" w tym samym komponencie), a interpretacyjnie bezpieczne — to dosłownie "logowanie", które plik 42 wymienia jako domyślny przypadek dla aplikacji webowej

**Wniosek:** żadna dalsza redukcja nakładu w tym miejscu nie ma sensu — droga przez Supabase i tak jest już najprostszą drogą do prawdziwego logowania (pisanie własnego auth od zera byłoby więcej pracy, nie mniej).

## Wybrany tech stack

Domyślny stack kursu (z `td/prework/41-tech-stack-overview.md`) — pasuje bez zastrzeżeń, bo spełnia 4 bramki (typowany / oparty o konwencje / popularny / dobrze udokumentowany):

| Warstwa | Wybór |
|---|---|
| Meta-framework + API | Astro 6 |
| Komponenty UI | React 19 |
| System typów | TypeScript |
| Stylowanie | Tailwind CSS 4 |
| Backend + baza + auth | Supabase |
| Deployment | Cloudflare (Pages/Workers) |

**Ważne wyjaśnienie (żeby nie było znów nieporozumienia):** to nie jest 6 osobnych aplikacji/kont. Astro, React, TypeScript, Tailwind to biblioteki w jednym repozytorium (dochodzą jedną komendą CLI). Realnie zakładane są **tylko 2 konta zewnętrzne**: Supabase (baza + auth) i Cloudflare (hosting).

## Ustalona kolejność dalszych kroków ("co dalej")

Zgodnie z chronologią modułu 1 (`td/1/`):

1. ✅ Wybór pomysłu i PRD — zrobione, patrz `prd.md`
2. ✅ Repo projektu założone — `Desktop/Pilne`, `git init` wykonany 2026-09-04, pliki `context/foundation/*` dodane do stage (jeszcze bez commita — commit czeka na decyzję użytkownika)
3. ✅ Tech stack (M1L2) — zapisany w `tech-stack.md`: starter `10x-astro-starter` (Astro+React+TS+Tailwind+Supabase+Cloudflare, ten sam co domyślny stack kursu), `bootstrapper_confidence: first-class`, deployment target `cloudflare-pages`
4. ✅ Bootstrap (M1L3) — wykonane 2026-09-07. Sklonowany oficjalny starter `przeprogramowani/10x-astro-starter` do scratchpada, skopiowany do `Desktop/Pilne` (bez nadpisania `context/` i `.git`), `npm install` (773 pakiety), `npm audit fix` (bez `--force`: 25 → 4 podatności, reszta wymagałaby przejścia na Astro 7 — świadomie odłożone, patrz `health-check.md`), `npm run build` przeszedł bez błędu. Weryfikacja zapisana w `health-check.md` — status: `needs-attention` (brak test runnera, oczekiwane przed modułem 3), brak blokerów dla dalszej pracy agenta.
   - **Uwaga:** starter przynosi własny `CLAUDE.md` w katalogu głównym — do przejrzenia/scalenia z naszymi regułami w kroku 5, nie nadpisywać na ślepo.
5. ✅ Reguły dla agenta (M1L4) — wykonane 2026-09-07. Napisano `AGENTS.md` (~280 słów) jako lekką, specyficzną dla projektu warstwę reguł (flaga pilności wyliczana nigdy nie zapisywana, ochrona przed scope creep poza FR-001–010, wymóg RLS na `tasks`, przypomnienie o obowiązkowym teście US-02 przed zgłoszeniem) — odsyła do istniejącego `CLAUDE.md` startera po architekturę/komendy, nie duplikuje go.
6. ⬜ Deployment (M1L5) — **następny krok** — `/10x-infra-research` → `infrastructure.md`, plan w Plan Mode → `deploy-plan.md`, założenie kont Cloudflare/Supabase/GitHub, `wrangler deploy` → publiczny URL. To kończy tydzień 1, **zanim jeszcze zaimplementowane są US-01...US-05**
7. ⬜ Dopiero potem moduł 2: `/10x-roadmap` → implementacja US-01...US-05 jako pionowe sliсe'y (`/10x-new` → `/10x-plan` → `/10x-implement` → `/10x-impl-review`)
8. ⬜ Moduł 3: plan testów, testy jednostkowe (w tym test kluczowego przepływu — pkt 5 wymogów), hooki jakości, ewentualnie E2E, debugging

## Jak wrócić do tych ustaleń po restarcie

- Ten plik (`decisions-log.md`) i `prd.md` leżą w `C:\Users\slawomirmat\Desktop\Pilne\context\foundation\` — przetrwają restart komputera, to zwykłe pliki na dysku
- Jeśli otworzysz Claude Code w folderze `C:\Users\slawomirmat\Desktop\td` (tak jak w tej rozmowie), pamięć projektowa (patrz `MEMORY.md` w pamięci Claude) wskaże z powrotem na ten plik
- Jeśli zamiast tego zaczniesz nową sesję Claude Code bezpośrednio w folderze `C:\Users\slawomirmat\Desktop\Pilne`, po prostu poproś: "przeczytaj context/foundation/decisions-log.md i prd.md i kontynuujmy" — to wystarczy do pełnego wznowienia kontekstu
