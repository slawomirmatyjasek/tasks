import { afterEach, describe, expect, it, vi } from "vitest";
import { dateTimeLocalToIso, formatDueDate, formatDueDateUtc, isoToDateTimeLocal } from "@/components/tasks/datetime";

/**
 * Testy konwersji i formatowania terminu zadania.
 *
 * Dwie zasady obowiązujące w całym pliku:
 *
 * 1. Żadna asercja nie odnosi się do bieżącego czasu systemowego — wszystkie
 *    momenty są literałami ISO. Test zależny od zegara przechodzi rano i pada
 *    wieczorem, więc niczego nie chroni.
 * 2. Strefa czasowa jest zawsze WYMUSZONA jawnie. Domyślna strefa maszyny
 *    dewelopera (Europe/Warsaw) i maszyny CI (zwykle UTC) są różne, a to
 *    właśnie ta różnica jest tu przedmiotem testu.
 *
 * Wymuszanie strefy działa przez `process.env.TZ`: Node przelicza po jej
 * zmianie zarówno metody `Date` (`getHours()` itd.), jak i NOWO tworzone
 * instancje `Intl.DateTimeFormat`. Pierwszy test w pliku sprawdza ten mechanizm
 * wprost, żeby ewentualna zmiana zachowania środowiska wywaliła zestaw zamiast
 * po cichu zamienić resztę asercji w atrapy.
 */

/** Moment odniesienia: 12:30 UTC w lecie (Warszawa = UTC+2) i w zimie (UTC+1). */
const SUMMER_UTC = "2026-07-01T12:30:00.000Z";
const WINTER_UTC = "2026-01-15T12:30:00.000Z";

