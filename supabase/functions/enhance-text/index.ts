// ============================================================================
//  Edge Function: enhance-text
//  ---------------------------------------------------------------------------
//  Używana przy RĘCZNYM dodawaniu ogłoszenia — przycisk "Popraw tekst (AI)".
//  Bierze to, co administrator wpisał w formularzu, poprawia stylistykę
//  i ortografię, proponuje listę udogodnień oraz meta tagi SEO.
//
//  Wejście:  POST { title, description, features?, propertyType?,
//                   transactionType?, location?, area?, rooms?, price? }
//  Wyjście:  { title, description, features, metaTitle, metaDescription }
//
//  Model nie ma prawa wymyślać faktów (patrz prompt w _shared/openai.ts),
//  więc wynik zawsze trafia do formularza jako propozycja do zaakceptowania,
//  a nie bezpośrednio na stronę.
// ============================================================================

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAdmin, enforceRateLimit, logUsage, HttpError } from '../_shared/admin.ts';
import { aiEnabled, polishListing } from '../_shared/openai.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return errorResponse(req, 'Dozwolona jest tylko metoda POST.', 405);

  try {
    const ctx = await requireAdmin(req);

    if (!aiEnabled()) {
      throw new HttpError(
        503,
        'Obróbka AI jest wyłączona — nie ustawiono sekretu OPENAI_API_KEY.',
      );
    }

    await enforceRateLimit(ctx, 'ai', 60);

    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? '').trim();
    const description = String(body.description ?? '').trim();

    if (description.length < 40) {
      throw new HttpError(
        400,
        'Wpisz najpierw opis (minimum 40 znaków) — AI porządkuje tekst, nie tworzy go z niczego.',
      );
    }

    const features = Array.isArray(body.features)
      ? body.features.filter((f: unknown): f is string => typeof f === 'string')
      : [];

    const polished = await polishListing({
      title,
      description,
      features,
      propertyType: body.propertyType ? String(body.propertyType) : undefined,
      transactionType: body.transactionType ? String(body.transactionType) : undefined,
      location: body.location ? String(body.location) : undefined,
      area: body.area != null ? Number(body.area) : null,
      rooms: body.rooms != null ? Number(body.rooms) : null,
      price: body.price != null ? Number(body.price) : null,
    });

    await logUsage(ctx, 'ai', { source: 'enhance-text', chars: description.length });

    return jsonResponse(req, polished);
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status);
    const message = err instanceof Error ? err.message : 'Nieoczekiwany błąd serwera.';
    return errorResponse(req, message, 400, err);
  }
});
