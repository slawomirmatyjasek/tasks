import { describe, expect, it } from "vitest";
import { URGENCY_THRESHOLD_HOURS, isUrgent, withUrgency } from "@/lib/urgency";
import type { Task } from "@/types";

/**
 * Testy reguły biznesowej pilności (US-02 / FR-009).
 *
 * Zasada nadrzędna tego pliku: KAŻDA asercja czasowa odnosi się do jawnie
 * wstrzykniętego momentu `NOW`. Żaden test nie czyta zegara systemowego jako
 * punktu odniesienia dla granicy 48 h — inaczej zestaw przechodziłby o 10:00,
 * a migał o 23:00 i przestałby cokolwiek chronić.
 *
 * Progi są w testach zapisane LITERAŁAMI (48, 47, 72...), a nie przez stałą
 * z modułu. Test, który liczy oczekiwaną wartość tym samym wyrażeniem co kod
 * produkcyjny, przepuściłby zmianę progu — czyli dokładnie tę regresję,
 * przed którą ma bronić.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Ustalony moment odniesienia. Celowo inny niż "teraz" maszyny CI. */
const NOW = new Date("2026-03-15T09:00:00.000Z");

/** Termin oddalony o `offsetMs` od `NOW`, jako string ISO 8601 (tak jak w bazie). */
function dueAt(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    title: "Odebrać paczkę z paczkomatu",
    due_date: dueAt(24 * HOUR),
    completed: false,
    created_at: "2026-03-01T08:00:00.000Z",
    updated_at: "2026-03-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("pilność zadania nieukończonego zależy od odległości do terminu", () => {
  it("zadanie z terminem za 24 godziny jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(24 * HOUR), completed: false }, NOW)).toBe(true);
  });

  it("zadanie z terminem za 47 godzin i 59 minut jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(47 * HOUR + 59 * MINUTE), completed: false }, NOW)).toBe(true);
  });

  it("zadanie z terminem dokładnie za 48 godzin jeszcze jest pilne (granica domknięta)", () => {
    expect(isUrgent({ due_date: dueAt(48 * HOUR), completed: false }, NOW)).toBe(true);
  });

  it("zadanie z terminem za 48 godzin i 1 milisekundę już nie jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(48 * HOUR + 1), completed: false }, NOW)).toBe(false);
  });

  it("zadanie z terminem za 72 godziny nie jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(72 * HOUR), completed: false }, NOW)).toBe(false);
  });

  it("zadanie z terminem za 48 godzin i 1 sekundę nie jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(48 * HOUR + 1000), completed: false }, NOW)).toBe(false);
  });
});

describe("zadanie po terminie", () => {
  it("nieukończone zadanie, którego termin właśnie minął, jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(-1), completed: false }, NOW)).toBe(true);
  });

  it("nieukończone zadanie przeterminowane o dobę jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(-24 * HOUR), completed: false }, NOW)).toBe(true);
  });

  it("nieukończone zadanie przeterminowane o pół roku nadal jest pilne (próg nie ma dolnej granicy)", () => {
    expect(isUrgent({ due_date: dueAt(-180 * 24 * HOUR), completed: false }, NOW)).toBe(true);
  });

  it("zadanie z terminem dokładnie w bieżącym momencie jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(0), completed: false }, NOW)).toBe(true);
  });
});

describe("ukończenie zadania zawsze wygrywa z terminem", () => {
  it("zadanie ukończone z terminem za godzinę nie jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(HOUR), completed: true }, NOW)).toBe(false);
  });

  it("zadanie ukończone nie jest pilne, nawet jeśli termin minął", () => {
    expect(isUrgent({ due_date: dueAt(-24 * HOUR), completed: true }, NOW)).toBe(false);
  });

  it("zadanie ukończone z terminem dokładnie na granicy 48 godzin nie jest pilne", () => {
    expect(isUrgent({ due_date: dueAt(48 * HOUR), completed: true }, NOW)).toBe(false);
  });

  it("zadanie ukończone z niepoprawnym terminem nie jest pilne i nie wysypuje reguły", () => {
    expect(isUrgent({ due_date: "nie-data", completed: true }, NOW)).toBe(false);
  });
});

