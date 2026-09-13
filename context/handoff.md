# Handoff — projekt "Pilne"

> Dokument przekazania dla agenta, który wchodzi w ten projekt bez kontekstu
> (nowa sesja, restart maszyny). Stan na **2026-09-12**, po weryfikacji na żywo.
> Po każdej istotnej zmianie zaktualizuj sekcje „Stan" i „Następne kroki".

## 1. Czym jest ten projekt

**Pilne** — lista zadań z automatyczną flagą pilności. Projekt zaliczeniowy kursu
10xDevs 3.0. Reguła biznesowa w jednym zdaniu: _zadanie z terminem w ciągu 48h,
które nie jest ukończone, jest oznaczone jako pilne_.

- **Katalog roboczy:** `C:\Users\slawomirmat\Desktop\Pilne`
- **Materiały kursu** (prework + moduły 1–3, skille źródłowe): `C:\Users\slawomirmat\Desktop\td`
- **Stack:** Astro 6 SSR + React 19 + TypeScript + Tailwind 4 + Supabase + Cloudflare Workers
- **Termin zgłoszenia projektu:** 14 września 2026 (3. i ostatni termin edycji)

Zanim cokolwiek zmienisz, przeczytaj `AGENTS.md`, `CLAUDE.md` i
`context/foundation/prd.md`. Twarde reguły z `AGENTS.md` obowiązują bez wyjątków —
w szczególności zakaz utrwalania flagi pilności gdziekolwiek poza momentem odczytu.

## 2. Stan — co jest zrobione

Wszystko poniżej jest **zacommitowane i wypchnięte** na gałąź `main`.

| Obszar                                                                | Stan                     | Dowód                                                 |
| --------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------- |
| PRD, tech-stack, health-check, decisions-log                          | gotowe                   | `context/foundation/`                                 |
| Roadmapa i plan testów                                                | gotowe                   | `context/foundation/roadmap.md`, `test-plan.md`       |
| Reguły dla agenta                                                     | gotowe                   | `AGENTS.md`                                           |
| Migracja `tasks` + RLS + GRANT                                        | **zastosowana na bazie** | `supabase/migrations/20260912141556_create_tasks.sql` |
| Logika pilności                                                       | gotowa                   | `src/lib/urgency.ts`                                  |
| Warstwa danych (CRUD)                                                 | gotowa                   | `src/lib/tasks.ts`                                    |
| API `/api/tasks`                                                      | gotowe                   | `src/pages/api/tasks/`                                |
| Interfejs (lista, dodawanie, edycja, usuwanie, toggle, filtr pilnych) | gotowy                   | `src/pages/dashboard.astro`, `src/components/tasks/`  |
| Testy jednostkowe                                                     | 150, zielone             | 4 pliki `*.test.ts`                                   |
| CI (typecheck + lint + test + build)                                  | plik gotowy              | `.github/workflows/ci.yml`                            |
| Uruchomienie lokalne                                                  | zweryfikowane            | `/` 200, `/dashboard` → 302 na `/auth/signin`         |

**Bramki jakości — wszystkie zielone:**

```
npm run lint        # exit 0
npm test            # 150 passed (4 pliki)
npx astro check     # 0 errors
npm run build       # OK
```

### Co zostało zweryfikowane na prawdziwej bazie (2026-09-12)

Nie tylko atrapy — poniższe przeszło przez realny Supabase i realny serwer SSR:

- **Izolacja danych (US-05), sześć sprawdzeń:** konto B nie odczyta, nie zedytuje
  ani nie usunie zadania konta A (za każdym razem zero wierszy), a próba wstawienia
  zadania z cudzym `user_id` kończy się `403` — to zasługa `with check` w politykach.
- **Reguła pilności rozróżnia:** przeterminowane nieukończone → pilne; termin za 24h
  → pilne; termin za 5 dni → nie; **termin za 2h ale ukończone → nie**. Ostatni
  przypadek jest kluczowy, bo to na nim taka reguła zwykle się wykłada.
- **Pełny przepływ przez aplikację:** logowanie → sesja w ciasteczku → `/dashboard`
  renderuje listę po stronie serwera z poprawnymi flagami i sortowaniem (ukończone
  na końcu, odwrócony przycisk toggle).
- **Ochrona CSRF Astro działa** — POST na `/api/auth/signin` bez nagłówka `Origin`
  dostaje `403`.

### Czego nadal NIE udowodniono

- **Przełączenie strefy czasowej po hydracji.** SSR renderuje termin w UTC (celowo,
  patrz commit `2403800`); podmiana na strefę użytkownika po zamontowaniu wyspy
  została udowodniona skryptem na `react-dom/server`, ale nie w prawdziwej
  przeglądarce. Otwórz `/dashboard` ręcznie i sprawdź, czy godzina zgadza się
  z wpisaną.
