// ============================================================================
//  Edge Function: scrape-otodom
//  ---------------------------------------------------------------------------
//  Wejście:  POST { url: string, useAi?: boolean }
//  Wyjście:  { listing, ai: { applied, error? }, duplicate?: {...} }
//
//  Funkcja NIE zapisuje nic w bazie — zwraca gotowe dane do podglądu
//  w panelu administratora. Dzięki temu można je jeszcze poprawić przed
//  publikacją, a jeden przypadkowy klik nie tworzy śmieci w bazie.
//
//  Zapis robi panel (insert do tabeli `properties` przez RLS), a zdjęcia
//  przenosi funkcja `import-images`.
// ============================================================================

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAdmin, enforceRateLimit, logUsage, HttpError } from '../_shared/admin.ts';
import { assertOtodomUrl, fetchOtodomAd, mapOtodomAd } from '../_shared/otodom.ts';
import { aiEnabled, polishListing } from '../_shared/openai.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return errorResponse(req, 'Dozwolona jest tylko metoda POST.', 405);

  try {
    const ctx = await requireAdmin(req);
    await enforceRateLimit(ctx, 'scrape', 40);

    const body = await req.json().catch(() => ({}));
    const url = assertOtodomUrl(String(body.url ?? ''));
    const useAi = body.useAi !== false; // domyślnie tak, jeśli klucz jest ustawiony

    // --- 1. Pobranie i sparsowanie ogłoszenia ---
    const ad = await fetchOtodomAd(url);
    const listing = mapOtodomAd(ad, url);

    if (!listing.title) throw new HttpError(422, 'Ogłoszenie nie ma tytułu — przerwano import.');

    // --- 2. Czy już mamy tę ofertę? ---
    let duplicate: { id: string; slug: string; title: string } | null = null;
    if (listing.sourceId) {
      const { data } = await ctx.db
        .from('properties')
        .select('id, slug, title')
        .eq('source', 'otodom')
        .eq('source_id', listing.sourceId)
        .maybeSingle();
      if (data) duplicate = data;
    }

    // --- 3. Opcjonalne wygładzenie tekstu przez AI ---
    const ai: { applied: boolean; error?: string } = { applied: false };
    let metaTitle: string | null = null;
    let metaDescription: string | null = null;

    if (useAi && aiEnabled()) {
      try {
        const polished = await polishListing({
          title: listing.title,
          description: listing.description,
          features: listing.features,
          propertyType: listing.propertyType,
          transactionType: listing.transactionType,
          location: listing.location,
          area: listing.area,
          rooms: listing.rooms,
          price: listing.price,
        });
        listing.title = polished.title || listing.title;
        listing.description = polished.description || listing.description;
        if (polished.features.length) listing.features = polished.features;
        metaTitle = polished.metaTitle || null;
        metaDescription = polished.metaDescription || null;
        ai.applied = true;
        await logUsage(ctx, 'ai', { source: 'scrape-otodom', url });
      } catch (err) {
        // Awaria AI nie może blokować importu — zwracamy dane "surowe".
        ai.error = err instanceof Error ? err.message : 'Nieznany błąd AI';
        console.error('AI polish failed', err);
      }
    } else if (useAi && !aiEnabled()) {
      ai.error = 'OPENAI_API_KEY nie jest ustawiony — pominięto obróbkę AI.';
    }

    await logUsage(ctx, 'scrape', { url, images: listing.images.length, ai: ai.applied });

    return jsonResponse(req, {
      listing,
      metaTitle,
      metaDescription,
      ai,
      duplicate,
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status);
    const message = err instanceof Error ? err.message : 'Nieoczekiwany błąd serwera.';
    return errorResponse(req, message, 400, err);
  }
});
