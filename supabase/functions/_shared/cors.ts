// ============================================================================
//  CORS — wspólna obsługa nagłówków dla wszystkich Edge Functions.
//  Lista dozwolonych domen w sekrecie ALLOWED_ORIGINS (rozdzielona przecinkami),
//  np.: "https://twojadomena.pl,https://uzytkownik.github.io,http://localhost:5500"
//  Jeśli sekret nie jest ustawiony — przepuszczamy każde origin (tryb dev).
//  Uwaga: CORS to tylko ochrona przeglądarki. Prawdziwym zabezpieczeniem
//  funkcji jest weryfikacja JWT + tabela `admins` (patrz admin.ts).
// ============================================================================

const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get('origin') ?? '').replace(/\/$/, '');
  let allow = '*';

  if (configured.length > 0) {
    allow = configured.includes(origin) ? origin : configured[0];
  } else if (origin) {
    allow = origin;
  }

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/** Odpowiedź na preflight (OPTIONS). */
export function preflight(req: Request): Response {
  return new Response('ok', { status: 200, headers: corsHeaders(req) });
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(req: Request, message: string, status = 400, extra?: unknown): Response {
  console.error(`[${status}] ${message}`, extra ?? '');
  return jsonResponse(req, { error: message }, status);
}
