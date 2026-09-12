import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { withUrgency } from "@/lib/urgency";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskItem } from "@/components/tasks/TaskItem";
import type { CreateTaskCommand, Task, TaskWithUrgency, UpdateTaskCommand } from "@/types";

/**
 * Wyspa React zarządzająca listą zadań (FR-004..FR-010, US-01/US-03/US-04).
 *
 * Kluczowa zasada: **w stanie komponentu żyją wyłącznie surowe zadania**
 * (`Task[]`, dokładnie to, co jest w bazie). Flaga pilności nie jest częścią
 * stanu ani odpowiedzi API — powstaje przy każdym renderze z `withUrgency()`
 * względem aktualnego `now`. To wprost realizuje twardą regułę z AGENTS.md:
 * pilność jest wartością wyliczaną przy odczycie, nigdy zapisaną.
 *
 * Konsekwencje, które z tego wynikają:
 *
 * - Po każdej mutacji podmieniamy tylko surowy wiersz zwrócony przez API,
 *   a flagi całej listy i tak liczą się od nowa przy renderze.
 * - `now` jest odświeżane cyklicznie, więc zadanie samo „staje się pilne”
 *   przy otwartej karcie, bez akcji użytkownika i bez zapytania do serwera.
 * - Nawet gdyby serwer kiedyś dokleił `is_urgent`, `withUrgency()` nadpisuje
 *   je własnym wyliczeniem.
 *
 * Lista startowa przychodzi z SSR (`dashboard.astro`), żeby pierwszy render
 * nie migał pustką.
 */

/** Co ile odświeżamy punkt odniesienia dla progu 48h przy otwartej karcie. */
const URGENCY_REFRESH_MS = 30_000;

/** Umowny identyfikator „operacji dodawania” w stanie `pendingId`. */
const CREATE_PENDING = "__create__";

interface TaskListProps {
  /** Zadania pobrane po stronie serwera — bez flagi pilności, celowo. */
  initialTasks: Task[];
  /**
   * Błąd odczytu z SSR (np. awaria bazy), pokazywany od pierwszego renderu.
   *
   * Jest to komunikat OGÓLNY, przygotowany w `dashboard.astro` — oryginalna
   * treść wyjątku (komunikat PostgREST, kod Postgresa, nazwa tabeli) nigdy
   * nie dociera do przeglądarki.
   *
   * Trwa do przeładowania strony i celowo NIE jest trzymany w stanie razem
   * z błędami mutacji: lista pozostaje niekompletna także po udanym dodaniu
   * zadania, więc kasowanie tego ostrzeżenia przy kolejnej akcji byłoby
   * kłamstwem wobec użytkownika.
   */
  loadError?: string | null;
}

/** Wyciąga polski komunikat błędu zwrócony przez endpoint. */
function extractErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    const { error } = payload as Record<string, unknown>;
    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }
  }
  if (status === 401) {
    return "Sesja wygasła — zaloguj się ponownie.";
  }
  return `Operacja nie powiodła się (HTTP ${status}).`;
}

/**
 * Cienka warstwa nad `fetch`: zawsze JSON, błąd HTTP zamieniony na wyjątek
 * z komunikatem endpointu. Nic nie jest połykane po cichu.
 */
async function apiRequest(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });

  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status));
  }

  return payload;
}

function extractTask(payload: unknown): Task {
  if (typeof payload === "object" && payload !== null && "task" in payload) {
    return (payload as { task: Task }).task;
  }
  throw new Error("Serwer nie zwrócił zapisanego zadania.");
}

/**
 * Ta sama kolejność co w `listTasks()`: najpierw nieukończone, w obrębie grupy
 * rosnąco po terminie. Powtarzamy ją lokalnie, żeby po mutacji wiersz wskoczył
 * na właściwe miejsce bez ponownego odpytywania serwera.
 */
function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
}

/** Jednolity baner błędu — używany i dla błędu odczytu, i dla błędu mutacji. */
function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-200"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

