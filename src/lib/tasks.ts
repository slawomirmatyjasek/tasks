import type { createClient } from "@/lib/supabase";
import type { CreateTaskCommand, Task, TaskWithUrgency, UpdateTaskCommand } from "@/types";
import { withUrgency } from "@/lib/urgency";

/**
 * Warstwa dostępu do danych dla tabeli `public.tasks` (FR-004..FR-008).
 *
 * Zasady obowiązujące w całym module:
 *
 * - **Klient Supabase jest wstrzykiwany**, nigdy tworzony tutaj. `createClient`
 *   z `@/lib/supabase` czyta sekrety z `astro:env/server` i potrzebuje nagłówków
 *   oraz ciasteczek żądania — tworzenie go w tej warstwie przywiązałoby logikę
 *   danych do kontekstu HTTP i uniemożliwiło testowanie.
 * - **Błędy Supabase są propagowane**, nie połykane. Każdy `error` z PostgREST
 *   kończy się rzuconym wyjątkiem z kontekstem operacji i oryginalnym błędem
 *   w `cause`. Ciche `try/catch` zwracające pustą listę zamieniłoby awarię bazy
 *   albo odmowę RLS w "użytkownik nie ma zadań" — to najgorszy możliwy wynik.
 * - **Izolacja użytkowników opiera się na RLS** (`auth.uid() = user_id`), a nie
 *   na filtrze w zapytaniu. Zapytania nie dokładają `where user_id = ...`,
 *   bo baza i tak nie pokaże cudzych wierszy — a gdyby polityka zniknęła,
 *   ręczny filtr tylko zamaskowałby lukę.
 * - **Pilność nie jest kolumną.** `listTasks` dokleja ją przy odczycie przez
 *   `withUrgency` (AGENTS.md, "Hard rules").
 * - **Rodzaj błędu niesie typ, nie treść komunikatu.** Wywołujący (endpoint)
 *   rozpoznaje sytuację przez `instanceof`, a nie przez prefiks polskiego
 *   napisu. Komunikat jest tekstem dla użytkownika i wolno go przeredagować
 *   bez ryzyka, że PATCH na cudze zadanie zacznie zwracać 500 zamiast 404.
 */

/**
 * Wspólna baza wszystkich błędów tej warstwy.
 *
 * Istnieje po to, żeby dało się jednym `instanceof` odróżnić "to nasz,
 * przewidziany przypadek" od dowolnego innego wyjątku (błąd programisty,
 * awaria runtime'u), który musi wyjść na zewnątrz jako 500.
 */
export abstract class TaskError extends Error {}

/**
 * Wejście użytkownika jest niepoprawne — winny jest klient, nie serwer.
 * Warstwa HTTP mapuje ten błąd na 400, a jego komunikat idzie do użytkownika:
 * jest pisany przez nas po polsku i nie zawiera niczego z bazy.
 */
export class TaskValidationError extends TaskError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskValidationError";
  }
}

/**
 * Operacja nie trafiła w żaden wiersz: zadanie nie istnieje ALBO należy do
 * kogoś innego i odfiltrowała je polityka RLS. Te dwa przypadki są celowo
 * nierozróżnialne (US-05) — warstwa HTTP mapuje je na 404 z tym samym
 * komunikatem, żeby nie powstał kanał zdradzający, który identyfikator
 * istnieje w bazie.
 */
export class TaskNotFoundError extends TaskError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskNotFoundError";
  }
}

/**
 * Treści komunikatów "nie znaleziono" — wyeksportowane celowo.
 *
 * Warstwa HTTP musi umieć odpowiedzieć DOKŁADNIE tak samo także wtedy, gdy
 * w ogóle nie pyta bazy (np. identyfikator o kształcie niebędącym UUID-em,
 * który Postgres odrzuciłby błędem `22P02`). Gdyby endpoint miał własny napis,
 * rozjechanie się obu treści zrobiłoby kanał zdradzający, który identyfikator
 * jest "prawdziwy" (US-05).
 */
