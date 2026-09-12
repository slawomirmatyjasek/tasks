import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteTask, TASK_NOT_FOUND_MESSAGE, TaskNotFoundError, TaskValidationError, updateTask } from "@/lib/tasks";
import type { UpdateTaskCommand } from "@/types";

/**
 * Endpointy pojedynczego zadania: edycja (FR-006, FR-008) i usunięcie (FR-007).
 *
 * Bramki są takie same jak w `src/pages/api/tasks/index.ts`: sesja (401),
 * kształt identyfikatora (404), konfiguracja Supabase (503), walidacja
 * wejścia (400), dopiero potem serwis.
 *
 * Właściciela zadania NIE ustala ten plik i nie ustala go ciało żądania —
 * zakres widocznych wierszy wyznacza polityka RLS `auth.uid() = user_id`
 * powiązana z sesją z ciasteczek. Próba dosięgnięcia cudzego zadania nie
 * trafia w żaden wiersz i kończy się 404 "Nie znaleziono zadania" — celowo
 * tym samym komunikatem co zadanie nieistniejące, żeby nie zdradzać, czy
 * dany identyfikator istnieje w bazie (US-05).
 */
export const prerender = false;

const TITLE_MAX_LENGTH = 200;

/** Patrz `src/pages/api/tasks/index.ts` — użytkownik nigdy nie widzi treści błędu bazy. */
const GENERIC_FAILURE_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Mapowanie wyjątku z warstwy danych na odpowiedź HTTP (patrz index.ts).
 *
 * Rozpoznanie po `instanceof`, nigdy po prefiksie komunikatu: treść napisu
 * jest tekstem dla użytkownika, a nie kontraktem między modułami.
 */
function respondToServiceError(error: unknown, operation: string): Response {
  if (error instanceof TaskNotFoundError) {
    return json({ error: error.message }, 404);
  }

  if (error instanceof TaskValidationError) {
    return json({ error: error.message }, 400);
  }

  const cause = error instanceof Error ? error.cause : undefined;
  // eslint-disable-next-line no-console -- log serwera jest jedynym miejscem, w którym oryginał błędu ma prawo się pojawić
  console.error(`[api/tasks] ${operation}`, error, ...(cause === undefined ? [] : [{ cause }]));

  return json({ error: GENERIC_FAILURE_MESSAGE }, 500);
}

/**
 * Kształt identyfikatora zadania: kolumna `tasks.id` jest typu `uuid`.
 *
 * Identyfikator spoza tego kształtu nie może wskazywać na żaden wiersz, więc
 * nie ma powodu pytać o niego bazy — Postgres odpowiedziałby `22P02 invalid
 * input syntax for type uuid`, czyli awarią 500 zdradzającą typ kolumny.
 * Odpowiadamy 404 z DOKŁADNIE tym samym komunikatem co dla zadania
 * nieistniejącego i cudzego, żeby po statusie ani po treści nie dało się
 * odróżnić "zły format" od "nie twoje" (US-05).
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTaskId(id: string | undefined): id is string {
  return typeof id === "string" && UUID_SHAPE.test(id.trim());
}

/** Patrz `src/pages/api/tasks/index.ts` — termin musi nieść jawną strefę czasową. */
const ISO_WITH_EXPLICIT_ZONE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Waliduje ciało PATCH-a. Aktualizacja jest częściowa: pominięte pole znaczy
 * "nie zmieniaj", ale całkowity brak pól to błąd wejścia, nie ciche no-op.
 */
function parseUpdateCommand(raw: unknown): ParseResult<UpdateTaskCommand> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "Treść żądania musi być obiektem JSON." };
  }

  const body = raw as Record<string, unknown>;
  const command: UpdateTaskCommand = {};

  if ("title" in body) {
    const { title } = body;
    if (typeof title !== "string" || title.trim().length === 0) {
      return { ok: false, message: "Tytuł zadania nie może być pusty." };
    }
    if (title.trim().length > TITLE_MAX_LENGTH) {
      return { ok: false, message: `Tytuł zadania może mieć najwyżej ${TITLE_MAX_LENGTH} znaków.` };
    }
    command.title = title.trim();
  }

  if ("due_date" in body) {
    const dueDate = body.due_date;
    if (typeof dueDate !== "string" || dueDate.trim().length === 0) {
      return { ok: false, message: "Termin wykonania jest wymagany." };
    }
    if (!ISO_WITH_EXPLICIT_ZONE.test(dueDate.trim())) {
      return {
        ok: false,
        message: "Termin wykonania musi być datą ISO 8601 z jawną strefą czasową, np. 2026-03-15T14:30:00Z.",
      };
    }
    if (Number.isNaN(new Date(dueDate).getTime())) {
      return { ok: false, message: "Termin wykonania musi być poprawną datą." };
    }
    command.due_date = dueDate;
  }

  if ("completed" in body) {
    const { completed } = body;
    if (typeof completed !== "boolean") {
      return { ok: false, message: "Status ukończenia musi być wartością logiczną." };
    }
    command.completed = completed;
  }

  if (Object.keys(command).length === 0) {
    return { ok: false, message: "Nie podano żadnych zmian do zapisania." };
  }

  return { ok: true, value: command };
}

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Musisz być zalogowany, aby edytować zadanie." }, 401);
  }

  const id = context.params.id;
  if (!isTaskId(id)) {
    return json({ error: TASK_NOT_FOUND_MESSAGE.update }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase nie jest skonfigurowany — nie można zapisać zmian." }, 503);
  }

  let raw: unknown;
  try {
    raw = (await context.request.json()) as unknown;
  } catch {
    return json({ error: "Treść żądania musi być poprawnym dokumentem JSON." }, 400);
  }

  const parsed = parseUpdateCommand(raw);
  if (!parsed.ok) {
    return json({ error: parsed.message }, 400);
  }

  try {
    const task = await updateTask(supabase, id.trim(), parsed.value);
    return json({ task }, 200);
  } catch (error) {
    return respondToServiceError(error, "PATCH /api/tasks/[id]");
  }
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Musisz być zalogowany, aby usunąć zadanie." }, 401);
  }

  const id = context.params.id;
  if (!isTaskId(id)) {
    return json({ error: TASK_NOT_FOUND_MESSAGE.delete }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase nie jest skonfigurowany — nie można usunąć zadania." }, 503);
  }

  try {
    await deleteTask(supabase, id.trim());
    return json({ id: id.trim() }, 200);
  } catch (error) {
    return respondToServiceError(error, "DELETE /api/tasks/[id]");
  }
};
