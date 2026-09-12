import { useState, type SubmitEvent } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateTimeLocalToIso, formatDueDate, formatDueDateUtc, isoToDateTimeLocal } from "@/components/tasks/datetime";
import type { TaskWithUrgency, UpdateTaskCommand } from "@/types";

const INPUT_CLASS =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors placeholder:text-white/40 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400 focus:outline-none";

const LABEL_CLASS = "mb-1 block text-xs text-blue-100/70";

const GHOST_BUTTON_CLASS = "border border-white/20 bg-white/5 text-white hover:bg-white/15";

interface TaskEditFormProps {
  task: TaskWithUrgency;
  isPending: boolean;
  onCancel: () => void;
  onSave: (command: UpdateTaskCommand) => void;
}

/**
 * Formularz edycji tytułu i terminu (FR-006 / US-04).
 *
 * Montowany wyłącznie w trybie edycji i kluczowany identyfikatorem zadania,
 * więc stan startowy bierze się wprost z propsów — bez efektu
 * synchronizującego. Wysyłamy oba pola naraz; częściowość PATCH-a przydaje się
 * przy przełączaniu `completed`, nie tutaj.
 */
function TaskEditForm({ task, isPending, onCancel, onSave }: TaskEditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(() => isoToDateTimeLocal(task.due_date));
  const [validationError, setValidationError] = useState<string | null>(null);

  const titleId = `task-${task.id}-title`;
  const dueDateId = `task-${task.id}-due-date`;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim().length === 0) {
      setValidationError("Tytuł zadania nie może być pusty.");
      return;
    }

    const iso = dateTimeLocalToIso(dueDate);
    if (iso === null) {
      setValidationError("Podaj poprawny termin wykonania.");
      return;
    }

    setValidationError(null);
    onSave({ title: title.trim(), due_date: iso });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={titleId} className={LABEL_CLASS}>
            Tytuł zadania
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            maxLength={200}
            disabled={isPending}
            onChange={(event) => {
              setTitle(event.target.value);
              setValidationError(null);
            }}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={dueDateId} className={LABEL_CLASS}>
            Termin wykonania
          </label>
          <input
            id={dueDateId}
            type="datetime-local"
            value={dueDate}
            disabled={isPending}
            onChange={(event) => {
              setDueDate(event.target.value);
              setValidationError(null);
            }}
            className={cn(INPUT_CLASS, "[color-scheme:dark]")}
          />
        </div>
      </div>

      {validationError !== null && (
        <p role="alert" className="text-sm text-red-300">
          {validationError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isPending}
          aria-busy={isPending}
          aria-label={`Zapisz zmiany w zadaniu: ${task.title}`}
          className="bg-purple-500 text-white hover:bg-purple-400"
        >
          <Check className="size-4" aria-hidden="true" />
          Zapisz
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          aria-label={`Anuluj edycję zadania: ${task.title}`}
          onClick={onCancel}
          className={GHOST_BUTTON_CLASS}
        >
          <X className="size-4" aria-hidden="true" />
          Anuluj
        </Button>
      </div>
    </form>
  );
}

interface TaskItemProps {
  task: TaskWithUrgency;
  /**
   * `false` dla renderu SSR i renderu hydracyjnego, `true` od pierwszego
   * renderu po hydracji. Decyduje, w jakiej strefie formatowany jest termin —
   * szczegóły przy samym `<time>`.
   */
  mounted: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  isPending: boolean;
  onToggleCompleted: (task: TaskWithUrgency) => void;
  onStartEdit: (task: TaskWithUrgency) => void;
  onCancelEdit: () => void;
  onSaveEdit: (task: TaskWithUrgency, command: UpdateTaskCommand) => void;
  onRequestDelete: (task: TaskWithUrgency) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (task: TaskWithUrgency) => void;
}