export default function TaskList({ initialTasks, loadError = null }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [now, setNow] = useState(() => new Date());
  /**
   * `false` na serwerze i w renderze hydracyjnym, `true` od pierwszego renderu
   * po hydracji. Steruje strefą, w której `TaskItem` formatuje termin (B1).
   */
  const [mounted, setMounted] = useState(false);
  /** Błąd OSTATNIEJ mutacji — kasowany przy kolejnej akcji. Osobno od `loadError`. */
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  // Zmiana klucza przemontowuje formularz dodawania i czyści jego pola.
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    // Pierwsze odświeżenie tuż po hydracji: render SSR liczył `now` w strefie
    // serwera (UTC), tutaj przeliczamy je w strefie przeglądarki. Tym samym
    // efektem zapalamy `mounted`, co przełącza formatowanie terminu z UTC na
    // strefę użytkownika — dopiero ten przełącznik realnie zmienia tekst
    // w DOM, bo sam `now` nie jest argumentem `formatDueDate()`.
    // Celowo przez `setTimeout`, a nie synchronicznie w ciele efektu — inaczej
    // byłby to kaskadowy render (react-hooks/set-state-in-effect).
    const firstTick = setTimeout(() => {
      setNow(new Date());
      setMounted(true);
    }, 0);

    const timer = setInterval(() => {
      setNow(new Date());
    }, URGENCY_REFRESH_MS);

    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
    };
  }, []);

  // Jedyne miejsce, w którym powstaje flaga pilności.
  const items = useMemo<TaskWithUrgency[]>(() => sortTasks(tasks).map((task) => withUrgency(task, now)), [tasks, now]);

  const urgentCount = items.filter((task) => task.is_urgent).length;
  const visibleItems = onlyUrgent ? items.filter((task) => task.is_urgent) : items;

  const handleCreate = useCallback((command: CreateTaskCommand) => {
    void (async () => {
      setPendingId(CREATE_PENDING);
      setError(null);
      try {
        const task = extractTask(await apiRequest("/api/tasks", { method: "POST", body: JSON.stringify(command) }));
        setTasks((previous) => [...previous.filter((item) => item.id !== task.id), task]);
        setFormKey((value) => value + 1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nie udało się dodać zadania.");
      } finally {
        setPendingId(null);
      }
    })();
  }, []);

  const patchTask = useCallback((id: string, command: UpdateTaskCommand, onSuccess?: () => void) => {
    void (async () => {
      setPendingId(id);
      setError(null);
      try {
        const task = extractTask(
          await apiRequest(`/api/tasks/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(command),
          }),
        );
        setTasks((previous) => previous.map((item) => (item.id === task.id ? task : item)));
        onSuccess?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nie udało się zapisać zmian.");
      } finally {
        setPendingId(null);
      }
    })();
  }, []);

  const handleToggleCompleted = useCallback(
    (task: TaskWithUrgency) => {
      patchTask(task.id, { completed: !task.completed });
    },
    [patchTask],
  );

  const handleSaveEdit = useCallback(
    (task: TaskWithUrgency, command: UpdateTaskCommand) => {
      patchTask(task.id, command, () => {
        setEditingId(null);
      });
    },
    [patchTask],
  );

  const handleConfirmDelete = useCallback((task: TaskWithUrgency) => {
    void (async () => {
      setPendingId(task.id);
      setError(null);
      try {
        await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
        setTasks((previous) => previous.filter((item) => item.id !== task.id));
        setDeletingId(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nie udało się usunąć zadania.");
      } finally {
        setPendingId(null);
      }
    })();
  }, []);

  const handleStartEdit = useCallback((task: TaskWithUrgency) => {
    setDeletingId(null);
    setEditingId(task.id);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleRequestDelete = useCallback((task: TaskWithUrgency) => {
    setEditingId(null);
    setDeletingId(task.id);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeletingId(null);
  }, []);

  /*
   * Pusta lista i lista NIEZNANA to dwa różne stany. Gdy odczyt z SSR padł,
   * `initialTasks` jest puste nie dlatego, że użytkownik nie ma zadań, tylko
   * dlatego, że nie wiemy, ile ich ma — komunikat "Nie masz jeszcze żadnych
   * zadań" byłby wtedy wprost nieprawdziwy. W tym wypadku cały blok listy
   * zostaje pusty, a jedyną informacją jest baner błędu odczytu powyżej.
   */
  let listBody: ReactNode;
  if (items.length > 0) {
    listBody =
      visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-sm text-blue-100/70">
          Żadne zadanie nie jest teraz pilne.
        </p>
      ) : (
        <ul className="space-y-3">
          {visibleItems.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              mounted={mounted}
              isEditing={editingId === task.id}
              isConfirmingDelete={deletingId === task.id}
              isPending={pendingId === task.id}
              onToggleCompleted={handleToggleCompleted}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSaveEdit={handleSaveEdit}
              onRequestDelete={handleRequestDelete}
              onCancelDelete={handleCancelDelete}
              onConfirmDelete={handleConfirmDelete}
            />
          ))}
        </ul>
      );
  } else if (loadError !== null) {
    listBody = null;
  } else {
    listBody = (
      <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-sm text-blue-100/70">
        Nie masz jeszcze żadnych zadań. Dodaj pierwsze, korzystając z formularza powyżej.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <TaskForm key={formKey} isPending={pendingId === CREATE_PENDING} onSubmit={handleCreate} />
      </section>

      {loadError !== null && <ErrorBanner message={loadError} />}
      {error !== null && <ErrorBanner message={error} />}

      <section aria-labelledby="task-list-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="task-list-heading" className="text-lg font-semibold text-white">
            Twoje zadania
          </h2>
          <div className="flex items-center gap-2">
            <input
              id="filter-urgent"
              type="checkbox"
              checked={onlyUrgent}
              onChange={(event) => {
                setOnlyUrgent(event.target.checked);
              }}
              className="size-4 accent-red-500"
            />
            <label htmlFor="filter-urgent" className="text-sm text-blue-100/80">
              Pokaż tylko pilne ({urgentCount})
            </label>
          </div>
        </div>

        <p aria-live="polite" className="sr-only">
          {pendingId !== null ? "Trwa zapisywanie zmian." : ""}
        </p>

        {listBody}
      </section>
    </div>
  );
}