export const TASK_NOT_FOUND_MESSAGE = {
  update: "Nie znaleziono zadania do aktualizacji.",
  delete: "Nie znaleziono zadania do usunięcia.",
} as const;

/**
 * Naruszenie inwariantu po stronie serwera — np. wywołanie `createTask` bez
 * identyfikatora właściciela. To NIE jest błąd wejścia użytkownika: żądanie
 * HTTP nie ma wpływu na tę wartość (właściciela wyznacza sesja), więc
 * odpowiedź 400 byłaby kłamstwem i kazałaby użytkownikowi poprawiać coś,
 * czego nie kontroluje. Warstwa HTTP mapuje ten błąd na 500.
 */
export class TaskInvariantError extends TaskError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskInvariantError";
  }
}

/**
 * Awaria po stronie bazy (błąd PostgREST, odmowa RLS, brak zwróconego wiersza).
 *
 * Komunikat zawiera treść i kod błędu z Postgresa — jest przeznaczony
 * WYŁĄCZNIE do logu serwera. Warstwie HTTP nie wolno pokazać jej użytkownikowi:
 * ujawniałaby nazwy tabel, kody błędów i stan konfiguracji.
 */
export class TaskStorageError extends TaskError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskStorageError";
  }
}

/**
 * Typ klienta Supabase oczekiwanego przez funkcje tego modułu.
 *
 * `createClient` zwraca `null`, gdy brakuje konfiguracji środowiska —
 * `NonNullable` wymusza, żeby ten przypadek został obsłużony przez wywołującego
 * (endpoint/strona), zanim dane w ogóle zostaną dotknięte.
 */
export type TasksSupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const TASKS_TABLE = "tasks";
const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 200;

/**
 * Waliduje i normalizuje tytuł zadania (US-01: tytuł wymagany i niepusty).
 * Ograniczenia są lustrzanym odbiciem `check` z migracji — walidujemy tutaj,
 * żeby użytkownik dostał komunikat po polsku zamiast błędu constraintu bazy.
 *
 * @throws {TaskValidationError} gdy tytuł jest pusty lub dłuższy niż 200 znaków.
 */
function normalizeTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw new TaskValidationError("Tytuł zadania jest wymagany.");
  }

  const trimmed = title.trim();

  if (trimmed.length < TITLE_MIN_LENGTH) {
    throw new TaskValidationError("Tytuł zadania nie może być pusty.");
  }

  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new TaskValidationError(`Tytuł zadania może mieć najwyżej ${TITLE_MAX_LENGTH} znaków.`);
  }

  return trimmed;
}

/**
 * Waliduje termin wykonania i normalizuje go do ISO 8601 w UTC.
 *
 * Normalizacja jest świadoma: do bazy trafia jednoznaczny moment w czasie,
 * więc próg 48h liczy się tak samo niezależnie od strefy, w której użytkownik
 * wpisał datę.
 *
 * @throws {TaskValidationError} gdy wartość nie jest parsowalną datą.
 */
/**
 * Kształt daty ISO, który potrafimy zweryfikować kalendarzowo.
 * Interesuje nas wylacznie czlon Y-M-D; godzine odrzuca juz sam parser Date.
 */
const ISO_DATE_TIME_SHAPE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * `new Date("2026-02-30")` nie jest w JS błędem — cicho przewija się na 2026-03-02.
 * Użytkownik dostałby wtedy termin przesunięty o dwa dni, a wraz z nim przesuniętą
 * flagę pilności, nigdzie o tym nie poinformowany. Dlatego zanim zaufamy wynikowi
 * parsowania, sprawdzamy, czy podany dzień w ogóle istnieje w kalendarzu.
 */
