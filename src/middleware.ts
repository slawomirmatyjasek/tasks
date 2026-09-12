import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

/**
 * Trasy bez sensu dla zalogowanego użytkownika: wizytówka produktu i ekrany
 * logowania/rejestracji. Trafienie tu z ważną sesją kończy się skokiem na
 * listę zadań — inaczej po zalogowaniu w drugiej karcie widać formularz
 * logowania z paskiem "jesteś zalogowany" na górze.
 */
const GUEST_ONLY_ROUTES = ["/", "/auth/signin", "/auth/signup", "/auth/confirm-email"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;

  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (context.locals.user && GUEST_ONLY_ROUTES.includes(pathname)) {
    return context.redirect("/dashboard");
  }

  return next();
});
