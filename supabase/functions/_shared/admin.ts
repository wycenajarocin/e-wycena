// ============================================================================
//  Autoryzacja + limity dla Edge Functions.
//
//  Zasada bezpieczeństwa:
//    1. Klient (admin.html) wysyła nagłówek Authorization: Bearer <access_token>
//       użytkownika zalogowanego w Supabase Auth.
//    2. Funkcja weryfikuje token i sprawdza, czy user_id jest w tabeli `admins`.
//    3. Dopiero potem używa SERVICE_ROLE_KEY (klucz nigdy nie opuszcza serwera).
//
//  Nawet mając pełny dostęp do plików strony (GitHub Pages) nikt nie pozna
//  ani klucza service_role, ani klucza OpenAI — są wyłącznie w sekretach
//  Supabase Edge Functions.
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Klient z pełnymi uprawnieniami — pomija RLS. Używać tylko po requireAdmin(). */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AdminContext {
  userId: string;
  email: string | null;
  db: SupabaseClient;
}

/**
 * Weryfikuje, że żądanie pochodzi od zalogowanego administratora.
 * Rzuca HttpError(401/403) w przeciwnym wypadku.
 */
export async function requireAdmin(req: Request): Promise<AdminContext> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Brak tokenu autoryzacji — zaloguj się ponownie.');

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) {
    throw new HttpError(401, 'Sesja wygasła — zaloguj się ponownie.');
  }

  const db = serviceClient();
  const { data: adminRow, error: adminErr } = await db
    .from('admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminErr) throw new HttpError(500, 'Nie udało się zweryfikować uprawnień.');
  if (!adminRow) throw new HttpError(403, 'Brak uprawnień administratora dla tego konta.');

  return { userId: userData.user.id, email: userData.user.email ?? null, db };
}

/**
 * Prosty limit zużycia (ochrona przed przypadkowym wyczerpaniem limitów
 * OpenAI / wywołań funkcji, np. przy zapętlonym skrypcie).
 */
export async function enforceRateLimit(
  ctx: AdminContext,
  kind: string,
  maxPerHour: number,
): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await ctx.db
    .from('api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('kind', kind)
    .gte('created_at', since);

  if (error) {
    console.error('rate limit check failed', error);
    return; // nie blokujemy pracy, jeśli sam licznik zawiedzie
  }
  if ((count ?? 0) >= maxPerHour) {
    throw new HttpError(
      429,
      `Limit ${maxPerHour} operacji "${kind}" na godzinę został wykorzystany. Spróbuj później.`,
    );
  }
}

export async function logUsage(ctx: AdminContext, kind: string, meta: unknown): Promise<void> {
  const { error } = await ctx.db
    .from('api_usage')
    .insert({ user_id: ctx.userId, kind, meta: meta ?? {} });
  if (error) console.error('logUsage failed', error);
}
