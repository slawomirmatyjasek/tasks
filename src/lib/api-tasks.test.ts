import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { APIContext } from "astro";
import { TASK_NOT_FOUND_MESSAGE, TaskNotFoundError, TaskStorageError, TaskValidationError } from "@/lib/tasks";
import type { Task } from "@/types";

/**
 * Testy warstwy HTTP zadań (`src/pages/api/tasks/*`).
 *
 * Dlaczego ten plik leży w `src/lib/`, a nie obok endpointów: wszystko
 * w `src/pages/` jest dla Astro trasą. Plik `*.test.ts` położony tam zostałby
 * potraktowany jako endpoint i trafił do builda — testy nie mogą tworzyć
 * publicznych adresów URL.
 *
 * Zakres: WYŁĄCZNIE logika endpointu. Warstwa danych (`@/lib/tasks`) jest
 * zamockowana, więc testy nie powtarzają tego, co sprawdza `tasks.test.ts`,
 * tylko odpowiadają na pytania, których tamten plik nie zadaje:
 *
 *  - czy bramka sesji odcina żądanie ZANIM cokolwiek dotknie bazy (US-05),
 *  - czy właściciel zadania pochodzi wyłącznie z sesji, nigdy z ciała żądania,
 *  - czy typ wyjątku z serwisu zamienia się na właściwy status HTTP,
 *  - czy treść błędu bazy nigdy nie wychodzi do użytkownika.
 *
 * Klasy błędów są brane z PRAWDZIWEGO modułu (mock rozszerza oryginał), bo
 * mapowanie w endpointach działa przez `instanceof` — atrapa klasy dawałaby
 * inną tożsamość i test przestałby cokolwiek sprawdzać.
 */

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/tasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tasks")>();
  return {
    ...actual,
    createTask: mocks.createTask,
    updateTask: mocks.updateTask,
    deleteTask: mocks.deleteTask,
  };
});

const { POST } = await import("@/pages/api/tasks/index");
const { PATCH, DELETE } = await import("@/pages/api/tasks/[id]");

const SESSION_USER = { id: "22222222-2222-4222-8222-222222222222", email: "kasia@example.com" };
const ATTACKER_ID = "99999999-9999-4999-8999-999999999999";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const DUE_DATE = "2026-03-16T08:30:00.000Z";
const GENERIC_FAILURE_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";

/** Atrapa klienta Supabase — endpoint tylko ją przekazuje dalej, nic z niej nie czyta. */
const supabaseStub = { from: vi.fn() };

/** Atrapa `context.cookies`; endpointy zadań nie dotykają ciasteczek same z siebie. */
const cookiesStub = {
  get: () => undefined,
  set: () => undefined,
  delete: () => undefined,
  has: () => false,
};

interface ContextOptions {
  /** `null` odwzorowuje żądanie bez sesji (middleware nic nie ustawiło). */
  user?: { id: string } | null;
  /** Ciało żądania: obiekt jest serializowany, string idzie dosłownie (test złego JSON-a). */
  body?: unknown;
  params?: Record<string, string | undefined>;
  method?: string;
}

function createContext(options: ContextOptions = {}): APIContext {
  const { user = SESSION_USER, body, params = {}, method = "POST" } = options;

  const request = new Request("https://pilne.test/api/tasks", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

  return {
    locals: { user },
    request,
    params,
    cookies: cookiesStub,
  } as unknown as APIContext;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    user_id: SESSION_USER.id,
    title: "Odebrać paczkę z paczkomatu",
    due_date: DUE_DATE,
    completed: false,
    created_at: "2026-03-01T08:00:00.000Z",
    updated_at: "2026-03-01T08:00:00.000Z",
    ...overrides,
  };
}

async function readBody(response: Response): Promise<{ error?: string; task?: Task; id?: string }> {
  return (await response.json()) as { error?: string; task?: Task; id?: string };
}

/** Kompletny, poprawny PATCH — testy bramek podmieniają tylko to, co badają. */
function patchContext(options: ContextOptions = {}): APIContext {
  return createContext({ method: "PATCH", body: { completed: true }, params: { id: TASK_ID }, ...options });
}

function deleteContext(options: ContextOptions = {}): APIContext {
  return createContext({ method: "DELETE", params: { id: TASK_ID }, ...options });
}

function postContext(options: ContextOptions = {}): APIContext {
  return createContext({ method: "POST", body: { title: "Zapłacić rachunek", due_date: DUE_DATE }, ...options });
}

