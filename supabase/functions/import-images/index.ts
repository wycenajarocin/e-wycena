// ============================================================================
//  Edge Function: import-images
//  ---------------------------------------------------------------------------
//  Przenosi zdjęcia z CDN Otodom do Supabase Storage (bucket 'property-images')
//  i dopisuje rekordy do tabeli property_images.
//
//  Dlaczego serwer, a nie przeglądarka? CDN Otodom nie wysyła nagłówków CORS,
//  więc przeglądarka nie może pobrać tych plików. Poza tym własna kopia zdjęć
//  oznacza, że ogłoszenie nie "ślepnie", gdy oferta zniknie z Otodom.
//
//  Wejście:  POST {
//              propertyId: uuid,
//              images: [{ url, thumbUrl? }],   // maks. 8 na wywołanie
//              startPosition?: number
//            }
//  Wyjście:  { imported: n, failed: [...], images: [...] }
//
//  Panel wywołuje tę funkcję partiami (po kilka zdjęć), żeby zmieścić się
//  w limicie czasu wykonania funkcji i pokazywać pasek postępu.
// ============================================================================

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAdmin, enforceRateLimit, logUsage, HttpError } from '../_shared/admin.ts';
import { isAllowedImageUrl } from '../_shared/otodom.ts';

const BUCKET = 'property-images';
const MAX_PER_CALL = 8;
const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

async function download(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*',
      'Referer': 'https://www.otodom.pl/',
    },
  });
  if (!res.ok) throw new Error(`pobieranie nie udało się (HTTP ${res.status})`);

  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!EXT_BY_MIME[mime]) throw new Error(`nieobsługiwany typ pliku: ${mime || 'brak'}`);

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error('plik jest pusty');
  if (buffer.byteLength > MAX_BYTES) throw new Error('plik przekracza 8 MB');

  return { bytes: buffer, mime };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return errorResponse(req, 'Dozwolona jest tylko metoda POST.', 405);

  try {
    const ctx = await requireAdmin(req);
    await enforceRateLimit(ctx, 'images', 200);

    const body = await req.json().catch(() => ({}));
    const propertyId = String(body.propertyId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(propertyId)) {
      throw new HttpError(400, 'Nieprawidłowy identyfikator nieruchomości.');
    }

    const incoming = Array.isArray(body.images) ? body.images.slice(0, MAX_PER_CALL) : [];
    if (incoming.length === 0) throw new HttpError(400, 'Brak zdjęć do zaimportowania.');

    // Ogłoszenie musi istnieć — nie tworzymy "osieroconych" plików w Storage.
    const { data: property, error: propErr } = await ctx.db
      .from('properties')
      .select('id, title')
      .eq('id', propertyId)
      .maybeSingle();
    if (propErr) throw new HttpError(500, 'Błąd odczytu nieruchomości.');
    if (!property) throw new HttpError(404, 'Nie znaleziono nieruchomości o podanym ID.');

    let position = Number.isFinite(Number(body.startPosition)) ? Number(body.startPosition) : 0;
    const imported: unknown[] = [];
    const failed: { url: string; reason: string }[] = [];

    for (const item of incoming) {
      const url = String(item?.url ?? '');
      const thumbSource = String(item?.thumbUrl ?? '') || url;

      if (!isAllowedImageUrl(url)) {
        failed.push({ url, reason: 'adres poza dozwolonymi serwerami zdjęć' });
        continue;
      }

      try {
        const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        const main = await download(url);
        const ext = EXT_BY_MIME[main.mime];
        const mainPath = `${propertyId}/${String(position).padStart(3, '0')}-${stamp}.${ext}`;

        const { error: upErr } = await ctx.db.storage
          .from(BUCKET)
          .upload(mainPath, main.bytes, { contentType: main.mime, upsert: true });
        if (upErr) throw new Error(`Storage: ${upErr.message}`);

        // Miniatura — jeżeli ten sam adres, nie dublujemy pliku.
        let thumbPath: string | null = null;
        let thumbPublicUrl: string | null = null;
        if (thumbSource && thumbSource !== url && isAllowedImageUrl(thumbSource)) {
          try {
            const thumb = await download(thumbSource);
            thumbPath = `${propertyId}/${String(position).padStart(3, '0')}-${stamp}-thumb.${
              EXT_BY_MIME[thumb.mime]
            }`;
            const { error: thumbErr } = await ctx.db.storage
              .from(BUCKET)
              .upload(thumbPath, thumb.bytes, { contentType: thumb.mime, upsert: true });
            if (thumbErr) throw new Error(thumbErr.message);
            thumbPublicUrl = ctx.db.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;
          } catch (thumbError) {
            console.warn('miniatura nieudana, używam wersji dużej', thumbError);
            thumbPath = null;
            thumbPublicUrl = null;
          }
        }

        const publicUrl = ctx.db.storage.from(BUCKET).getPublicUrl(mainPath).data.publicUrl;

        const { data: row, error: insErr } = await ctx.db
          .from('property_images')
          .insert({
            property_id: propertyId,
            url: publicUrl,
            thumb_url: thumbPublicUrl ?? publicUrl,
            storage_path: mainPath,
            thumb_path: thumbPath,
            position,
            alt: `${property.title} — zdjęcie ${position + 1}`,
          })
          .select('id, url, thumb_url, position')
          .single();

        if (insErr) {
          // Nie zostawiamy pliku bez rekordu w bazie.
          await ctx.db.storage.from(BUCKET).remove([mainPath, ...(thumbPath ? [thumbPath] : [])]);
          throw new Error(`baza: ${insErr.message}`);
        }

        imported.push(row);
        position += 1;
      } catch (err) {
        failed.push({ url, reason: err instanceof Error ? err.message : 'nieznany błąd' });
      }
    }

    await logUsage(ctx, 'images', {
      propertyId,
      imported: imported.length,
      failed: failed.length,
    });

    return jsonResponse(req, {
      imported: imported.length,
      images: imported,
      failed,
      nextPosition: position,
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status);
    const message = err instanceof Error ? err.message : 'Nieoczekiwany błąd serwera.';
    return errorResponse(req, message, 400, err);
  }
});
