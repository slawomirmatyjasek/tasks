import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createTask, TaskNotFoundError, TaskValidationError } from "@/lib/tasks";
import type { CreateTaskCommand } from "@/types";

/**
 * Endpoint tworzenia zadania (FR-004 / US-01).
 *
 * Kolejność bramek jest celowa i taka sama we wszystkich endpointach zadań:
 *
 * 1. **Sesja** — `locals.user` ustawia middleware. Brak użytkownika to 401,
 *    zanim cokolwiek dotknie bazy.
 * 2. **Konfiguracja** — `createClient` zwraca `null`, gdy nie ma sekretów
 *    Supabase (wzorzec z `src/pages/api/auth/signin.ts`). Warstwa danych
 *    wymaga `NonNullable`, więc ten przypadek musi zostać obsłużony tutaj.
 * 3. **Walidacja wejścia** — komunikaty po polsku, status 400.
 * 4. **Serwis** — `createTask` rzuca typowane wyjątki; mapujemy je na status
 *    HTTP przez `instanceof`, nigdy nie połykamy po cichu.
 *
 * `user_id` pochodzi WYŁĄCZNIE z `locals.user.id`. Ewentualne `user_id`
 * w ciele żądania jest ignorowane — to granica bezpieczeństwa z US-05
 * i jedyne miejsce, w którym właściciel zadania jest ustalany.
 */
export const prerender = false;

const TITLE_MAX_LENGTH = 200;

/**
 * Jedyna treść, jaką użytkownik dostaje przy awarii serwera.
 *
 * Oryginalny komunikat z warstwy danych niesie treść i kod błędu Postgresa
 * (`permission denied for table tasks [42501]`) — nazwy tabel, kody błędów
 * i stan konfiguracji. To jest wiedza dla logu serwera, nie dla klienta.
 */
const GENERIC_FAILURE_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";

/** Jednolita odpowiedź JSON — sukces i błąd mają ten sam kształt nagłówków. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Mapowanie wyjątku z `src/lib/tasks.ts` na odpowiedź HTTP.
 *
 * Rozpoznanie idzie po TYPIE błędu, nie po prefiksie komunikatu. Dzięki temu
 * przeredagowanie polskiego napisu w warstwie danych nie może po cichu
 * zamienić 404 w 500 ani odwrotnie.
 *
 * Komunikaty 400 i 404 są pisane przez nas i idą do użytkownika bez zmian.
 * Wszystko pozostałe to awaria serwera: użytkownik dostaje stałą treść,
 * a pełny oryginał wraz z `cause` ląduje w logu serwera.
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
 * Termin musi nieść jawną strefę: `Z` albo offset `±HH:MM`.
 *
 * `new Date("2026-03-15T14:30")` jest w JS poprawną datą, ale bez strefy —
 * serwer (Cloudflare Workers, zegar w UTC) zinterpretowałby ją jako UTC
 * i przesunął termin użytkownika o offset jego strefy, a wraz z terminem
 * flagę pilności. Przeglądarkowy klient wysyła `toISOString()`, więc nic
 * nie traci; każdy inny klient dostaje jednoznaczny błąd 400 zamiast
 * po cichu przesuniętego terminu.
 */
const ISO_WITH_EXPLICIT_ZONE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Waliduje ciało żądania POST i zwraca gotową komendę albo komunikat błędu. */
function parseCreateCommand(raw: unknown): ParseResult<CreateTaskCommand> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "Treść żądania musi być obiektem JSON." };
  }

  const body = raw as Record<string, unknown>;
  const { title, due_date: dueDate } = body;

  if (typeof title !== "string" || title.trim().length === 0) {
    return { ok: false, message: "Tytuł zadania jest wymagany i nie może być pusty." };
  }
  if (title.trim().length > TITLE_MAX_LENGTH) {
    return { ok: false, message: `Tytuł zadania może mieć najwyżej ${TITLE_MAX_LENGTH} znaków.` };
  }
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

  return { ok: true, value: { title: title.trim(), due_date: dueDate } };
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Musisz być zalogowany, aby dodać zadanie." }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase nie jest skonfigurowany — nie można zapisać zadania." }, 503);
  }

  let raw: unknown;
  try {
    raw = (await context.request.json()) as unknown;
  } catch {
    return json({ error: "Treść żądania musi być poprawnym dokumentem JSON." }, 400);
  }

  const parsed = parseCreateCommand(raw);
  if (!parsed.ok) {
    return json({ error: parsed.message }, 400);
  }

  try {
    // user.id, nigdy nic z `raw` — właściciela wyznacza wyłącznie sesja (US-05).
    const task = await createTask(supabase, user.id, parsed.value);
    return json({ task }, 201);
  } catch (error) {
    return respondToServiceError(error, "POST /api/tasks");
  }
};
