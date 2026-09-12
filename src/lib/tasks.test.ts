import { describe, expect, it, vi } from "vitest";
import {
  createTask,
  deleteTask,
  listTasks,
  TaskInvariantError,
  TaskNotFoundError,
  TaskStorageError,
  TaskValidationError,
  updateTask,
} from "@/lib/tasks";
import type { TasksSupabaseClient } from "@/lib/tasks";
import type { Task } from "@/types";

/**
 * Testy warstwy danych (FR-004..FR-009).
 *
 * Supabase jest zastąpiony ręczną atrapą — żadnej biblioteki do mockowania,
 * żadnego połączenia z bazą. Atrapa odwzorowuje jedynie to, co warstwa danych
 * faktycznie konsumuje: łańcuch budowniczego zapytania kończący się obiektem
 * `{ data, error }`.
 *
 * Asercje celują w wynik funkcji (zwrócone dane, rzucony błąd), a nie w to,
 * jak zapytanie zostało zbudowane. Wyjątki od tej zasady są dwa i oba są
 * kontraktem, a nie lustrem implementacji:
 *  - przy niepoprawnym wejściu baza NIE MOŻE zostać dotknięta,
 *  - do bazy trafia znormalizowany ładunek (przycięty tytuł, data w ISO/UTC).
 */

interface PostgrestErrorLike {
  message: string;
  code?: string;
}

/** Kształt odpowiedzi PostgREST, którą atrapa oddaje warstwie danych. */
interface QueryOutcome {
  data: unknown;
  error: PostgrestErrorLike | null;
}

/**
 * Budowniczy zapytania: każda metoda filtrująca zwraca samego siebie,
 * a `then` czyni obiekt oczekiwalnym — tak samo zachowuje się prawdziwy
 * `PostgrestFilterBuilder`, który jest thenable, a nie Promise.
 */
interface QueryBuilderStub {
  select: (columns?: string) => QueryBuilderStub;
  order: (column: string, options?: { ascending: boolean }) => QueryBuilderStub;
  eq: (column: string, value: unknown) => QueryBuilderStub;
  insert: (payload: unknown) => QueryBuilderStub;
  update: (payload: unknown) => QueryBuilderStub;
  delete: () => QueryBuilderStub;
  single: () => Promise<QueryOutcome>;
  maybeSingle: () => Promise<QueryOutcome>;
  then: <TResult>(onFulfilled: (value: QueryOutcome) => TResult) => Promise<TResult>;
}

interface SupabaseStub {
  client: TasksSupabaseClient;
  /** Szpieg na wejściu do bazy. Brak wywołań = bazy w ogóle nie dotknięto. */
  from: ReturnType<typeof vi.fn>;
  /** Ładunki przekazane do `insert` / `update` oraz liczba wywołań `delete`. */
  inserted: unknown[];
  updated: unknown[];
  deleted: number;
}

function createSupabaseStub(outcome: QueryOutcome): SupabaseStub {
  const stub: SupabaseStub = {
    client: null as unknown as TasksSupabaseClient,
    from: vi.fn(),
    inserted: [],
    updated: [],
    deleted: 0,
  };

  const builder: QueryBuilderStub = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    insert: (payload) => {
      stub.inserted.push(payload);
      return builder;
    },
    update: (payload) => {
      stub.updated.push(payload);
      return builder;
    },
    delete: () => {
      stub.deleted += 1;
      return builder;
    },
    single: () => Promise.resolve(outcome),
    maybeSingle: () => Promise.resolve(outcome),
    then: (onFulfilled) => Promise.resolve(outcome).then(onFulfilled),
  };

  stub.from = vi.fn(() => builder);
  stub.client = { from: stub.from } as unknown as TasksSupabaseClient;

  return stub;
}

