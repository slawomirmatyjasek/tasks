import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTask, deleteTask, listTasks, TaskNotFoundError, updateTask } from "@/lib/tasks";
import type { TasksSupabaseClient } from "@/lib/tasks";
import { isUrgent } from "@/lib/urgency";

/**
 * Testy integracyjne wobec PRAWDZIWEJ instancji Supabase.
 *
 * Powód istnienia: cały pozostały zestaw testuje warstwę danych na ręcznej
 * atrapie klienta bazy, a atrapa nie zna Row Level Security — przepuszcza
 * każde zapytanie. Gdyby ktoś skasował politykę `tasks_select_own`, testy
 * jednostkowe nadal świeciłyby na zielono. Ten plik zamyka tę lukę: sprawdza
 * ryzyka opisane w `context/foundation/test-plan.md`, których nie da się
 * sprawdzić bez prawdziwej bazy.
 *
 * Pokrywane ryzyka:
 *   #2 — zalogowany użytkownik widzi lub edytuje cudze zadania
 *   #7 — ukończenie zadania kasuje wiersz, zamiast być odwracalne
 *   #3/#6 — termin gubi się między zapisem a odczytem, więc flaga pilności
 *           zapala się obok terminu, który widzi użytkownik
 *
 * NIE wchodzi do `npm test` (osobny `vitest.integration.config.ts`), bo
 * wymaga sieci, sekretów i dwóch kont testowych. Uruchomienie:
 * `npm run test:integration`. Bez kompletu zmiennych zestaw jest pomijany,
 * a nie czerwony — brak konfiguracji to nie regresja produktu.
 */

const env = process.env;
const WYMAGANE = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "PILNE_TEST_A_EMAIL",
  "PILNE_TEST_A_PASSWORD",
  "PILNE_TEST_B_EMAIL",
  "PILNE_TEST_B_PASSWORD",
] as const;

const brakujace = WYMAGANE.filter((nazwa) => !env[nazwa]);
const opisz = brakujace.length === 0 ? describe : describe.skip;

if (brakujace.length > 0) {
  // eslint-disable-next-line no-console -- jedyny sposób, żeby powód pominięcia był widoczny w logu CI
  console.warn(`[rls.itest] pominięto testy integracyjne — brak zmiennych: ${brakujace.join(", ")}`);
}

interface Konto {
  klient: TasksSupabaseClient;
  surowy: SupabaseClient;
  userId: string;
  posprzataj: string[];
}

