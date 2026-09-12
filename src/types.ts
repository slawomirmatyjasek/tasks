/**
 * Współdzielone typy encji i komend aplikacji "Pilne".
 *
 * Kontrakt między warstwą danych (src/lib/tasks.ts), logiką biznesową
 * (src/lib/urgency.ts) a UI. Zgodnie z konwencją z CLAUDE.md wszystkie
 * współdzielone typy mieszkają w tym pliku.
 */

/**
 * Wiersz tabeli `public.tasks` tak, jak zwraca go Supabase.
 *
 * Daty są stringami (ISO 8601), bo tak przychodzą z PostgREST przez JSON —
 * konwersja na `Date` jest świadomie zostawiona warstwie, która jej potrzebuje.
 *
 * Nie ma tu pola `is_urgent` — w bazie nie istnieje i istnieć nie może
 * (patrz AGENTS.md, "Hard rules").
 */
export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Zadanie wzbogacone o wyliczoną przy odczycie flagę pilności (FR-009).
 *
 * `is_urgent` jest wartością pochodną, ważną wyłącznie w momencie wyliczenia —
 * nie wolno jej utrwalać ani cache'ować między żądaniami.
 */
export interface TaskWithUrgency extends Task {
  is_urgent: boolean;
}

/** Dane wejściowe tworzenia zadania (FR-004). `due_date` jako string ISO 8601. */
export interface CreateTaskCommand {
  title: string;
  due_date: string;
}

/**
 * Dane wejściowe edycji zadania (FR-006, FR-008).
 * Wszystkie pola opcjonalne — aktualizacja częściowa (PATCH).
 */
export interface UpdateTaskCommand {
  title?: string;
  due_date?: string;
  completed?: boolean;
}