const NOW = new Date("2026-03-15T09:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const USER_ID = "22222222-2222-4222-8222-222222222222";

function dueAt(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function makeRow(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: USER_ID,
    title: "Odebrać paczkę z paczkomatu",
    due_date: dueAt(24 * HOUR),
    completed: false,
    created_at: "2026-03-01T08:00:00.000Z",
    updated_at: "2026-03-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("odczyt listy zadań", () => {
  it("dokłada flagę pilności do każdego wiersza, licząc ją względem jednego wspólnego momentu", async () => {
    const wiersze = [
      makeRow({ id: "a", due_date: dueAt(47 * HOUR + 59 * MINUTE) }),
      makeRow({ id: "b", due_date: dueAt(48 * HOUR) }),
      makeRow({ id: "c", due_date: dueAt(48 * HOUR + 1) }),
      makeRow({ id: "d", due_date: dueAt(-30 * HOUR) }),
      makeRow({ id: "e", due_date: dueAt(HOUR), completed: true }),
    ];
    const stub = createSupabaseStub({ data: wiersze, error: null });

    const wynik = await listTasks(stub.client, NOW);

    expect(wynik.map((task) => [task.id, task.is_urgent])).toEqual([
      ["a", true],
      ["b", true],
      ["c", false],
      ["d", true],
      ["e", false],
    ]);
  });

  it("nie gubi ani nie przerabia pozostałych pól zwróconych wierszy", async () => {
    const wiersz = makeRow({ due_date: dueAt(3 * HOUR) });
    const stub = createSupabaseStub({ data: [wiersz], error: null });

    const wynik = await listTasks(stub.client, NOW);

    expect(wynik).toEqual([{ ...wiersz, is_urgent: true }]);
  });

  it("cała lista przeliczona dla późniejszego momentu zmienia flagi spójnie", async () => {
    const wiersze = [
      makeRow({ id: "a", due_date: dueAt(50 * HOUR) }),
      makeRow({ id: "b", due_date: dueAt(60 * HOUR) }),
    ];

    const przed = await listTasks(createSupabaseStub({ data: wiersze, error: null }).client, NOW);
    const po = await listTasks(
      createSupabaseStub({ data: wiersze, error: null }).client,
      new Date(NOW.getTime() + 13 * HOUR),
    );

    expect(przed.map((task) => task.is_urgent)).toEqual([false, false]);
    expect(po.map((task) => task.is_urgent)).toEqual([true, true]);
  });

  it("użytkownik bez zadań dostaje pustą listę, a nie błąd", async () => {
    const stub = createSupabaseStub({ data: [], error: null });

    await expect(listTasks(stub.client, NOW)).resolves.toEqual([]);
  });

  it("błąd bazy jest propagowany jako wyjątek, a nie zamieniany na pustą listę", async () => {
    const stub = createSupabaseStub({
      data: null,
      error: { message: "permission denied for table tasks", code: "42501" },
    });

    await expect(listTasks(stub.client, NOW)).rejects.toThrow(/Nie udało się pobrać listy zadań/);
    await expect(listTasks(stub.client, NOW)).rejects.toThrow(/permission denied for table tasks/);
  });

  it("propagowany błąd zachowuje oryginalną przyczynę z bazy", async () => {
    const zrodlowyBlad = { message: "JWT expired", code: "PGRST301" };
    const stub = createSupabaseStub({ data: null, error: zrodlowyBlad });

    await expect(listTasks(stub.client, NOW)).rejects.toMatchObject({ cause: zrodlowyBlad });
  });
});

describe("tworzenie zadania", () => {
  it.each([
    ["pusty tytuł", ""],
    ["same spacje", "   "],
    ["tabulacja i nowa linia", "\t\n"],
  ])("odmawia utworzenia zadania, gdy tytuł to %s", async (_opis, title) => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(createTask(stub.client, USER_ID, { title, due_date: dueAt(HOUR) })).rejects.toThrow(
      /Tytuł zadania nie może być pusty/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("odmawia utworzenia zadania o tytule dłuższym niż 200 znaków i mówi, gdzie jest limit", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(createTask(stub.client, USER_ID, { title: "x".repeat(201), due_date: dueAt(HOUR) })).rejects.toThrow(
      /najwyżej 200 znaków/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("przyjmuje tytuł o długości dokładnie 200 znaków (granica domknięta)", async () => {
    const title = "x".repeat(200);
    const stub = createSupabaseStub({ data: makeRow({ title }), error: null });

    await expect(createTask(stub.client, USER_ID, { title, due_date: dueAt(HOUR) })).resolves.toMatchObject({ title });
  });

  it.each([
    ["tekst zamiast daty", "jutro po południu"],
    ["nieistniejący miesiąc", "2026-13-45"],
    ["data w formacie dziennym", "30.02.2026"],
    ["pusty string", ""],
  ])("odmawia utworzenia zadania z nieparsowalnym terminem (%s)", async (_opis, dueDate) => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: dueDate })).rejects.toThrow(
      /Termin wykonania/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("odmawia utworzenia zadania bez właściciela", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(createTask(stub.client, "", { title: "Zapłacić rachunek", due_date: dueAt(HOUR) })).rejects.toThrow(
      /identyfikatora użytkownika/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("zapisuje tytuł bez zbędnych spacji i termin znormalizowany do ISO w UTC", async () => {
    const stub = createSupabaseStub({ data: makeRow(), error: null });

    await createTask(stub.client, USER_ID, {
      title: "   Zapłacić rachunek   ",
      due_date: "2026-03-16T10:30:00+02:00",
    });

    expect(stub.inserted).toEqual([
      { user_id: USER_ID, title: "Zapłacić rachunek", due_date: "2026-03-16T08:30:00.000Z" },
    ]);
  });

  it("nie ustawia statusu ukończenia — nowe zadanie jest nieukończone z domyślnej wartości w bazie", async () => {
    const stub = createSupabaseStub({ data: makeRow(), error: null });

    await createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: dueAt(HOUR) });

    expect(stub.inserted[0]).not.toHaveProperty("completed");
  });

  it("propaguje błąd zapisu z bazy", async () => {
    const stub = createSupabaseStub({
      data: null,
      error: { message: "new row violates row-level security policy", code: "42501" },
    });

    await expect(
      createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: dueAt(HOUR) }),
    ).rejects.toThrow(/Nie udało się utworzyć zadania/);
  });
});

describe("edycja zadania", () => {
  it("pusta komenda kończy się błędem zamiast cichym brakiem działania", async () => {
    const stub = createSupabaseStub({ data: makeRow(), error: null });

    await expect(updateTask(stub.client, "task-1", {})).rejects.toThrow(/Nie podano żadnych zmian do zapisania/);
    expect(stub.from).not.toHaveBeenCalled();
    expect(stub.updated).toEqual([]);
  });

  it("brak zadania do aktualizacji kończy się błędem, nie cichym powodzeniem", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(updateTask(stub.client, "task-obcy", { completed: true })).rejects.toThrow(
      /Nie znaleziono zadania do aktualizacji/,
    );
  });

  it("zmienia wyłącznie pola obecne w komendzie — pominięte pole znaczy nie zmieniaj", async () => {
    const stub = createSupabaseStub({ data: makeRow({ completed: true }), error: null });

    await updateTask(stub.client, "task-1", { completed: true });

    expect(stub.updated).toEqual([{ completed: true }]);
  });

  it("odmawia zapisania pustego tytułu", async () => {
    const stub = createSupabaseStub({ data: makeRow(), error: null });

    await expect(updateTask(stub.client, "task-1", { title: "   " })).rejects.toThrow(
      /Tytuł zadania nie może być pusty/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("odmawia zapisania nieparsowalnego terminu", async () => {
    const stub = createSupabaseStub({ data: makeRow(), error: null });

    await expect(updateTask(stub.client, "task-1", { due_date: "kiedyś tam" })).rejects.toThrow(
      /Termin wykonania musi być poprawną datą/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("odmawia edycji bez identyfikatora zadania", async () => {
    const stub = createSupabaseStub({ data: makeRow(), error: null });

    await expect(updateTask(stub.client, "  ", { completed: true })).rejects.toThrow(/Brak identyfikatora zadania/);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("zwraca zaktualizowany wiersz po udanym zapisie", async () => {
    const wiersz = makeRow({ completed: true });
    const stub = createSupabaseStub({ data: wiersz, error: null });

    await expect(updateTask(stub.client, "task-1", { completed: true })).resolves.toEqual(wiersz);
  });

  it("propaguje błąd zapisu z bazy", async () => {
    const stub = createSupabaseStub({ data: null, error: { message: "deadlock detected", code: "40P01" } });

    await expect(updateTask(stub.client, "task-1", { completed: true })).rejects.toThrow(
      /Nie udało się zaktualizować zadania/,
    );
  });
});

describe("usuwanie zadania", () => {
  it("brak zadania do usunięcia kończy się błędem, nie cichym powodzeniem", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(deleteTask(stub.client, "task-obcy")).rejects.toThrow(/Nie znaleziono zadania do usunięcia/);
  });

  it("odmawia usunięcia bez identyfikatora zadania i nie dotyka bazy", async () => {
    const stub = createSupabaseStub({ data: { id: "task-1" }, error: null });

    await expect(deleteTask(stub.client, "")).rejects.toThrow(/Brak identyfikatora zadania/);
    expect(stub.from).not.toHaveBeenCalled();
    expect(stub.deleted).toBe(0);
  });

  it("usunięcie istniejącego zadania kończy się powodzeniem", async () => {
    const stub = createSupabaseStub({ data: { id: "task-1" }, error: null });

    await expect(deleteTask(stub.client, "task-1")).resolves.toBeUndefined();
    expect(stub.deleted).toBe(1);
  });

  it("propaguje błąd usuwania z bazy", async () => {
    const stub = createSupabaseStub({ data: null, error: { message: "connection reset", code: "08006" } });

    await expect(deleteTask(stub.client, "task-1")).rejects.toThrow(/Nie udało się usunąć zadania/);
  });
});

describe("kalendarzowa poprawność terminu", () => {
  // new Date("2026-02-30") nie jest w JS błędem — cicho przewija się na 2026-03-02.
  // Termin przesunięty o dwa dni przesuwa też flagę pilności, a użytkownik nic o tym nie wie.
  it.each([
    ["30 lutego", "2026-02-30"],
    ["30 lutego z godziną", "2026-02-30T10:00"],
    ["31 kwietnia", "2026-04-31"],
    ["29 lutego w roku nieprzestępnym", "2026-02-29"],
    ["32 dzień miesiąca", "2026-01-32"],
  ])(
    "odmawia przyjęcia nieistniejącej daty (%s) zamiast po cichu przewinąć ją na kolejny miesiąc",
    async (_opis, dueDate) => {
      const stub = createSupabaseStub({ data: null, error: null });

      await expect(createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: dueDate })).rejects.toThrow(
        /Termin wykonania musi być poprawną datą/,
      );
      expect(stub.from).not.toHaveBeenCalled();
    },
  );

  it("odmawia przyjęcia nieistniejącej godziny — odsiewa ją już parser daty", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(
      createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: "2026-03-15T25:00" }),
    ).rejects.toThrow(/Termin wykonania musi być poprawną datą/);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("przyjmuje 29 lutego w roku przestępnym", async () => {
    const stub = createSupabaseStub({ data: makeRow({}), error: null });

    await expect(
      createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: "2024-02-29T10:00" }),
    ).resolves.toBeDefined();
  });

  it("przyjmuje zwyczajny termin z pola datetime-local", async () => {
    const stub = createSupabaseStub({ data: makeRow({}), error: null });

    await expect(
      createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: "2026-03-15T14:30" }),
    ).resolves.toBeDefined();
  });

  it("ta sama walidacja obowiązuje przy edycji terminu", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(updateTask(stub.client, "task-1", { due_date: "2026-02-30" })).rejects.toThrow(
      /Termin wykonania musi być poprawną datą/,
    );
    expect(stub.from).not.toHaveBeenCalled();
  });
});