async function zaloguj(emailVar: string, hasloVar: string): Promise<Konto> {
  const surowy = createSupabaseClient(env.SUPABASE_URL ?? "", env.SUPABASE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await surowy.auth.signInWithPassword({
    email: env[emailVar] ?? "",
    password: env[hasloVar] ?? "",
  });

  if (error) {
    throw new Error(`Nie udało się zalogować konta z ${emailVar}: ${error.message}`);
  }

  // Ten sam obiekt w dwóch rolach: jako `klient` trafia do PRODUKCYJNYCH funkcji
  // z `src/lib/tasks.ts` (typy pasują bez rzutowania), jako `surowy` służy do
  // zapytań, których warstwa danych nie wystawia — np. próby wstawienia wiersza
  // z cudzym `user_id`.
  return { klient: surowy, surowy, userId: data.user.id, posprzataj: [] };
}

function zaTyleGodzin(godziny: number): string {
  return new Date(Date.now() + godziny * 60 * 60 * 1000).toISOString();
}

opisz("izolacja kont i trwałość danych na prawdziwej bazie", () => {
  let a: Konto;
  let b: Konto;

  beforeAll(async () => {
    a = await zaloguj("PILNE_TEST_A_EMAIL", "PILNE_TEST_A_PASSWORD");
    b = await zaloguj("PILNE_TEST_B_EMAIL", "PILNE_TEST_B_PASSWORD");
    expect(a.userId).not.toBe(b.userId);
  });

  afterAll(async () => {
    for (const konto of [a, b]) {
      for (const id of konto.posprzataj) {
        await konto.surowy.from("tasks").delete().eq("id", id);
      }
    }
  });

  describe("ryzyko #2 — cudze zadania", () => {
    it("konta B nie ma na liście zadania konta A", async () => {
      const zadanieA = await createTask(a.klient, a.userId, {
        title: "[itest] zadanie konta A",
        due_date: zaTyleGodzin(24),
      });
      a.posprzataj.push(zadanieA.id);

      const listaB = await listTasks(b.klient);

      expect(listaB.map((zadanie) => zadanie.id)).not.toContain(zadanieA.id);
    });

    it("konto B nie zmieni zadania konta A", async () => {
      const zadanieA = await createTask(a.klient, a.userId, {
        title: "[itest] do próby edycji",
        due_date: zaTyleGodzin(24),
      });
      a.posprzataj.push(zadanieA.id);

      await expect(updateTask(b.klient, zadanieA.id, { title: "przejęte przez B" })).rejects.toBeInstanceOf(
        TaskNotFoundError,
      );

      const [nadalU_A] = (await listTasks(a.klient)).filter((zadanie) => zadanie.id === zadanieA.id);
      expect(nadalU_A.title).toBe("[itest] do próby edycji");
    });

    it("konto B nie usunie zadania konta A", async () => {
      const zadanieA = await createTask(a.klient, a.userId, {
        title: "[itest] do próby usunięcia",
        due_date: zaTyleGodzin(24),
      });
      a.posprzataj.push(zadanieA.id);

      await expect(deleteTask(b.klient, zadanieA.id)).rejects.toBeInstanceOf(TaskNotFoundError);

      const idsU_A = (await listTasks(a.klient)).map((zadanie) => zadanie.id);
      expect(idsU_A).toContain(zadanieA.id);
    });

    it("właściciel przechodzi tą samą ścieżką bez przeszkód — inaczej test izolacji niczego nie dowodzi", async () => {
      // Kontrola sensu trzech testów powyżej. Gdyby `updateTask` i `deleteTask`
      // wywracały się także u właściciela, ich odrzucenie u konta B nie byłoby
      // dowodem działania RLS, tylko dowodem zepsutego wywołania.
      const zadanie = await createTask(a.klient, a.userId, {
        title: "[itest] właściciel edytuje swoje",
        due_date: zaTyleGodzin(24),
      });

      const po = await updateTask(a.klient, zadanie.id, { title: "[itest] zmienione przez właściciela" });
      expect(po.title).toBe("[itest] zmienione przez właściciela");

      await expect(deleteTask(a.klient, zadanie.id)).resolves.toBeUndefined();

      const ids = (await listTasks(a.klient)).map((element) => element.id);
      expect(ids).not.toContain(zadanie.id);
    });

    it("konto B nie wstawi zadania na konto A", async () => {
      const { data, error } = await b.surowy
        .from("tasks")
        .insert({ user_id: a.userId, title: "[itest] podszycie", due_date: zaTyleGodzin(24) })
        .select("id");

      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });

  describe("ryzyko #7 — ukończenie nie kasuje zadania", () => {
    it("po oznaczeniu jako ukończone wiersz nadal istnieje i da się to cofnąć", async () => {
      const zadanie = await createTask(a.klient, a.userId, {
        title: "[itest] ukończenie jest odwracalne",
        due_date: zaTyleGodzin(3),
      });
      a.posprzataj.push(zadanie.id);

      const poUkonczeniu = await updateTask(a.klient, zadanie.id, { completed: true });
      expect(poUkonczeniu.completed).toBe(true);

      const naLiscie = (await listTasks(a.klient)).find((element) => element.id === zadanie.id);
      expect(naLiscie).toBeDefined();
      expect(naLiscie?.is_urgent).toBe(false);

      const poCofnieciu = await updateTask(a.klient, zadanie.id, { completed: false });
      expect(poCofnieciu.completed).toBe(false);
    });
  });

  describe("ryzyko #3 i #6 — termin przeżywa zapis i odczyt", () => {
    it("zapisany moment jest tym samym momentem po odczycie, a flaga pilności zgadza się z terminem", async () => {
      const termin = zaTyleGodzin(24);
      const zadanie = await createTask(a.klient, a.userId, { title: "[itest] termin za 24h", due_date: termin });
      a.posprzataj.push(zadanie.id);

      const odczytane = (await listTasks(a.klient)).find((element) => element.id === zadanie.id);

      expect(odczytane).toBeDefined();
      expect(Date.parse(odczytane?.due_date ?? "")).toBe(Date.parse(termin));
      expect(odczytane?.is_urgent).toBe(true);
      expect(isUrgent({ due_date: termin, completed: false })).toBe(true);
    });

    it("zadanie z terminem za pięć dni nie jest pilne po przejściu przez bazę", async () => {
      const termin = zaTyleGodzin(24 * 5);
      const zadanie = await createTask(a.klient, a.userId, { title: "[itest] termin za 5 dni", due_date: termin });
      a.posprzataj.push(zadanie.id);

      const odczytane = (await listTasks(a.klient)).find((element) => element.id === zadanie.id);

      expect(odczytane?.is_urgent).toBe(false);
    });
  });
});
