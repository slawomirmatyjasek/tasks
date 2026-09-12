import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

/**
 * Konfiguracja testów integracyjnych — osobna od `vitest.config.ts` celowo.
 *
 * Testy jednostkowe (`*.test.ts`) mają być szybkie, deterministyczne i wolne
 * od sieci; te (`*.itest.ts`) rozmawiają z prawdziwą instancją Supabase, więc
 * nie mogą wejść do domyślnego `npm test` ani do bramki uruchamianej przy
 * każdym commicie. Rozdzielenie po wzorcu nazwy, nie po katalogu, bo cała
 * reszta zestawu też leży obok kodu.
 *
 * Zmienne środowiskowe są wczytywane z `.env` tym samym mechanizmem, którego
 * używa Astro — dzięki temu test korzysta z tej samej konfiguracji co aplikacja
 * i nie trzeba duplikować sekretów.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.itest.ts"],
    env: loadEnv("", process.cwd(), ""),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Jedna instancja bazy, konta współdzielone między plikami — równoległe
    // pliki wchodziłyby sobie w dane.
    fileParallelism: false,
  },
});
