import { useState, type SubmitEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateTimeLocalToIso } from "@/components/tasks/datetime";
import type { CreateTaskCommand } from "@/types";

const INPUT_CLASS =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors placeholder:text-white/40 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400 focus:outline-none";

const LABEL_CLASS = "mb-1 block text-sm text-blue-100/80";

interface TaskFormProps {
  /** Blokuje formularz na czas zapisu, żeby nie wysłać zadania dwa razy. */
  isPending: boolean;
  onSubmit: (command: CreateTaskCommand) => void;
}

/**
 * Formularz dodawania zadania (FR-004 / US-01).
 *
 * Pola czyszczą się przez przemontowanie komponentu (`key` po stronie
 * `TaskList`) po udanym zapisie — dzięki temu nie ma tu ani jednego efektu
 * synchronizującego stan lokalny z propsami.
 */
export function TaskForm({ isPending, onSubmit }: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim().length === 0) {
      setValidationError("Podaj tytuł zadania.");
      return;
    }

    const iso = dateTimeLocalToIso(dueDate);
    if (iso === null) {
      setValidationError("Podaj poprawny termin wykonania.");
      return;
    }

    setValidationError(null);
    onSubmit({ title: title.trim(), due_date: iso });
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="add-task-heading" className="space-y-3">
      <h2 id="add-task-heading" className="text-lg font-semibold text-white">
        Dodaj zadanie
      </h2>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="new-task-title" className={LABEL_CLASS}>
            Tytuł zadania
          </label>
          <input
            id="new-task-title"
            name="title"
            type="text"
            value={title}
            maxLength={200}
            placeholder="Np. Odebrać paczkę"
            disabled={isPending}
            onChange={(event) => {
              setTitle(event.target.value);
              setValidationError(null);
            }}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="new-task-due-date" className={LABEL_CLASS}>
            Termin wykonania
          </label>
          <input
            id="new-task-due-date"
            name="due_date"
            type="datetime-local"
            value={dueDate}
            disabled={isPending}
            onChange={(event) => {
              setDueDate(event.target.value);
              setValidationError(null);
            }}
            className={`${INPUT_CLASS} [color-scheme:dark]`}
          />
        </div>
      </div>

      {validationError !== null && (
        <p role="alert" className="text-sm text-red-300">
          {validationError}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className="bg-purple-500 text-white hover:bg-purple-400 focus-visible:ring-purple-300"
      >
        <Plus className="size-4" aria-hidden="true" />
        Dodaj zadanie
      </Button>
    </form>
  );
}
