# Repository Guidelines

Pilne to lista zadań z automatyczną flagą pilności, zbudowana na starterze `10x-astro-starter` (Astro 6 SSR, React 19, Tailwind 4, Supabase, Cloudflare Workers). Pełna architektura i komendy: @CLAUDE.md — ten plik dodaje tylko to, czego tam nie ma.

## Hard rules

- Flaga pilności (`due_date` ≤ 48h i `completed = false`) jest wartością wyliczaną przy odczycie. Nigdy nie dodawaj trwałej kolumny `is_urgent`/`priority` ani zadania cron, które ją zapisuje — patrz @context/foundation/prd.md, sekcja "Business Logic".
- Nie dodawaj funkcji wykraczających poza FR-001–FR-010 z @context/foundation/prd.md bez wcześniejszej aktualizacji PRD. Nazwane non-goals (podzadania, przypomnienia, współdzielenie, kategorie, aplikacja mobilna, kalendarz, konfigurowalny próg) są poza zakresem — zgłoś to w odpowiedzi zamiast implementować.
- Każda nowa tabela Supabase musi mieć włączone RLS z polityką `auth.uid() = user_id` (konwencja z @CLAUDE.md). Tabela `tasks`: `id`, `user_id`, `title`, `due_date`, `completed`.

## Kontekst projektu

- Wymagania produktowe: @context/foundation/prd.md (US-01–US-05)
- Uzasadnienie stacku: @context/foundation/tech-stack.md
- Historia decyzji: @context/foundation/decisions-log.md — sprawdź przed zaproponowaniem alternatywy dla czegoś, co już tam rozstrzygnięto
- Stan bootstrapu: @context/foundation/health-check.md

## Testy

Runner: **Vitest 5** (`npm test`, `npm run test:watch`, `npm run test:coverage`). Testy leżą obok kodu jako `src/**/*.test.ts`, środowisko `node`, `globals: false` — importuj `describe`/`it`/`expect` jawnie z `vitest`.

Reguła pilności (`src/lib/urgency.ts`) jest pokryta z obu stron granicy 48h wraz z przypadkami: ukończone po terminie, przeterminowane nieukończone, data nieparsowalna i nieistniejąca w kalendarzu. **Każdy test czasowy musi wstrzykiwać `now`** — test zależny od zegara systemowego przechodzi rano i pada wieczorem, więc jest gorszy niż jego brak.

Testując `src/lib/tasks.ts`, używaj ręcznej atrapy klienta Supabase (wzorzec `createSupabaseStub` w `src/lib/tasks.test.ts`) — nie dociągaj bibliotek do mockowania.

Nie testuj tego, jak funkcja jest napisana, tylko jakie zachowanie gwarantuje. Przy zmianie reguły biznesowej sprawdź, czy test faktycznie pada po jej odwróceniu — zielony test, który przeżywa mutację, niczego nie chroni.

## Commity

Brak jeszcze historii commitów — pierwszy commit powinien iść w konwencji Conventional Commits (`feat:`, `fix:`, `chore:`), zgodnie z tym, czego oczekuje CI/większość starterów Astro; potwierdź z użytkownikiem, jeśli chcesz inną konwencję.
