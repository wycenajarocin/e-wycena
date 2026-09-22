// ============================================================================
//  Edge Function: refresh-google-reviews
//  ---------------------------------------------------------------------------
//  Wywoływana WYŁĄCZNIE przez harmonogram (Supabase Cron / pg_cron, raz
//  dziennie — patrz README-BACKEND.md, sekcja "Opinie Google"). Pobiera ocenę
//  i do 5 opinii z Google Places API (New) i zapisuje je w tabeli
//  `google_reviews`.
//
//  Strona WWW NIGDY nie wywołuje tej funkcji ani Google bezpośrednio — czyta
//  wyłącznie zapisany wiersz z bazy (REST / PostgREST, klucz anon). Dzięki
//  temu liczba zapytań do Google jest stała (1 dziennie) i nie zależy od
//  ruchu na stronie.
//
//  Ochrona przed nadużyciem: żądanie musi zawierać nagłówek
//  `X-Cron-Secret: <CRON_SECRET>`. Bez tego ktokolwiek znający adres funkcji
//  mógłby wymuszać powtarzane odpytywanie Google (i zużywać darmowy limit).
// ============================================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/admin.ts';

const PLACE_ID = Deno.env.get('GOOGLE_PLACE_ID') ?? '';
const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const FIELD_MASK = ['id', 'displayName', 'rating', 'userRatingCount', 'googleMapsUri', 'reviews'].join(',');

interface GoogleReview {
  rating?: number;
  relativePublishTimeDescription?: string;
  publishTime?: string;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse(req, 'Dozwolone metody: GET, POST.', 405);
  }

  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return errorResponse(req, 'Brak uprawnień.', 401);
  }

  if (!PLACE_ID || !API_KEY) {
    return errorResponse(
      req,
      'Brak konfiguracji — ustaw sekrety GOOGLE_PLACE_ID i GOOGLE_PLACES_API_KEY.',
      500,
    );
  }

  try {
    // languageCode=pl: bez tego Google potrafi zwrócić opinie przetłumaczone
    // automatycznie na angielski (albo inny język niż ten, w którym napisał
    // je klient).
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}?languageCode=pl`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Places API zwróciło błąd ${res.status}: ${text.slice(0, 300)}`);
    }

    const place = await res.json();

    const reviews = Array.isArray(place.reviews)
      ? (place.reviews as GoogleReview[]).slice(0, 5).map((r) => ({
          authorName: r.authorAttribution?.displayName ?? 'Klient Google',
          authorPhotoUrl: r.authorAttribution?.photoUri ?? null,
          authorProfileUrl: r.authorAttribution?.uri ?? null,
          rating: typeof r.rating === 'number' ? r.rating : null,
          relativeTime: r.relativePublishTimeDescription ?? '',
          // Wolimy oryginalną treść opinii (tak jak napisał ją klient) od
          // tłumaczenia Google — tłumaczenie tylko jako zapasowa opcja,
          // gdyby oryginału zabrakło w odpowiedzi API.
          text: r.originalText?.text ?? r.text?.text ?? '',
          publishTime: r.publishTime ?? null,
        }))
      : [];

    const db = serviceClient();
    const { error } = await db.from('google_reviews').upsert({
      id: 1,
      place_id: PLACE_ID,
      place_name: place.displayName?.text ?? null,
      rating: typeof place.rating === 'number' ? place.rating : null,
      user_ratings_total: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
      reviews,
      maps_uri: place.googleMapsUri ?? null,
      fetched_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);

    return jsonResponse(req, {
      ok: true,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      reviewCount: reviews.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Nieoczekiwany błąd serwera.';
    return errorResponse(req, message, 502, err);
  }
});