/** Uruchamia `run()` przy wymuszonej strefie czasowej i przywraca poprzednią. */
function withTimeZone<T>(timeZone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

/**
 * Importuje moduł od nowa przy wymuszonej strefie.
 *
 * `formatDueDate()` tworzy swój formatter raz, przy ładowaniu modułu, więc
 * samo podmienienie `process.env.TZ` po imporcie nic by nie dało — trzeba
 * zresetować rejestr modułów i wczytać go ponownie już w docelowej strefie.
 */
async function importDatetimeIn(timeZone: string): Promise<typeof import("@/components/tasks/datetime")> {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  vi.resetModules();
  try {
    return await import("@/components/tasks/datetime");
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

afterEach(() => {
  vi.resetModules();
});

describe("środowisko testowe", () => {
  it("pozwala faktycznie wymusić strefę czasową inną niż UTC", () => {
    const hourInWarsaw = withTimeZone("Europe/Warsaw", () => new Date(SUMMER_UTC).getHours());
    const hourInUtc = withTimeZone("UTC", () => new Date(SUMMER_UTC).getHours());

    expect(hourInWarsaw).toBe(14);
    expect(hourInUtc).toBe(12);
  });
});

describe("isoToDateTimeLocal przelicza termin z bazy na czas lokalny", () => {
  it("termin 12:30 UTC pokazuje w Warszawie jako 14:30 (czas letni, UTC+2)", () => {
    expect(withTimeZone("Europe/Warsaw", () => isoToDateTimeLocal(SUMMER_UTC))).toBe("2026-07-01T14:30");
  });

  it("termin 12:30 UTC pokazuje w Warszawie jako 13:30 (czas zimowy, UTC+1)", () => {
    expect(withTimeZone("Europe/Warsaw", () => isoToDateTimeLocal(WINTER_UTC))).toBe("2026-01-15T13:30");
  });

  it("radzi sobie ze strefą o przesunięciu niepełnogodzinnym (Asia/Kolkata, UTC+5:30)", () => {
    expect(withTimeZone("Asia/Kolkata", () => isoToDateTimeLocal(SUMMER_UTC))).toBe("2026-07-01T18:00");
  });

  it("uwzględnia przejście przez granicę doby w strefie ujemnej", () => {
    expect(withTimeZone("America/Los_Angeles", () => isoToDateTimeLocal("2026-07-01T02:30:00.000Z"))).toBe(
      "2026-06-30T19:30",
    );
  });

  it("zwraca pusty napis dla terminu, którego nie da się sparsować", () => {
    expect(withTimeZone("Europe/Warsaw", () => isoToDateTimeLocal("nie-jest-datą"))).toBe("");
  });

  it("zwraca pusty napis dla pustego wejścia", () => {
    expect(withTimeZone("Europe/Warsaw", () => isoToDateTimeLocal(""))).toBe("");
  });
});

describe("round-trip terminu w strefie innej niż UTC", () => {
  const zones = ["Europe/Warsaw", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"];

  for (const zone of zones) {
    it(`ISO -> pole formularza -> ISO nie przesuwa terminu letniego w strefie ${zone}`, () => {
      const result = withTimeZone(zone, () => dateTimeLocalToIso(isoToDateTimeLocal(SUMMER_UTC)));
      expect(result).toBe(SUMMER_UTC);
    });

    it(`ISO -> pole formularza -> ISO nie przesuwa terminu zimowego w strefie ${zone}`, () => {
      const result = withTimeZone(zone, () => dateTimeLocalToIso(isoToDateTimeLocal(WINTER_UTC)));
      expect(result).toBe(WINTER_UTC);
    });
  }

  it("pole formularza -> ISO -> pole formularza oddaje dokładnie wpisaną wartość", () => {
    const typedByUser = "2026-07-01T14:30";
    const result = withTimeZone("Europe/Warsaw", () => {
      const iso = dateTimeLocalToIso(typedByUser);
      expect(iso).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asercja wyżej już to sprawdziła
      return isoToDateTimeLocal(iso!);
    });
    expect(result).toBe(typedByUser);
  });

  it("termin wpisany jako 14:30 w Warszawie leci do API jako 12:30 UTC", () => {
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("2026-07-01T14:30"))).toBe(SUMMER_UTC);
  });

  it("ten sam napis z formularza daje różne ISO w różnych strefach", () => {
    const warsaw = withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("2026-07-01T14:30"));
    const utc = withTimeZone("UTC", () => dateTimeLocalToIso("2026-07-01T14:30"));

    expect(warsaw).toBe("2026-07-01T12:30:00.000Z");
    expect(utc).toBe("2026-07-01T14:30:00.000Z");
  });
});

describe("dateTimeLocalToIso odrzuca wejście, którego nie wolno wysłać do API", () => {
  it("puste pole daje null", () => {
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso(""))).toBeNull();
  });

  it("pole wypełnione samymi białymi znakami daje null", () => {
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("   \t\n "))).toBeNull();
  });

  it("napis niebędący datą daje null", () => {
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("jutro po południu"))).toBeNull();
  });

  it("data z niepoprawnym miesiącem daje null", () => {
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("2026-13-01T10:00"))).toBeNull();
  });

  it("sama godzina bez daty daje null", () => {
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("14:30"))).toBeNull();
  });

  it("dzień nieistniejący w kalendarzu jest przez silnik JS przewijany na kolejny miesiąc", () => {
    // Udokumentowanie faktycznego zachowania, nie życzenia: `new Date("2026-02-30T10:00")`
    // nie jest w V8 nieprawidłową datą, tylko 2 marca. `<input type="datetime-local">`
    // nigdy takiej wartości nie odda, więc nie jest to droga ataku — ale gdyby ktoś
    // kiedyś zaczął podawać tę funkcję surowym tekstem, musi o tym wiedzieć.
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso("2026-02-30T10:00"))).toBe(
      "2026-03-02T09:00:00.000Z",
    );
  });
});

