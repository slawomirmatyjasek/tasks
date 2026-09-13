# Infrastruktura — Pilne

Gdzie ta aplikacja stoi, z czego się składa i co jest do czego podłączone.
Dokument opisuje **stan faktyczny** na 13 września 2026, a nie plan.

Powiązane dokumenty: uzasadnienie wyboru stacku — [`tech-stack.md`](tech-stack.md),
stan po bootstrapie — [`health-check.md`](health-check.md), instrukcja uruchomienia
i komendy — [`../../README.md`](../../README.md).

## Mapa systemu

```
przeglądarka
     │  HTTPS
     ▼
Cloudflare Workers  ── Worker "pilne"  (SSR Astro 6 + wyspy React 19)
     │                 sekrety: SUPABASE_URL, SUPABASE_KEY
     │  PostgREST + GoTrue (HTTPS)
     ▼
Supabase  ── projekt mntmewcgdicumlcuwpjq
             Auth (e-mail + hasło, sesja w ciasteczku)
             Postgres: tabela public.tasks z RLS
```

Całość jest bezstanowa po stronie Workera: jedynym stanem jest sesja w ciasteczku
i wiersze w Postgresie. Nie ma kolejek, cache'u ani zadań w tle — flaga pilności
jest wyliczana przy każdym odczycie, więc nie istnieje nic, co mogłoby się
rozjechać z bazą.

## Hosting — Cloudflare Workers

| Pozycja         | Wartość                                                                |
| --------------- | ---------------------------------------------------------------------- |
| Nazwa Workera   | `pilne` (pole `name` w [`wrangler.jsonc`](../../wrangler.jsonc))       |
| Publiczny adres | https://pilne.pilne.workers.dev                                        |
| Runtime         | `workerd`, `compatibility_date` 2026-05-08, flaga `nodejs_compat`      |
| Statyki         | binding `ASSETS` na katalog `./dist`, `not_found_handling: "404-page"` |
| Obserwowalność  | `observability.enabled: true` (logi w panelu Cloudflare)               |
| Adapter         | `@astrojs/cloudflare`, tryb `output: "server"`                         |

Adres składa się z nazwy Workera i subdomeny konta, stąd powtórzony człon
`pilne.pilne` — `workers.dev` nie wystawia adresów dwuczłonowych.

**Wdrożenie:**

```bash
npm run build
npx wrangler deploy
```

**Sekrety Workera** (ustawiane raz, przeżywają kolejne wdrożenia):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

## Baza i uwierzytelnianie — Supabase

| Pozycja                       | Wartość                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Referencja projektu           | `mntmewcgdicumlcuwpjq`                                                                                                                        |
| Uwierzytelnianie              | Supabase Auth, e-mail + hasło; potwierdzanie adresu **wyłączone**                                                                             |
| Jedyna tabela aplikacji       | `public.tasks`                                                                                                                                |
| Migracja                      | [`supabase/migrations/20260912141556_create_tasks.sql`](../../supabase/migrations/20260912141556_create_tasks.sql) — zastosowana na instancji |
| Klucz używany przez aplikację | publishable (`anon`) — klucz `service_role` **nie jest używany nigdzie**                                                                      |

**Model dostępu w bazie:**

- RLS włączone na `public.tasks`, cztery osobne polityki `auth.uid() = user_id`:
  `tasks_select_own`, `tasks_insert_own`, `tasks_update_own`, `tasks_delete_own`.
  `insert` i `update` mają dodatkowo `with check`, więc nie da się wstawić ani
  przepisać wiersza na cudze konto.
- Uprawnienia obiektowe ma wyłącznie rola `authenticated`
  (`grant select, insert, update, delete on public.tasks to authenticated`).
  Rola `anon` nie dostaje nic — i to jest zachowanie docelowe.

**Jak to wygląda w praktyce:** `GET /rest/v1/tasks` bez sesji zwraca
`42501 permission denied`. To znaczy, że tabela istnieje, a niezalogowany
słusznie do niej nie sięga. **Nie „naprawiaj" tego przez `grant ... to anon`**,
choćby podpowiadał to komunikat Postgresa.

**Zastosowanie migracji:**

```bash
npx supabase link --project-ref mntmewcgdicumlcuwpjq
npx supabase db push
```

## Konfiguracja i sekrety — cztery różne miejsca

Ta sama para wartości żyje w kilku miejscach i łatwo o pomyłkę, więc pełna lista:

| Środowisko              | Gdzie leżą sekrety                                                                                     | Kto je czyta                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Lokalne (`npm run dev`) | `.env` oraz `.dev.vars` (oba ignorowane przez gita)                                                    | Astro i lokalny `workerd`       |
| Produkcja               | sekrety Workera (`wrangler secret put`)                                                                | Worker                          |
| CI — build              | sekrety repozytorium: `SUPABASE_URL`, `SUPABASE_KEY`                                                   | krok `npm run build`            |
| CI — testy integracyjne | dodatkowo `PILNE_TEST_A_EMAIL`, `PILNE_TEST_A_PASSWORD`, `PILNE_TEST_B_EMAIL`, `PILNE_TEST_B_PASSWORD` | krok `npm run test:integration` |

Wzór wszystkich zmiennych: [`.env.example`](../../.env.example). Żaden sekret nie
jest w repozytorium i nie może się tam znaleźć. Klucz bierzemy z panelu Supabase
→ Project Settings → API Keys, zawsze **publishable/anon**, nigdy `service_role`.

## CI/CD

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), Node 22, uruchamiany
na każdy push i pull request do `main`:

```
npm ci → npx astro sync → npx astro check → npm run lint → npm test
       → npm run build → npm run test:integration
```

Wdrożenie **nie jest** zautomatyzowane — `wrangler deploy` odpalamy ręcznie.
To świadoma decyzja na czas MVP: jedno środowisko, jeden człowiek, brak potrzeby
bramkowania wdrożeń.

Krok integracyjny pomija się sam, gdy brakuje którejkolwiek z czterech zmiennych
z kontami testowymi — dzięki temu pipeline jest zielony także w forku bez
sekretów. Brak konfiguracji nie jest regresją produktu.

## Pułapki, o których trzeba wiedzieć

- **`optional: true` na obu sekretach w [`astro.config.mjs`](../../astro.config.mjs).**
  Literówka w nazwie sekretu na Cloudflare nie wywróci buildu — da działającą
  aplikację, która wszystkich przekierowuje na logowanie. Awaria cicha zamiast
  głośnej. Zmiana na wymagane jest możliwa, odkąd `.env` istnieje lokalnie.
- **Cloudflare odrzuca żądania bez nagłówka `User-Agent` przeglądarki** —
  zwraca `403, error code: 1010`. Dotyczy skryptów i narzędzi CLI uderzających
  w produkcję; dla użytkowników bez znaczenia. Na `localhost` problemu nie ma.
- **Ochrona CSRF Astro** odrzuca żądania `POST` bez nagłówka `Origin` (`403`).
- **Trzy niezależne klienty Supabase na jedno żądanie** (middleware,
  `dashboard.astro`, endpointy), każdy z tym samym refresh tokenem. Ratuje to
  `refresh_token_reuse_interval`; docelowo klient powinien powstawać raz
  w middleware i wędrować przez `context.locals`.

## Wycofanie zmiany

Nie ma pipeline'u wdrożeniowego, więc wycofanie polega na zbudowaniu
i wdrożeniu wcześniejszego commita:

```bash
git checkout <commit>
npm run build
npx wrangler deploy
```

Migracje bazy nie mają skryptów wycofujących — tabela jest jedna i nie było
dotąd zmiany schematu po wdrożeniu.