function assertRealCalendarDate(raw: string): void {
  const match = ISO_DATE_TIME_SHAPE.exec(raw);

  if (!match) {
    // Format spoza ISO — nie mamy czego porównywać, zdajemy się na new Date().
    return;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Ramka UTC: interesuje nas wyłącznie istnienie dnia w kalendarzu, nie strefa czasowa.
  const probe = new Date(Date.UTC(year, month - 1, day));
  const rolledOver = probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day;

  if (rolledOver) {
    throw new TaskValidationError("Termin wykonania musi być poprawną datą.");
  }
}

function normalizeDueDate(dueDate: unknown): string {
  if (typeof dueDate !== "string" || dueDate.trim().length === 0) {
    throw new TaskValidationError("Termin wykonania jest wymagany.");
  }

  const raw = dueDate.trim();
  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    throw new TaskValidationError("Termin wykonania musi być poprawną datą.");
  }

  assertRealCalendarDate(raw);

  return parsed.toISOString();
}

/** Minimalny kształt błędu zwracanego przez PostgREST, którego tu używamy. */
interface SupabaseErrorLike {
  message: string;
  code?: string;
}

/**
 * Odpowiedź Supabase dla zapytania o pojedynczy wiersz.
 *
 * Klient nie jest sparametryzowany typami bazy, więc `data` przychodzi jako
 * `any`. Rzutowanie na ten kształt w jednym miejscu zamyka `any` na granicy
 * modułu, zamiast rozlewać je po całej aplikacji.
 */
interface SingleRowResult<T> {
  data: T | null;
  error: SupabaseErrorLike | null;
}

/** Wspólny sposób opakowania błędu z Supabase, żeby nie gubić przyczyny. */
function failure(operation: string, error: SupabaseErrorLike): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new TaskStorageError(`${operation}: ${error.message}${code}`, { cause: error });
}

/**
 * Zwraca zadania zalogowanego użytkownika z wyliczoną flagą pilności (FR-005, FR-009).
 *
 * Kolejność: najpierw nieukończone, potem ukończone; w obrębie grupy rosnąco
 * po terminie (najbliższy termin na górze — US-01). Sortowanie robi baza,
 * bo `completed` i `due_date` są indeksowalne, a lista może rosnąć.
 *
 * Zakres wierszy wyznacza polityka RLS `tasks_select_own`.
 *
 * @param supabase Klient Supabase powiązany z sesją użytkownika.
 * @param now Moment odniesienia dla flagi pilności; domyślnie bieżący czas.
 *            Jeden wspólny `now` dla całej listy, żeby flagi były spójne.
 * @throws {TaskStorageError} gdy odczyt z bazy się nie powiedzie.
 */
export async function listTasks(supabase: TasksSupabaseClient, now: Date = new Date()): Promise<TaskWithUrgency[]> {
  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    // `false` sortuje się przed `true`, więc rosnąco = nieukończone najpierw.
    .order("completed", { ascending: true })
    .order("due_date", { ascending: true });

  if (error) {
    throw failure("Nie udało się pobrać listy zadań", error);
  }

  // Po odsianiu `error` klient zawęża odpowiedź tak, że `data` nie może być null
  // (dla select() PostgREST zwraca tablicę, pustą gdy brak wierszy).
  const tasks = data as Task[];

  return tasks.map((task) => withUrgency(task, now));
}

/**
 * Tworzy nowe zadanie użytkownika (FR-004 / US-01).
 *
 * `completed` nie jest ustawiane jawnie — domyślna wartość `false` z migracji
 * jest jedynym źródłem prawdy dla "nowe zadanie jest nieukończone".
 *
 * @param supabase Klient Supabase powiązany z sesją użytkownika.
 * @param userId Identyfikator właściciela; musi zgadzać się z `auth.uid()`,
 *               inaczej polityka `tasks_insert_own` odrzuci zapis.
 * @param command Tytuł i termin wykonania.
 * @throws {TaskValidationError} przy niepoprawnym wejściu, {TaskInvariantError} przy braku
 *         właściciela, {TaskStorageError} przy błędzie zapisu.
 */