describe("formatDueDateUtc jest odporne na strefę runtime'u (zabezpieczenie poprawki B1)", () => {
  const zones = ["UTC", "Europe/Warsaw", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"];

  it("zwraca identyczny napis niezależnie od strefy, w której załadowano moduł", async () => {
    const results: string[] = [];
    for (const zone of zones) {
      const module = await importDatetimeIn(zone);
      results.push(module.formatDueDateUtc(SUMMER_UTC));
    }

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("1 lip 2026, 12:30");
  });

  it("zwraca identyczny napis niezależnie od strefy ustawionej po załadowaniu modułu", () => {
    const inWarsaw = withTimeZone("Europe/Warsaw", () => formatDueDateUtc(WINTER_UTC));
    const inUtc = withTimeZone("UTC", () => formatDueDateUtc(WINTER_UTC));
    const inKiritimati = withTimeZone("Pacific/Kiritimati", () => formatDueDateUtc(WINTER_UTC));

    expect(inWarsaw).toBe("15 sty 2026, 12:30");
    expect(inUtc).toBe(inWarsaw);
    expect(inKiritimati).toBe(inWarsaw);
  });

  it("dla nieparsowalnego terminu zwraca komunikat zamiast rzucać", () => {
    expect(formatDueDateUtc("nie-jest-datą")).toBe("nieprawidłowy termin");
  });
});

describe("formatDueDate pokazuje termin w strefie runtime'u", () => {
  it("moduł załadowany w Warszawie formatuje termin 12:30 UTC jako 14:30", async () => {
    const module = await importDatetimeIn("Europe/Warsaw");
    expect(module.formatDueDate(SUMMER_UTC)).toBe("1 lip 2026, 14:30");
  });

  it("moduł załadowany w UTC formatuje ten sam termin jako 12:30", async () => {
    const module = await importDatetimeIn("UTC");
    expect(module.formatDueDate(SUMMER_UTC)).toBe("1 lip 2026, 12:30");
  });

  it("różni się od formatDueDateUtc dla użytkownika spoza UTC — to jest sedno poprawki B1", async () => {
    const module = await importDatetimeIn("Europe/Warsaw");
    expect(module.formatDueDate(SUMMER_UTC)).not.toBe(module.formatDueDateUtc(SUMMER_UTC));
  });

  it("dla użytkownika w UTC obie funkcje dają ten sam napis i podmiana po hydracji jest niewidoczna", async () => {
    const module = await importDatetimeIn("UTC");
    expect(module.formatDueDate(SUMMER_UTC)).toBe(module.formatDueDateUtc(SUMMER_UTC));
  });

  it("dla nieparsowalnego terminu zwraca komunikat zamiast rzucać", () => {
    expect(formatDueDate("nie-jest-datą")).toBe("nieprawidłowy termin");
  });
});

describe("etykieta terminu nie pokazuje sekund", () => {
  it("termin z sekundami i bez sekund daje ten sam napis", () => {
    expect(formatDueDateUtc("2026-07-01T12:30:45.000Z")).toBe(formatDueDateUtc("2026-07-01T12:30:00.000Z"));
  });

  it("sekundy i milisekundy są ucinane, nie zaokrąglane w górę", () => {
    expect(formatDueDateUtc("2026-07-01T12:30:59.999Z")).toBe("1 lip 2026, 12:30");
  });

  it("termin zapisany bez części sekundowej formatuje się tak samo", () => {
    expect(formatDueDateUtc("2026-07-01T12:30Z")).toBe("1 lip 2026, 12:30");
  });

  it("pole formularza też nie niesie sekund, więc round-trip nie może ich zgubić", () => {
    const local = withTimeZone("Europe/Warsaw", () => isoToDateTimeLocal("2026-07-01T12:30:45.000Z"));
    expect(local).toBe("2026-07-01T14:30");
    expect(withTimeZone("Europe/Warsaw", () => dateTimeLocalToIso(local))).toBe("2026-07-01T12:30:00.000Z");
  });
});
