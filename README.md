# Pilne

Lista zadań, która sama pokazuje, czym trzeba zająć się teraz — zadanie z terminem w ciągu 48 godzin dostaje flagę „pilne" bez żadnego ręcznego ustawiania priorytetu.

**Działająca aplikacja:** https://pilne.pilne.workers.dev

Projekt zaliczeniowy kursu 10xDevs 3.0.

## Problem i użytkownik

Osoba prowadząca po godzinach kilkanaście prywatnych spraw z terminami — zakupy, drobne naprawy, sprawy urzędowe — przy dłuższej liście traci orientację, co wymaga działania dziś, a co może poczekać. Sortowanie po dacie pokazuje kolejność, ale nie odpowiada na pytanie „co muszę zrobić teraz"; trzeba przeskanować każdą datę osobno.

Persona z PRD to Kasia, koordynatorka projektów, która otwiera aplikację raz lub dwa razy dziennie i chce w kilka sekund zdecydować, od czego zacząć. Odpowiedzią jest jeden automatyczny sygnał zamiast ręcznego priorytetu.

Pełny opis: [`context/foundation/prd.md`](context/foundation/prd.md).

## Reguła biznesowa

> **Zadanie z terminem w ciągu najbliższych 48 godzin, które nie jest ukończone, jest oznaczone jako pilne.**

Dwie własności tej reguły są istotne i celowe:

- **Flaga jest wyliczana przy odczycie, nigdy nie utrwalana.** W bazie nie ma kolumny `is_urgent` ani `priority`, nie ma też zadania cron, które by je zapisywało. Pilność powstaje przy każdym wyświetleniu listy, względem bieżącego czasu — dzięki temu nie istnieje stan „nieaktualna flaga". To twarda reguła projektu, zapisana w [`AGENTS.md`](AGENTS.md); implementacja mieszka w `src/lib/urgency.ts`.
- **Ukończenie wygrywa z terminem.** Zadanie oznaczone jako ukończone nigdy nie jest pilne, choćby termin mijał za godzinę. Zadanie przeterminowane i nieukończone jest pilne — termin, który już minął, traktujemy tak samo jak termin za dwie godziny.

Próg 48h jest wartością stałą; konfigurowalny próg to świadomy non-goal MVP.

## Stack

- **Astro 6** w trybie SSR (`output: "server"`) — renderowanie po stronie serwera
- **React 19** — wyspy interaktywne (formularz, lista zadań)
- **TypeScript 5** + **Tailwind CSS 4**
- **Supabase** — PostgreSQL, uwierzytelnianie e-mail/hasło, Row Level Security
- **Cloudflare Workers** — środowisko uruchomieniowe produkcji
- **Vitest 5** — testy jednostkowe; **ESLint** + **Prettier**; **GitHub Actions** — CI

Uzasadnienie wyboru: [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).

## Uruchomienie lokalne

### Wymagania

- Node.js **22.14.0** (wersja z `.nvmrc`)
- npm
- Projekt Supabase — chmurowy albo lokalny stack przez `npx supabase start` (ten drugi wymaga Dockera i ok. 7 GB RAM)

### 1. Sklonuj repozytorium

```bash
git clone https://github.com/slawomirmatyjasek/tasks.git
cd tasks
npm ci
```

### 2. Ustaw zmienne środowiskowe

Aplikacja potrzebuje dwóch zmiennych. Są zadeklarowane przez schemat `astro:env` i traktowane jako **sekrety wyłącznie serwerowe** — nigdy nie trafiają do przeglądarki.

| Zmienna        | Skąd wziąć                                                          |
| -------------- | ------------------------------------------------------------------- |
| `SUPABASE_URL` | Supabase → Project Settings → API Keys → URL projektu               |
| `SUPABASE_KEY` | Supabase → Project Settings → API Keys → klucz **publishable/anon** |

> Bierz klucz **publishable/anon**. **Nigdy** nie używaj klucza **secret/service_role** — omija on Row Level Security, czyli całą kontrolę dostępu tego projektu.

Obie zmienne muszą znaleźć się w **dwóch** plikach: serwer deweloperski działa na środowisku Cloudflare (`workerd`) i czyta `.dev.vars`, a build Astro czyta `.env`.

```bash
cp .env.example .env
cp .env.example .dev.vars
```