- **Zachowanie na Cloudflare Workers** — nic nie było jeszcze wdrożone.
- Konta testowe `rls-a-1789249572@proton.me` i `rls-b-1789249572@proton.me`
  zostały w bazie (ich zadania usunięto). Do skasowania w panelu:
  Authentication → Users.

## 3. Stan zewnętrznych usług

| Usługa     | Stan                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase   | Projekt istnieje, ref **`mntmewcgdicumlcuwpjq`**, katalog zlinkowany. `.env` i `.dev.vars` utworzone lokalnie i ignorowane przez gita. **Migracja ZASTOSOWANA** — `GET /rest/v1/tasks` jako `anon` zwraca `42501 permission denied`, i to jest zachowanie poprawne: uprawnienia ma wyłącznie rola `authenticated`. NIE wykonuj podpowiedzi Postgresa o `GRANT ... TO anon` |
| GitHub     | Repo `https://github.com/slawomirmatyjasek/pilne`, gałąź `main` **wypchnięta**. **CI przeszło na zielono** (typecheck, lint, 150 testów, build)                                                                                                                                                                                                                            |
| Cloudflare | **Wdrożone:** https://pilne.pilne.workers.dev — Worker `pilne`, sekrety `SUPABASE_URL` i `SUPABASE_KEY` wgrane, KV `pilne-session` utworzone automatycznie. Konto: slawomir.matyjasek@softvig.pl                                                                                                                                                                           |

**Sekrety:** nie ma ich w repo i nie wolno ich tam wprowadzać. `SUPABASE_URL`
i `SUPABASE_KEY` (klucz publishable) są w `.env` i `.dev.vars` na dysku. Jeśli
plików brakuje, odtwórz je z panelu Supabase → Project Settings → API Keys,
biorąc klucz **publishable/anon**, nigdy **secret/service_role**.

## 4. Następne kroki — w tej kolejności

### Krok 1 — ZROBIONE: migracja zastosowana

Katalog zlinkowany z projektem, `supabase db push` wykonany. Weryfikacja:
`GET /rest/v1/tasks` bez sesji zwraca `42501 permission denied` zamiast `PGRST205`,
czyli tabela istnieje, a `anon` słusznie nie ma do niej dostępu.

### Krok 2 — ZROBIONE: weryfikacja end-to-end

Przeprowadzona 2026-09-12 przez API uwierzytelniania i serwer dev. Wyniki w sekcji
„Co zostało zweryfikowane". Pozostaje jedno ręczne sprawdzenie w przeglądarce:
czy po hydracji termin pokazuje się w strefie użytkownika, a nie w UTC.

### Krok 3 — ZROBIONE: push i zielone CI

Gałąź `main` wypchnięta, pipeline zaliczył typecheck, lint, 150 testów i build.
Uwaga na przyszłość: poświadczenia gita w systemie należą do konta `slawomirmat`,
a repo do `slawomirmatyjasek` — przy kolejnych pushach z tej maszyny może znów
pojawić się `403` i potrzebny będzie Personal Access Token.

### Krok 4 — sekrety w GitHubie

Settings → Secrets and variables → Actions: `SUPABASE_URL`, `SUPABASE_KEY`.

### Krok 5 — ZROBIONE: wdrożenie produkcyjne

**https://pilne.pilne.workers.dev**

Zweryfikowane na produkcji: strona główna bez banera o brakującej konfiguracji,
`/dashboard` bez sesji przekierowuje na logowanie, rejestracja i logowanie przez
aplikację działają, `POST /api/tasks` zwraca 201, a dashboard renderuje flagę
pilności poprawnie rozróżniając przypadki (termin za 20h → pilne, za tydzień → nie).

Uwagi na przyszłość:

- Pierwsze żądania po utworzeniu subdomeny `workers.dev` kończą się błędem
  handshake'u TLS — certyfikat propaguje się przez ~30 sekund. To nie jest błąd
  aplikacji, wystarczy ponowić.
- `curl` z Git Basha używa schannel i bywa zawodny wobec Cloudflare; `fetch`
  z Node działa stabilnie.
- Ponowne wdrożenie: `npm run build && npx wrangler deploy`. Sekrety zostają
  między wdrożeniami, nie trzeba ich wgrywać ponownie.

### Krok 6 — pozostałe drobiazgi

- Sprawdź w przeglądarce, czy po hydracji termin pokazuje się w Twojej strefie
  (SSR renderuje w UTC celowo — patrz commit `2403800`).
- Skasuj konta testowe w Authentication → Users: `rls-a-1789249572@proton.me`,
  `rls-b-1789249572@proton.me`, `prod-test-1789250343352@proton.me`.
- Rozważ ponowne włączenie potwierdzania e-maila po zgłoszeniu projektu.

## 5. Znane długi — świadomie odłożone

Pochodzą z przeglądu implementacji. Żaden nie blokuje zaliczenia, ale nie są
wymyślone i warto je znać przed dotykaniem odpowiednich plików.