/**
 * Szpieg na logu serwera. Trzymany w zmiennej, a nie odpytywany przez
 * `expect(console.error)` — referencja do metody globalnego obiektu wpada
 * w regułę `@typescript-eslint/unbound-method`.
 */
let errorLog: MockInstance;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockReturnValue(supabaseStub);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bramka sesji", () => {
  it("POST bez zalogowanego użytkownika kończy się 401 i nie dotyka bazy", async () => {
    const response = await POST(createContext({ user: null, body: { title: "x", due_date: DUE_DATE } }));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("PATCH bez zalogowanego użytkownika kończy się 401 i nie dotyka bazy", async () => {
    const response = await PATCH(patchContext({ user: null }));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("DELETE bez zalogowanego użytkownika kończy się 401 i nie dotyka bazy", async () => {
    const response = await DELETE(deleteContext({ user: null }));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.deleteTask).not.toHaveBeenCalled();
  });

  it("odpowiedź 401 niesie polski komunikat, a nie pustkę", async () => {
    const response = await POST(postContext({ user: null }));

    expect((await readBody(response)).error).toMatch(/zalogowany/i);
  });
});

describe("bramka konfiguracji Supabase", () => {
  it("POST przy braku skonfigurowanego Supabase kończy się 503, nie 500", async () => {
    mocks.createClient.mockReturnValue(null);

    const response = await POST(postContext());

    expect(response.status).toBe(503);
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("PATCH przy braku skonfigurowanego Supabase kończy się 503", async () => {
    mocks.createClient.mockReturnValue(null);

    const response = await PATCH(patchContext());

    expect(response.status).toBe(503);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("DELETE przy braku skonfigurowanego Supabase kończy się 503", async () => {
    mocks.createClient.mockReturnValue(null);

    const response = await DELETE(deleteContext());

    expect(response.status).toBe(503);
    expect(mocks.deleteTask).not.toHaveBeenCalled();
  });
});

describe("granica bezpieczeństwa US-05: właściciela wyznacza wyłącznie sesja", () => {
  it("user_id podany w ciele żądania jest ignorowany — do warstwy danych trafia identyfikator z sesji", async () => {
    mocks.createTask.mockResolvedValue(makeTask());

    const response = await POST(
      postContext({ body: { title: "Zapłacić rachunek", due_date: DUE_DATE, user_id: ATTACKER_ID } }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    // Deep equality na komendzie: gdyby `user_id` przeciekło do ładunku, ta asercja padnie.
    expect(mocks.createTask).toHaveBeenCalledWith(supabaseStub, SESSION_USER.id, {
      title: "Zapłacić rachunek",
      due_date: DUE_DATE,
    });
    expect(mocks.createTask).not.toHaveBeenCalledWith(expect.anything(), ATTACKER_ID, expect.anything());
  });

  it("zadanie utworzone przez podszywającego się klienta i tak należy do właściciela sesji", async () => {
    mocks.createTask.mockResolvedValue(makeTask());

    const response = await POST(
      postContext({ body: { title: "Zapłacić rachunek", due_date: DUE_DATE, user_id: ATTACKER_ID } }),
    );

    expect((await readBody(response)).task?.user_id).toBe(SESSION_USER.id);
  });

  it("PATCH nie przekazuje do warstwy danych niczego poza identyfikatorem z adresu i polami komendy", async () => {
    mocks.updateTask.mockResolvedValue(makeTask({ completed: true }));

    await PATCH(patchContext({ body: { completed: true, user_id: ATTACKER_ID, id: "podmieniony" } }));

    expect(mocks.updateTask).toHaveBeenCalledWith(supabaseStub, TASK_ID, { completed: true });
  });
});

describe("mapowanie wyjątków warstwy danych na status HTTP", () => {
  it("TaskNotFoundError z edycji daje 404 z komunikatem napisanym przez nas", async () => {
    mocks.updateTask.mockRejectedValue(new TaskNotFoundError(TASK_NOT_FOUND_MESSAGE.update));

    const response = await PATCH(patchContext());

    expect(response.status).toBe(404);
    expect((await readBody(response)).error).toBe(TASK_NOT_FOUND_MESSAGE.update);
  });

  it("TaskNotFoundError z usuwania daje 404 z komunikatem napisanym przez nas", async () => {
    mocks.deleteTask.mockRejectedValue(new TaskNotFoundError(TASK_NOT_FOUND_MESSAGE.delete));

    const response = await DELETE(deleteContext());

    expect(response.status).toBe(404);
    expect((await readBody(response)).error).toBe(TASK_NOT_FOUND_MESSAGE.delete);
  });

  it("TaskValidationError daje 400 i przekazuje użytkownikowi treść walidacji", async () => {
    mocks.createTask.mockRejectedValue(new TaskValidationError("Tytuł zadania nie może być pusty."));

    const response = await POST(postContext());

    expect(response.status).toBe(400);
    expect((await readBody(response)).error).toBe("Tytuł zadania nie może być pusty.");
  });

  it("zmiana treści komunikatu nie zmienia statusu — liczy się typ błędu, nie napis", async () => {
    mocks.updateTask.mockRejectedValue(new TaskNotFoundError("Zadanie nie istnieje"));

    const response = await PATCH(patchContext());

    expect(response.status).toBe(404);
  });
});

describe("awaria serwera nie wynosi szczegółów bazy do użytkownika", () => {
  const postgresFailure = () =>
    new TaskStorageError("Nie udało się utworzyć zadania: permission denied for table tasks [42501]", {
      cause: { message: "permission denied for table tasks", code: "42501" },
    });

  it("błąd bazy przy tworzeniu daje 500 ze stałym, ogólnym komunikatem", async () => {
    mocks.createTask.mockRejectedValue(postgresFailure());

    const response = await POST(postContext());

    expect(response.status).toBe(500);
    expect((await readBody(response)).error).toBe(GENERIC_FAILURE_MESSAGE);
  });

  it("odpowiedź 500 NIE zawiera kodu Postgresa, nazwy tabeli ani treści błędu bazy", async () => {
    mocks.createTask.mockRejectedValue(postgresFailure());

    const body = await (await POST(postContext())).text();

    expect(body).not.toContain("42501");
    expect(body).not.toContain("permission denied");
    expect(body).not.toContain("table tasks");
  });

  it("to samo obowiązuje przy edycji i usuwaniu", async () => {
    mocks.updateTask.mockRejectedValue(postgresFailure());
    mocks.deleteTask.mockRejectedValue(postgresFailure());

    const patched = await PATCH(patchContext());
    const deleted = await DELETE(deleteContext());

    expect([patched.status, deleted.status]).toEqual([500, 500]);
    expect(await patched.text()).not.toContain("42501");
    expect(await deleted.text()).not.toContain("42501");
  });

  it("pełny oryginał błędu wraz z przyczyną trafia do logu serwera", async () => {
    const failure = postgresFailure();
    mocks.createTask.mockRejectedValue(failure);

    await POST(postContext());

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("POST /api/tasks"),
      failure,
      expect.objectContaining({ cause: { message: "permission denied for table tasks", code: "42501" } }),
    );
  });

  it("wyjątek nieznanego typu też kończy się 500 z ogólnym komunikatem", async () => {
    mocks.createTask.mockRejectedValue(new Error("boom: connection reset by peer"));

    const response = await POST(postContext());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe(JSON.stringify({ error: GENERIC_FAILURE_MESSAGE }));
    expect(body).not.toContain("boom");
  });

  it("rzucona wartość niebędąca błędem nie wysadza endpointu", async () => {
    mocks.deleteTask.mockRejectedValue("cokolwiek");

    const response = await DELETE(deleteContext());

    expect(response.status).toBe(500);
    expect((await readBody(response)).error).toBe(GENERIC_FAILURE_MESSAGE);
  });
});

describe("identyfikator o niepoprawnym kształcie", () => {
  it.each([
    ["tekst spoza UUID", "nie-uuid"],
    ["fragment UUID", "1111"],
    ["SQL-podobny wtręt", "1' OR '1'='1"],
  ])("PATCH z identyfikatorem %s kończy się 404 i nie pyta bazy", async (_opis, id) => {
    const response = await PATCH(patchContext({ params: { id } }));

    expect(response.status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("DELETE z identyfikatorem spoza UUID kończy się 404 i nie pyta bazy", async () => {
    const response = await DELETE(deleteContext({ params: { id: "nie-uuid" } }));

    expect(response.status).toBe(404);
    expect(mocks.deleteTask).not.toHaveBeenCalled();
  });

  it("odpowiedź dla złego kształtu jest NIEODRÓŻNIALNA od odpowiedzi dla cudzego zadania", async () => {
    mocks.updateTask.mockRejectedValue(new TaskNotFoundError(TASK_NOT_FOUND_MESSAGE.update));

    const zlyKsztalt = await PATCH(patchContext({ params: { id: "nie-uuid" } }));
    const cudzeZadanie = await PATCH(patchContext());

    expect(zlyKsztalt.status).toBe(cudzeZadanie.status);
    expect(await zlyKsztalt.text()).toBe(await cudzeZadanie.text());
  });

  it("to samo dotyczy usuwania", async () => {
    mocks.deleteTask.mockRejectedValue(new TaskNotFoundError(TASK_NOT_FOUND_MESSAGE.delete));

    const zlyKsztalt = await DELETE(deleteContext({ params: { id: "nie-uuid" } }));
    const cudzeZadanie = await DELETE(deleteContext());

    expect(zlyKsztalt.status).toBe(cudzeZadanie.status);
    expect(await zlyKsztalt.text()).toBe(await cudzeZadanie.text());
  });

  it("poprawny UUID z wielkimi literami jest przyjmowany", async () => {
    mocks.updateTask.mockResolvedValue(makeTask());

    const response = await PATCH(patchContext({ params: { id: TASK_ID.toUpperCase() } }));

    expect(response.status).toBe(200);
  });
});

describe("walidacja ciała żądania", () => {
  it("PATCH z pustym ciałem kończy się 400 i nie idzie do bazy", async () => {
    const response = await PATCH(patchContext({ body: {} }));

    expect(response.status).toBe(400);
    expect((await readBody(response)).error).toMatch(/Nie podano żadnych zmian/);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it.each([
    ["niepoprawny JSON", "{nie-json"],
    ["tablica zamiast obiektu", [1, 2, 3]],
  ])("PATCH z ciałem typu %s kończy się 400", async (_opis, body) => {
    const response = await PATCH(patchContext({ body }));

    expect(response.status).toBe(400);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("POST bez tytułu kończy się 400 i nie idzie do bazy", async () => {
    const response = await POST(postContext({ body: { title: "   ", due_date: DUE_DATE } }));

    expect(response.status).toBe(400);
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("POST ze statusem ukończenia innym niż logiczny nie jest przepuszczany przez PATCH", async () => {
    const response = await PATCH(patchContext({ body: { completed: "tak" } }));

    expect(response.status).toBe(400);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});

describe("kontrakt terminu: wymagana jawna strefa czasowa", () => {
  it("POST z terminem bez strefy kończy się 400 zamiast po cichu przesuwać termin", async () => {
    const response = await POST(postContext({ body: { title: "Zapłacić rachunek", due_date: "2026-03-15T14:30" } }));

    expect(response.status).toBe(400);
    expect((await readBody(response)).error).toMatch(/stref/i);
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("PATCH z terminem bez strefy kończy się 400", async () => {
    const response = await PATCH(patchContext({ body: { due_date: "2026-03-15T14:30" } }));

    expect(response.status).toBe(400);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it.each([
    ["Z na końcu", "2026-03-16T08:30:00.000Z"],
    ["offset dodatni", "2026-03-16T10:30:00+02:00"],
    ["offset ujemny", "2026-03-16T04:30-04:00"],
  ])("POST z terminem niosącym jawną strefę (%s) jest przyjmowany", async (_opis, dueDate) => {
    mocks.createTask.mockResolvedValue(makeTask({ due_date: dueDate }));

    const response = await POST(postContext({ body: { title: "Zapłacić rachunek", due_date: dueDate } }));

    expect(response.status).toBe(201);
    expect(mocks.createTask).toHaveBeenCalledWith(supabaseStub, SESSION_USER.id, {
      title: "Zapłacić rachunek",
      due_date: dueDate,
    });
  });
});

describe("kształt odpowiedzi przy powodzeniu", () => {
  it("POST zwraca 201, utworzone zadanie pod kluczem `task` i JSON w UTF-8", async () => {
    const task = makeTask();
    mocks.createTask.mockResolvedValue(task);

    const response = await POST(postContext());

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await readBody(response)).toEqual({ task });
  });

  it("PATCH zwraca 200 i zaktualizowane zadanie pod kluczem `task`", async () => {
    const task = makeTask({ completed: true });
    mocks.updateTask.mockResolvedValue(task);

    const response = await PATCH(patchContext());

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual({ task });
  });

  it("DELETE zwraca 200 i identyfikator usuniętego zadania", async () => {
    mocks.deleteTask.mockResolvedValue(undefined);

    const response = await DELETE(deleteContext());

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual({ id: TASK_ID });
  });

  it("odpowiedź sukcesu nie dokleja flagi pilności — liczy ją klient przy renderze", async () => {
    mocks.createTask.mockResolvedValue(makeTask());

    const response = await POST(postContext());

    expect(await response.text()).not.toContain("is_urgent");
  });
});
