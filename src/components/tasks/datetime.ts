/**
 * Konwersje między terminem zadania (ISO 8601 w UTC, tak trzyma go baza)
 * a wartością pola `<input type="datetime-local">` (czas lokalny przeglądarki,
 * format `YYYY-MM-DDTHH:mm`, bez strefy).
 *
 * Konwersja MUSI dziać się po stronie klienta. `<input type="datetime-local">`
 * oddaje napis bez strefy; gdyby trafił on prosto do API, serwer (Cloudflare
 * Workers, zegar w UTC) zinterpretowałby go jako czas UTC i przesunął termin
 * użytkownika o offset jego strefy — a od terminu zależy flaga pilności.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO 8601 (UTC) -> wartość dla `<input type="datetime-local">` (czas lokalny). */
export function isoToDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Wartość `<input type="datetime-local">` -> ISO 8601 w UTC.
 * Zwraca `null`, gdy pole jest puste albo nie da się go sparsować — wywołujący
 * zamienia to na komunikat walidacji zamiast wysyłać śmieci do API.
 */
export function dateTimeLocalToIso(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }
  // Napis bez strefy jest parsowany jako czas LOKALNY przeglądarki — o to chodzi.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

const DUE_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/** Etykieta w strefie runtime'u: w przeglądarce to strefa użytkownika, na serwerze UTC. */
const localDueDateFormatter = new Intl.DateTimeFormat("pl-PL", DUE_DATE_FORMAT_OPTIONS);

/** Etykieta zawsze w UTC — niezależna od tego, gdzie kod akurat działa. */
const utcDueDateFormatter = new Intl.DateTimeFormat("pl-PL", { ...DUE_DATE_FORMAT_OPTIONS, timeZone: "UTC" });

/** Wspólny komunikat dla terminu, którego nie da się sparsować. */
const INVALID_DUE_DATE_LABEL = "nieprawidłowy termin";

function formatWith(formatter: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return INVALID_DUE_DATE_LABEL;
  }
  return formatter.format(date);
}

/**
 * Czytelna etykieta terminu w strefie runtime'u.
 *
 * Wolno jej użyć DOPIERO po hydracji — na serwerze (Cloudflare Workers, zegar
 * w UTC) zwróci inny napis niż w przeglądarce użytkownika. Do renderu SSR
 * i pierwszego renderu klienckiego służy `formatDueDateUtc()`.
 */
export function formatDueDate(iso: string): string {
  return formatWith(localDueDateFormatter, iso);
}

/**
 * Czytelna etykieta terminu wymuszona w UTC.
 *
 * Istnieje po to, żeby render serwerowy i render hydracyjny dawały identyczny
 * napis niezależnie od strefy przeglądarki — bez tego React zostawiłby w DOM
 * wartość z SSR i nigdy jej nie podmienił (patrz komentarz w `TaskItem`).
 */
export function formatDueDateUtc(iso: string): string {
  return formatWith(utcDueDateFormatter, iso);
}