describe("uszkodzony termin nie wywołuje fałszywego alarmu", () => {
  it.each([
    ["pusty string", ""],
    ["tekst opisowy", "jutro po południu"],
    ["nieistniejący miesiąc", "2026-13-45"],
    ["godzina poza dobą", "2026-03-15T25:00:00Z"],
    ["odwrócone pola daty", "15-03-2026"],
    ["sam śmieć", "????"],
  ])("nieparsowalny termin (%s) nie oznacza zadania jako pilnego", (_opis, dueDate) => {
    expect(isUrgent({ due_date: dueDate, completed: false }, NOW)).toBe(false);
  });
});

describe("wynik zależy od podanego momentu, nie od zegara systemowego", () => {
  it("ten sam termin jest pilny dla wcześniejszego momentu i niepilny dla późniejszego", () => {
    const task = { due_date: "2026-03-17T09:00:00.000Z", completed: false };

    // 48 h przed terminem — jeszcze w progu.
    expect(isUrgent(task, new Date("2026-03-15T09:00:00.000Z"))).toBe(true);
    // 48 h i 1 ms przed terminem — już poza progiem.
    expect(isUrgent(task, new Date("2026-03-15T08:59:59.999Z"))).toBe(false);
    // 10 minut po terminie — znowu pilne, bo przeterminowane.
    expect(isUrgent(task, new Date("2026-03-17T09:10:00.000Z"))).toBe(true);
  });

  it("moment odniesienia sprzed dwóch lat daje wynik zgodny z tamtym momentem, a nie z dziś", () => {
    expect(
      isUrgent({ due_date: "2024-01-02T00:00:00.000Z", completed: false }, new Date("2024-01-01T00:00:00.000Z")),
    ).toBe(true);
    expect(
      isUrgent({ due_date: "2024-01-10T00:00:00.000Z", completed: false }, new Date("2024-01-01T00:00:00.000Z")),
    ).toBe(false);
  });

  it("pominięty moment odniesienia oznacza bieżący czas", () => {
    const zaGodzine = new Date(Date.now() + HOUR).toISOString();
    const zaTydzien = new Date(Date.now() + 7 * 24 * HOUR).toISOString();

    expect(isUrgent({ due_date: zaGodzine, completed: false })).toBe(true);
    expect(isUrgent({ due_date: zaTydzien, completed: false })).toBe(false);
  });

  it("niepoprawny moment odniesienia nie oznacza zadania jako pilnego", () => {
    expect(isUrgent({ due_date: dueAt(HOUR), completed: false }, new Date("nie-data"))).toBe(false);
  });
});

describe("próg pilności jest stały", () => {
  it("wynosi 48 godzin — PRD wyklucza konfigurowalny próg", () => {
    expect(URGENCY_THRESHOLD_HOURS).toBe(48);
  });
});

describe("wzbogacanie zadania o flagę pilności", () => {
  it("dokłada is_urgent i nie gubi żadnego pozostałego pola zadania", () => {
    const task = makeTask({ due_date: dueAt(12 * HOUR) });

    expect(withUrgency(task, NOW)).toEqual({
      id: task.id,
      user_id: task.user_id,
      title: task.title,
      due_date: task.due_date,
      completed: false,
      created_at: task.created_at,
      updated_at: task.updated_at,
      is_urgent: true,
    });
  });

  it("zadanie ukończone dostaje is_urgent równe false, reszta pól bez zmian", () => {
    const task = makeTask({ due_date: dueAt(-5 * HOUR), completed: true });

    expect(withUrgency(task, NOW)).toEqual({ ...task, is_urgent: false });
  });

  it("zadanie poza progiem dostaje is_urgent równe false", () => {
    const task = makeTask({ due_date: dueAt(72 * HOUR) });

    expect(withUrgency(task, NOW)).toEqual({ ...task, is_urgent: false });
  });

  it("nie mutuje zadania wejściowego — pilność nie wycieka do danych źródłowych", () => {
    const task = makeTask({ due_date: dueAt(HOUR) });
    const kopiaPrzed = { ...task };

    withUrgency(task, NOW);

    expect(task).toEqual(kopiaPrzed);
    expect(task).not.toHaveProperty("is_urgent");
  });
});
