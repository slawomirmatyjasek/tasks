import type { Task, TaskWithUrgency } from "@/types";

/**
 * Logika biznesowa flagi pilności (FR-009 / US-02).
 *
 * Ten moduł jest CELOWO czysty: zero importów z Supabase, zero I/O, zero
 * odczytu globalnego zegara poza jawnie wstrzykiwanym argumentem `now`.
 * Dzięki temu da się go w całości pokryć testami jednostkowymi bez bazy
 * i bez mockowania czasu systemowego.
 */

/**
 * Próg pilności w godzinach. Wartość stała w MVP — PRD ("Non-Goals") wprost
 * wyklucza konfigurowalny próg, żeby nie dokładać ekranu ustawień.
 */
export const URGENCY_THRESHOLD_HOURS = 48;

/** Próg przeliczony na milisekundy — jednostkę, w której liczy `Date`. */
const URGENCY_THRESHOLD_MS = URGENCY_THRESHOLD_HOURS * 60 * 60 * 1000;

/**
 * Czy zadanie jest pilne w momencie `now`.
 *
 * Reguła (FR-009): zadanie jest pilne, gdy NIE jest ukończone ORAZ jego termin
 * przypada w ciągu najbliższych {@link URGENCY_THRESHOLD_HOURS} godzin.
 *
 * Świadome decyzje w przypadkach granicznych:
 *
 * 1. **Zadanie ukończone nigdy nie jest pilne** — niezależnie od terminu,
 *    nawet mocno przeterminowanego. `completed` jest sprawdzane jako pierwsze
 *    i zwarciowo kończy obliczenie (US-02, kryterium akceptacji).
 *
 * 2. **Zadanie po terminie i nieukończone JEST pilne.** Próg jest górnym
 *    ograniczeniem, nie przedziałem — nie ma dolnej granicy. Przeterminowane
 *    zadanie tym bardziej wymaga działania teraz, więc traktujemy je tak samo
 *    jak pilne. To domyślne założenie z PRD, "Open Questions" p. 1; gdyby
 *    użytkownik zdecydował o osobnej etykiecie "zaległe", to jest miejsce,
 *    w którym rozdzielenie należy dodać.
 *
 * 3. **Granica jest domknięta**: termin oddalony o dokładnie 48h to jeszcze
 *    pilne (porównanie `<=`), 48h + 1 ms to już nie. Inaczej mówiąc, pilny
 *    jest przedział `(-∞, now + 48h]`.
 *
 * 4. **Niepoprawna data** (`due_date`, którego nie da się sparsować) daje
 *    `NaN`, a każde porównanie z `NaN` jest fałszem — więc takie zadanie
 *    wychodzi jako NIE pilne. To celowe: fałszywy alarm pilności na
 *    uszkodzonych danych byłby gorszy niż jego brak, a walidacja daty
 *    odbywa się wcześniej, na zapisie (src/lib/tasks.ts).
 *
 * 5. **`now` jest wstrzykiwalne.** Domyślnie `new Date()`, ale test MUSI móc
 *    podać własny moment — bez tego asercje wokół granicy 48h byłyby
 *    niedeterministyczne i zaczęłyby migać w CI.
 *
 * @param task Zadanie — wystarczą pola `due_date` i `completed`.
 * @param now Moment odniesienia; domyślnie bieżący czas.
 * @returns `true`, gdy zadanie powinno być pokazane z flagą "pilne".
 */
export function isUrgent(task: Pick<Task, "due_date" | "completed">, now: Date = new Date()): boolean {
  // Decyzja 1: ukończone wypada z gry przed jakimkolwiek liczeniem czasu.
  if (task.completed) {
    return false;
  }

  const dueMs = new Date(task.due_date).getTime();
  const nowMs = now.getTime();

  // Decyzja 4: NaN (nieparsowalny termin lub nieprawidłowe `now`) => false.
  // Decyzje 2 i 3: brak dolnej granicy + domknięte `<=` na progu.
  return dueMs - nowMs <= URGENCY_THRESHOLD_MS;
}

/**
 * Wzbogaca zadanie o wyliczoną flagę `is_urgent`.
 *
 * Funkcja nie mutuje wejścia — zwraca nowy obiekt. Wynik jest ważny wyłącznie
 * dla podanego `now`; nie wolno go utrwalać w bazie ani cache'ować między
 * żądaniami (AGENTS.md, "Hard rules").
 *
 * @param task Pełne zadanie z bazy.
 * @param now Moment odniesienia; domyślnie bieżący czas.
 */
export function withUrgency(task: Task, now: Date = new Date()): TaskWithUrgency {
  return { ...task, is_urgent: isUrgent(task, now) };
}