export async function createTask(
  supabase: TasksSupabaseClient,
  userId: string,
  command: CreateTaskCommand,
): Promise<Task> {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new TaskInvariantError("Brak identyfikatora użytkownika — zadanie musi mieć właściciela.");
  }

  const payload = {
    user_id: userId,
    title: normalizeTitle(command.title),
    due_date: normalizeDueDate(command.due_date),
  };

  const { data, error } = (await supabase
    .from(TASKS_TABLE)
    .insert(payload)
    .select("*")
    .single()) as SingleRowResult<Task>;

  if (error) {
    throw failure("Nie udało się utworzyć zadania", error);
  }

  if (!data) {
    throw new TaskStorageError("Nie udało się utworzyć zadania: baza nie zwróciła zapisanego wiersza.");
  }

  return data;
}

/**
 * Aktualizuje tytuł, termin lub status ukończenia zadania (FR-006, FR-008).
 *
 * Aktualizacja jest częściowa — do bazy trafiają wyłącznie pola obecne
 * w komendzie. Pominięte pole oznacza "nie zmieniaj", a nie "wyczyść".
 * `updated_at` ustawia trigger w bazie, nie ta funkcja.
 *
 * Brak jakiegokolwiek pola do zmiany jest traktowany jako błąd wejścia,
 * a nie po cichu jako no-op — milczące powodzenie ukryłoby błąd wywołującego.
 *
 * Próba edycji cudzego zadania kończy się brakiem trafionego wiersza
 * (polityka `tasks_update_own`) i błędem {@link TaskNotFoundError} — zgodnie
 * z US-05: odmowa dostępu, bez zdradzania, czy taki rekord istnieje.
 *
 * @throws {TaskValidationError} przy niepoprawnym wejściu, {TaskNotFoundError} gdy zadanie
 *         nie istnieje lub należy do kogoś innego, {TaskStorageError} przy błędzie zapisu.
 */
export async function updateTask(supabase: TasksSupabaseClient, id: string, command: UpdateTaskCommand): Promise<Task> {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TaskValidationError("Brak identyfikatora zadania.");
  }

  const patch: UpdateTaskCommand = {};

  if (command.title !== undefined) {
    patch.title = normalizeTitle(command.title);
  }

  if (command.due_date !== undefined) {
    patch.due_date = normalizeDueDate(command.due_date);
  }

  if (command.completed !== undefined) {
    if (typeof command.completed !== "boolean") {
      throw new TaskValidationError("Status ukończenia musi być wartością logiczną.");
    }
    patch.completed = command.completed;
  }

  if (Object.keys(patch).length === 0) {
    throw new TaskValidationError("Nie podano żadnych zmian do zapisania.");
  }

  const { data, error } = (await supabase
    .from(TASKS_TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle()) as SingleRowResult<Task>;

  if (error) {
    throw failure("Nie udało się zaktualizować zadania", error);
  }

  if (!data) {
    throw new TaskNotFoundError(TASK_NOT_FOUND_MESSAGE.update);
  }

  return data;
}

/**
 * Usuwa zadanie (FR-007 / US-04).
 *
 * Operacja jest nieodwracalna; potwierdzenie zamiaru należy do warstwy UI.
 * Zakres usunięcia ogranicza polityka `tasks_delete_own` — próba usunięcia
 * cudzego zadania nie usuwa niczego i kończy się błędem {@link TaskNotFoundError}.
 *
 * @throws {TaskValidationError} przy braku identyfikatora, {TaskNotFoundError} gdy zadanie
 *         nie istnieje lub należy do kogoś innego, {TaskStorageError} przy błędzie bazy.
 */
export async function deleteTask(supabase: TasksSupabaseClient, id: string): Promise<void> {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TaskValidationError("Brak identyfikatora zadania.");
  }

  // `select` po `delete` pozwala odróżnić "usunięto" od "nie było czego usunąć"
  // (np. cudze zadanie odfiltrowane przez RLS) bez dodatkowego zapytania.
  const { data, error } = (await supabase
    .from(TASKS_TABLE)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle()) as SingleRowResult<Pick<Task, "id">>;

  if (error) {
    throw failure("Nie udało się usunąć zadania", error);
  }

  if (!data) {
    throw new TaskNotFoundError(TASK_NOT_FOUND_MESSAGE.delete);
  }
}