Następnie uzupełnij w obu plikach wartości `SUPABASE_URL` i `SUPABASE_KEY`. Oba pliki są ignorowane przez gita i nie wolno ich commitować.

### 3. Zastosuj migrację bazy

Repozytorium zawiera jedną migrację — `supabase/migrations/20260912141556_create_tasks.sql` — która tworzy tabelę `tasks` wraz z politykami RLS i uprawnieniami. **Bez niej logowanie się powiedzie, ale `/dashboard` nie wczyta listy zadań.**

```bash
npx supabase link --project-ref <ref-projektu>   # jednorazowo, dla projektu w chmurze
npx supabase db push
```

Dla lokalnego stacku uruchomionego przez `npx supabase start` odpowiednikiem jest `npx supabase migration up`.

Domyślnie Supabase wymaga potwierdzenia adresu e-mail przed pierwszym logowaniem. Na czas pracy lokalnej można to wyłączyć w panelu: **Authentication → Email → Confirm email**.

### 4. Uruchom serwer deweloperski

```bash
npm run dev
```

### Dostępne skrypty

| Komenda                 | Działanie                                             |
| ----------------------- | ----------------------------------------------------- |
| `npm run dev`           | Serwer deweloperski (środowisko Cloudflare `workerd`) |
| `npm run build`         | Build produkcyjny                                     |
| `npm run preview`       | Podgląd buildu produkcyjnego                          |
| `npm run lint`          | ESLint z regułami opartymi o typy                     |
| `npm run lint:fix`      | ESLint z automatyczną naprawą                         |
| `npm run format`        | Prettier                                              |
| `npm test`              | Testy jednostkowe (jednorazowo)                       |
| `npm run test:watch`    | Testy w trybie obserwowania                           |
| `npm run test:coverage` | Testy z raportem pokrycia                             |

## Bramki jakości

Cztery komendy, które muszą przejść przed każdym zgłoszeniem zmiany:

```bash
npm run lint      # ESLint + Prettier
npm test          # 150 testów jednostkowych
npx astro check   # kontrola typów
npm run build     # build produkcyjny
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) uruchamia się **na każdy push i każdy pull request do `main`** i wykonuje na Node 22 dokładnie tę samą sekwencję: `npm ci` → `npx astro sync` → `npx astro check` → `npm run lint` → `npm test` → `npm run build`. Krok budowania wymaga sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY` (Settings → Secrets and variables → Actions).

## Testy

**150 testów jednostkowych w 4 plikach, wszystkie zielone.** Leżą obok kodu, środowisko `node`, `globals: false` — `describe`/`it`/`expect` są importowane jawnie.