describe("typ rzucanego błędu", () => {
  /**
   * Warstwa HTTP rozpoznaje sytuację przez `instanceof`, a nie po prefiksie
   * komunikatu. Te asercje pilnują KLASYFIKACJI — asercje na treść (wyżej)
   * pilnują tego, co zobaczy użytkownik. Jedno bez drugiego nie wystarcza:
   * poprawny napis w złej klasie da 500 zamiast 404, a poprawna klasa
   * z wykrzywionym napisem da mylący komunikat.
   */
  it("niepoprawne wejście użytkownika jest błędem walidacji", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(createTask(stub.client, USER_ID, { title: "  ", due_date: dueAt(HOUR) })).rejects.toBeInstanceOf(
      TaskValidationError,
    );
    await expect(
      createTask(stub.client, USER_ID, { title: "Zapłacić rachunek", due_date: "jutro" }),
    ).rejects.toBeInstanceOf(TaskValidationError);
    await expect(updateTask(stub.client, "task-1", {})).rejects.toBeInstanceOf(TaskValidationError);
    await expect(deleteTask(stub.client, " ")).rejects.toBeInstanceOf(TaskValidationError);
  });

  it("brak właściciela to naruszenie inwariantu serwera, a NIE błąd walidacji wejścia", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    // Właściciela wyznacza sesja, nie żądanie — użytkownik nie ma czego poprawić,
    // więc ta sytuacja nie może zostać zaklasyfikowana jako wejście do poprawy (400).
    await expect(createTask(stub.client, "", { title: "Zapłacić rachunek", due_date: dueAt(HOUR) })).rejects.toSatisfy(
      (error: unknown) => error instanceof TaskInvariantError && !(error instanceof TaskValidationError),
    );
  });

  it("brak trafionego wiersza jest błędem typu „nie znaleziono”", async () => {
    const stub = createSupabaseStub({ data: null, error: null });

    await expect(updateTask(stub.client, "task-obcy", { completed: true })).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(deleteTask(stub.client, "task-obcy")).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("awaria bazy jest błędem magazynu danych, nie walidacją ani brakiem zadania", async () => {
    const stub = createSupabaseStub({
      data: null,
      error: { message: "permission denied for table tasks", code: "42501" },
    });

    await expect(listTasks(stub.client, NOW)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof TaskStorageError &&
        !(error instanceof TaskValidationError) &&
        !(error instanceof TaskNotFoundError),
    );
  });
});
