-- Migracja: tabela `tasks` — jedyna encja danych aplikacji "Pilne".
--
-- Zakres: FR-004..FR-009 oraz US-01..US-05 z context/foundation/prd.md.
--
-- WAŻNE (twarda reguła z AGENTS.md / PRD "Business Logic"):
-- flaga pilności NIE jest przechowywana w bazie. Nie ma tu kolumny `is_urgent`
-- ani `priority`, nie ma triggera ani zadania cron, które by ją wyliczały.
-- Pilność jest zawsze liczona przy odczycie w kodzie aplikacji
-- (src/lib/urgency.ts) względem bieżącego czasu — inaczej zadanie
-- "zrobiłoby się pilne" dopiero po kolejnym zapisie do bazy.

create table if not exists public.tasks (
  -- Klucz techniczny; uuid zamiast sekwencji, żeby identyfikatory zadań
  -- jednego użytkownika nie zdradzały liczby zadań innych użytkowników.
  id uuid primary key default gen_random_uuid(),

  -- Właściciel zadania. Kasowanie konta kasuje jego zadania (US-05:
  -- zadania są własnością jednoosobową, nie ma współdzielenia).
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Tytuł: wymagany i niepusty (US-01). `trim` w check pilnuje, żeby same
  -- spacje nie przeszły jako "niepusty" tytuł. Górny limit 200 znaków
  -- trzyma listę czytelną i chroni przed zapychaniem wiersza.
  title text not null check (char_length(trim(title)) between 1 and 200),

  -- Termin wykonania — wymagany (US-01). timestamptz, nie timestamp:
  -- próg 48h liczymy względem absolutnego momentu w czasie, więc
  -- strefa czasowa musi być częścią wartości.
  due_date timestamptz not null,

  -- Status ukończenia (FR-008). Nowe zadanie jest domyślnie nieukończone.
  -- Ukończenie jest odwracalne i nie kasuje wiersza (US-03).
  completed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tasks is
  'Zadania użytkownika. Flaga pilności (due_date <= teraz + 48h AND completed = false) jest wyliczana przy odczycie w aplikacji, nigdy nie zapisywana w tej tabeli.';
comment on column public.tasks.due_date is
  'Termin wykonania. Wejście do reguły pilności z FR-009 — liczonej w kodzie, nie w bazie.';
comment on column public.tasks.completed is
  'Zadanie ukończone nigdy nie jest pilne, niezależnie od due_date (US-02).';

-- Indeks pod główne zapytanie listy: zadania jednego użytkownika
-- w kolejności terminów. Wiodące user_id obsługuje też predykat RLS.
create index if not exists tasks_user_id_due_date_idx
  on public.tasks (user_id, due_date);

-- --------------------------------------------------------------------------
-- updated_at
-- --------------------------------------------------------------------------
-- Trigger, a nie wartość ustawiana przez aplikację — żeby żadna ścieżka
-- zapisu (API, SQL, panel Supabase) nie mogła o niej zapomnieć.

create or replace function public.handle_tasks_updated_at()
returns trigger
language plpgsql
-- Pusty search_path: funkcja triggerowa nie może dać się podmienić
-- przez obiekt z schematu użytkownika. now() jest w pg_catalog.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.handle_tasks_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------
-- Guardrail z PRD: "Zadania jednego użytkownika nigdy nie są widoczne dla
-- innego użytkownika" (US-05). Izolacja jest wymuszona w bazie, a nie tylko
-- filtrem `where user_id = ...` w kodzie — kod można ominąć, RLS nie.
-- Cztery osobne polityki per operacja, zamiast jednej `for all`, żeby
-- każda operacja miała jawny, czytelny warunek.

alter table public.tasks enable row level security;

-- SELECT: użytkownik czyta wyłącznie własne zadania (FR-005).
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
  on public.tasks
  for select
  to authenticated
  using (auth.uid() = user_id);

-- INSERT: nie da się utworzyć zadania "w imieniu" innego użytkownika (FR-004).
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
  on public.tasks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- UPDATE: `using` decyduje, które wiersze użytkownik może w ogóle ruszyć,
-- `with check` blokuje przepisanie zadania na cudze konto (FR-006, FR-008).
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
  on public.tasks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: usuwanie tylko własnych zadań (FR-007).
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
  on public.tasks
  for delete
  to authenticated
  using (auth.uid() = user_id);