/**
 * Pojedynczy wiersz listy zadań.
 *
 * Komponent jest w pełni sterowany: tryb edycji i potwierdzanie usunięcia
 * trzyma `TaskList`, dzięki czemu po udanym zapisie to on zamyka formularz
 * i nie trzeba przepychać wyniku żądania w dół drzewa.
 *
 * `task.is_urgent` przychodzi wyliczone przez `withUrgency()` przy renderze
 * listy — nigdy nie jest odczytywane z bazy ani zapamiętywane tutaj.
 *
 * Termin jest formatowany w dwóch fazach (`mounted`) — patrz komentarz przy
 * elemencie `<time>`.
 */
export function TaskItem({
  task,
  mounted,
  isEditing,
  isConfirmingDelete,
  isPending,
  onToggleCompleted,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: TaskItemProps) {
  const checkboxId = `task-${task.id}-completed`;
  const toggleLabel = task.completed
    ? `Oznacz jako nieukończone: ${task.title}`
    : `Oznacz jako ukończone: ${task.title}`;

  return (
    <li
      className={cn(
        "rounded-xl border p-4 transition-colors",
        task.is_urgent ? "border-red-400/40 bg-red-500/10" : "border-white/10 bg-white/5",
      )}
    >
      {isEditing ? (
        <TaskEditForm
          task={task}
          isPending={isPending}
          onCancel={onCancelEdit}
          onSave={(command) => {
            onSaveEdit(task, command);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <label htmlFor={checkboxId} className="sr-only">
            {toggleLabel}
          </label>
          <input
            id={checkboxId}
            type="checkbox"
            checked={task.completed}
            disabled={isPending}
            onChange={() => {
              onToggleCompleted(task);
            }}
            className="mt-1 size-4 shrink-0 accent-purple-500"
          />

          <div className="min-w-0 flex-1">
            <p className={cn("font-medium break-words text-white", task.completed && "text-white/50 line-through")}>
              {task.title}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-blue-100/70">
              <span>Termin:</span>
              {/*
                Termin formatujemy dwufazowo i jest to celowe.

                Render serwerowy i render hydracyjny muszą dać BAJT W BAJT ten sam
                napis, więc oba używają `formatDueDateUtc()` — wartości niezależnej
                od strefy. Dzięki temu nie ma ostrzeżenia hydracji i nie trzeba go
                wyciszać przez `suppressHydrationWarning`.

                `mounted` przechodzi na `true` w efekcie w `TaskList`, czyli dopiero
                po hydracji. Wymusza to kolejny render, w którym `children` elementu
                `<time>` to już inny string (strefa użytkownika), więc React realnie
                podmienia węzeł tekstowy. Gdyby zamiast tego polegać na tiku `now`,
                nic by się nie zmieniło: `formatDueDate(task.due_date)` nie zależy
                od `now`, React porównałby dwa identyczne stringi i zostawił w DOM
                datę UTC na stałe.
              */}
              <time dateTime={task.due_date}>
                {mounted ? formatDueDate(task.due_date) : formatDueDateUtc(task.due_date)}
              </time>
              {task.is_urgent && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">Pilne</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              aria-label={`Edytuj zadanie: ${task.title}`}
              onClick={() => {
                onStartEdit(task);
              }}
              className={GHOST_BUTTON_CLASS}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edytuj
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              aria-label={`Usuń zadanie: ${task.title}`}
              onClick={() => {
                onRequestDelete(task);
              }}
              className="border border-red-400/40 bg-red-500/20 text-red-100 hover:bg-red-500/35"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Usuń
            </Button>
          </div>
        </div>
      )}

      {isConfirmingDelete && !isEditing && (
        <div className="mt-3 rounded-lg border border-red-400/40 bg-red-950/40 p-3">
          <p role="alert" className="text-sm text-red-100">
            Usunięcie zadania &bdquo;{task.title}&rdquo; jest nieodwracalne. Czy na pewno chcesz je usunąć?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              aria-busy={isPending}
              aria-label={`Potwierdź usunięcie zadania: ${task.title}`}
              onClick={() => {
                onConfirmDelete(task);
              }}
              className="bg-red-500 text-white hover:bg-red-400"
            >
              Tak, usuń
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              aria-label={`Anuluj usuwanie zadania: ${task.title}`}
              onClick={onCancelDelete}
              className={GHOST_BUTTON_CLASS}
            >
              Anuluj
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