| Plik                                    | Testy | Co pokrywa                                                                                                                                     |
| --------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/tasks.test.ts`                 |    44 | Warstwa danych (CRUD) na ręcznej atrapie klienta Supabase — walidacja, klasy błędów, niezmienniki                                              |
| `src/lib/api-tasks.test.ts`             |    41 | Kontrakt endpointów `/api/tasks` — kody statusu, kształt odpowiedzi, obsługa błędów                                                            |
| `src/components/tasks/datetime.test.ts` |    36 | Formatowanie i parsowanie terminów, wymóg jawnej strefy czasowej                                                                               |
| `src/lib/urgency.test.ts`               |    29 | Reguła pilności: obie strony granicy 48h, ukończone po terminie, przeterminowane nieukończone, daty nieparsowalne i nieistniejące w kalendarzu |

W zestawie obowiązują dwie zasady: **każdy test czasowy wstrzykuje własny moment odniesienia** (test zależny od zegara systemowego przechodzi rano i pada wieczorem, więc jest gorszy niż jego brak), a testy sprawdzają gwarantowane zachowanie, nie sposób napisania funkcji.

### Czego w tych testach nie ma

Warto wiedzieć, zanim ktoś uzna pokrycie za pełne:

- **Zero testów integracyjnych i zero testów E2E.** Cały zestaw to testy jednostkowe.
- **Żaden automatyczny test nie przechodzi przez prawdziwą bazę, prawdziwe RLS, prawdziwe żądanie HTTP ani prawdziwą przeglądarkę.** Warstwa danych jest testowana na ręcznej atrapie klienta, a atrapa nie zna RLS — sama z siebie nie udowodni izolacji kont.
- Testy skupiają się w `src/lib/` i `src/components/tasks/`. Strony Astro, middleware i komponenty uwierzytelniania nie mają pokrycia automatycznego.
- Dostępność jest sprawdzana wyłącznie statycznie (`eslint-plugin-jsx-a11y`), bez testów w czasie wykonania.

Izolacja danych między kontami została zweryfikowana **ręcznie** na prawdziwej bazie (przebieg opisany w [`context/handoff.md`](context/handoff.md)). To jest dowód, ale nie jest to test pilnujący regresji w CI. Fazy testów integracyjnych i E2E są opisane i wycenione w [`context/foundation/test-plan.md`](context/foundation/test-plan.md) ze statusem „not started".

## Kontrola dostępu

Aplikacja jest wieloużytkownikowa, z jedną rolą: właściciel swoich zadań. Brak ról administracyjnych i brak współdzielenia zadań w MVP.

- **Uwierzytelnianie:** Supabase Auth, e-mail + hasło. Sesja trzymana w ciasteczku, odczytywana po stronie serwera.
- **Ochrona tras:** `src/middleware.ts` przekierowuje niezalogowanych na `/auth/signin`. Trasy objęte ochroną wymienia tablica `PROTECTED_ROUTES`.
- **Izolacja danych na poziomie bazy:** tabela `tasks` ma włączone Row Level Security i cztery osobne polityki `auth.uid() = user_id` — dla `select`, `insert`, `update` i `delete`. Uprawnienia do tabeli ma wyłącznie rola `authenticated`; rola `anon` nie dosięga jej wcale.
- **Warstwa danych celowo nie filtruje po `user_id`.** Izolację wymusza wyłącznie RLS. To świadoma decyzja: ręczny filtr w kodzie maskowałby ewentualny brak polityki w bazie i sprawiałby, że luka byłaby niewidoczna.

Trasy aplikacji:

| Trasa                 | Opis                                                |
| --------------------- | --------------------------------------------------- |
| `/`                   | Strona startowa                                     |
| `/auth/signup`        | Rejestracja                                         |
| `/auth/signin`        | Logowanie                                           |
| `/auth/confirm-email` | Informacja o potwierdzeniu adresu po rejestracji    |
| `/dashboard`          | Lista zadań — chroniona, przekierowuje na logowanie |
| `/api/tasks`          | Lista i tworzenie zadań (`GET`, `POST`)             |
| `/api/tasks/[id]`     | Edycja i usunięcie zadania (`PATCH`, `DELETE`)      |

## Wdrożenie

Produkcja działa na Cloudflare Workers:

```bash
npm run build
npx wrangler deploy
```

`SUPABASE_URL` i `SUPABASE_KEY` są ustawione jako sekrety Workera (`npx wrangler secret put <nazwa>`) i zostają między wdrożeniami — nie trzeba ich wgrywać ponownie.

## Dokumentacja projektu

| Dokument                                                                     | Co zawiera                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`context/foundation/prd.md`](context/foundation/prd.md)                     | Problem, persona, historyjki US-01–US-05, wymagania FR-001–FR-010, reguła biznesowa, granice MVP  |
| [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md)       | Wybrany stack i uzasadnienie decyzji                                                              |
| [`context/foundation/roadmap.md`](context/foundation/roadmap.md)             | Plan wdrożenia podzielony na etapy, stan bazowy i otwarte pytania produktowe                      |
| [`context/foundation/test-plan.md`](context/foundation/test-plan.md)         | Mapa ryzyk, fazowy plan testów i uczciwy opis tego, czego zestaw testów jeszcze nie dowodzi       |
| [`context/foundation/decisions-log.md`](context/foundation/decisions-log.md) | Log ustaleń — punkt powrotu po przerwie, wraz z wymogami zaliczenia kursu                         |
| [`context/foundation/health-check.md`](context/foundation/health-check.md)   | Kontrola stanu projektu po bootstrapie: zależności, runner testów, build                          |
| [`context/handoff.md`](context/handoff.md)                                   | Pełny stan przekazania: co zrobione, co zweryfikowane na żywo, znane długi i pułapki repozytorium |
| [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md)                           | Twarde reguły projektu i konwencje dla agentów pracujących nad kodem                              |

## Licencja

MIT