- **`src/middleware.ts` pomija `error` z `getUser()`.** Awaria Supabase Auth
  wygląda dla aplikacji jak „niezalogowany", więc zalogowany użytkownik zostaje
  wyrzucony na logowanie bez żadnej informacji, co się stało.
- **Trzy niezależne klienty Supabase na jedno żądanie** (middleware, `dashboard.astro`,
  endpointy), każdy z tym samym refresh tokenem odczytanym z oryginalnego nagłówka.
  Ratuje to `refresh_token_reuse_interval`, ale przy wolniejszym żądaniu może dać
  `Invalid Refresh Token: Already Used`. Poprawka: utworzyć klienta raz w middleware
  i przekazać przez `context.locals`.
- **`CLAUDE.md` wymaga walidacji przez zod**, a endpointy walidują ręcznie. Zod nie
  jest w zależnościach — dodanie to decyzja człowieka.
- **Duplikacja między `src/pages/api/tasks/index.ts` i `[id].ts`** (`json`,
  `respondToServiceError`, stałe). Do scalenia w `src/lib/api-http.ts`.
- **US-03 w PRD mówi o „osobnym widoku" dla ukończonych zadań** — nie ma go,
  ukończone lądują na końcu tej samej listy. Zapisane jako otwarte pytanie w roadmapie.
- **NFR o nieujawnianiu istnienia konta jest złamany** — kod auth pochodzi ze startera
  i przepuszcza surowy komunikat dostawcy do query stringa, po angielsku.
- **`astro.config.mjs` ma `optional: true` na obu sekretach.** Literówka w nazwie
  sekretu na Cloudflare da działającą aplikację, która wszystkich przekierowuje na
  logowanie, zamiast głośnej awarii. Zmiana na wymagane była odkładana, bo blokowałaby
  build, dopóki nie było `.env` — teraz `.env` jest, więc można to rozważyć.
- **`PROTECTED_ROUTES` w middleware ma jeden wpis `/dashboard`.** Nowa trasa z zadaniami
  nie zostanie objęta automatycznie.

## 6. Pułapki tego repo — przeczytaj przed edycją

- **Końcówki linii.** `core.autocrlf=true` wymusza CRLF przy checkoucie, przez co
  Prettier odrzucał kilkanaście plików i `npm run lint` był czerwony w całym repo.
  Naprawia to `.gitattributes` z `eol=lf`. Nie usuwaj go.
- **Testy muszą wstrzykiwać `now`.** Test reguły czasowej zależny od zegara
  systemowego przechodzi rano i pada wieczorem. Cały zestaw trzyma tę zasadę.
- **`vitest.config.ts` ma `include` obejmujący wyłącznie pliki `.test.ts`** — plik
  `.test.tsx` nie zostanie uruchomiony w ogóle.
- **Testy API leżą w `src/lib/api-tasks.test.ts`, nie w `src/pages/`** — wszystko
  w `src/pages/` jest dla Astro trasą, więc plik testowy stałby się publicznym
  endpointem w buildzie.
- **Pilność nigdy nie jest utrwalana.** Nie dodawaj kolumny `is_urgent`, nie wkładaj
  jej do stanu React ani do propsów SSR. `dashboard.astro` celowo ją odcina przed
  przekazaniem do wyspy.
- **Warstwa danych nie filtruje po `user_id`** — izolację wymusza wyłącznie RLS.
  To świadoma decyzja: ręczny filtr maskowałby ewentualny brak polityki.
- **Statusy HTTP rozpoznawane są przez `instanceof`, nie po treści komunikatu.**
  Klasy błędów są w `src/lib/tasks.ts` (`TaskValidationError`, `TaskNotFoundError`,
  `TaskInvariantError`, `TaskStorageError`). Nie wracaj do dopasowywania stringów.
- **Termin w API wymaga jawnej strefy** (`Z` albo offset). Naiwny `2026-03-15T14:30`
  dostaje 400. Warstwa serwisowa pozostaje permisywna dla wywołań wewnętrznych.
- **Skille kursowe `/10x-*` są w `.claude/skills/`** (23 sztuki, zacommitowane).

## 7. Wymogi certyfikacji — stan

| #   | Wymóg            | Stan                                               |
| --- | ---------------- | -------------------------------------------------- |
| 1   | Kontrola dostępu | ✅ RLS zweryfikowane na żywo, sześć sprawdzeń      |
| 2   | Sensowny CRUD    | ✅ przetestowany przez aplikację, nie tylko atrapy |
| 3   | Logika biznesowa | ✅ flaga pilności, pokryta i odporna na mutacje    |
| 4   | Artefakty M1–M3  | ✅                                                 |
| 5   | Min. 1 test      | ✅ 150                                             |
| 6   | CI/CD            | ✅ pipeline uruchomiony i zielony na `main`        |

Źródło wymogów: `C:\Users\slawomirmat\Desktop\td\prework\42-dobry-i-zly-projekt-kursowy.md`
