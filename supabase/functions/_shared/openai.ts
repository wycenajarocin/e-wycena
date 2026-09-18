// ============================================================================
//  OpenAI — porządkowanie opisów ogłoszeń i generowanie meta tagów SEO.
//
//  Klucz API żyje WYŁĄCZNIE w sekrecie Edge Function (OPENAI_API_KEY),
//  nigdy w plikach strony.
//
//  Model ustawia sekret OPENAI_MODEL (domyślnie 'gpt-5.5-mini'). Jeżeli
//  w Twoim koncie OpenAI dostępna jest inna nazwa modelu — wystarczy zmienić
//  ten jeden sekret, kod nie wymaga modyfikacji.
//
//  AI jest OPCJONALNE: gdy OPENAI_API_KEY nie jest ustawiony, import z Otodom
//  działa dalej — tylko bez dodatkowego "wygładzania" tekstu.
// ============================================================================

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.5-mini';
const MAX_INPUT_CHARS = 9000; // twardy limit kosztu jednego wywołania

export function aiEnabled(): boolean {
  return Boolean(Deno.env.get('OPENAI_API_KEY'));
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Wywołanie modelu z wymuszonym JSON-em na wyjściu.
 * Obsługuje różnice w nazwach parametrów między generacjami modeli OpenAI
 * (max_tokens vs max_completion_tokens) — przy błędzie 400 ponawia raz
 * z alternatywną nazwą, zamiast wywalać cały import.
 */
async function chatJson(messages: ChatMessage[], maxTokens = 2000): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY nie jest ustawiony');

  const base: Record<string, unknown> = {
    model: MODEL,
    messages,
    response_format: { type: 'json_object' },
  };

  const attempts: Record<string, unknown>[] = [
    { ...base, max_completion_tokens: maxTokens },
    { ...base, max_tokens: maxTokens },
    { ...base },
  ];

  let lastError = '';
  for (const body of attempts) {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '{}';
      try {
        return JSON.parse(content);
      } catch {
        throw new Error('Model zwrócił odpowiedź, której nie da się sparsować jako JSON.');
      }
    }

    lastError = await res.text();
    // Ponawiamy tylko dla błędów walidacji parametrów; 401/429/500 → koniec.
    if (res.status !== 400) break;
    console.warn('OpenAI 400, próbuję z innym zestawem parametrów:', lastError.slice(0, 300));
  }

  throw new Error(`OpenAI API: ${lastError.slice(0, 400)}`);
}

export interface ListingDraft {
  title: string;
  description: string;
  features: string[];
  propertyType?: string;
  transactionType?: string;
  location?: string;
  area?: number | null;
  rooms?: number | null;
  price?: number | null;
}

export interface PolishedListing {
  title: string;
  description: string;
  features: string[];
  metaTitle: string;
  metaDescription: string;
}

const SYSTEM_PROMPT = `Jesteś redaktorem treści w kancelarii rzeczoznawcy majątkowego.
Porządkujesz opisy ofert nieruchomości. Zasady bezwzględne:

1. NIE WYMYŚLAJ ŻADNYCH FAKTÓW. Używaj tylko informacji z materiału wejściowego.
   Jeśli czegoś nie ma — pomiń, nie zgaduj.
2. Nie zmieniaj liczb: metrażu, ceny, roku budowy, liczby pokoi, pięter.
3. Usuń: dane kontaktowe (telefony, e-maile, nazwy biur, imiona agentów),
   numery ofert, klauzule prawne ("niniejsze ogłoszenie nie stanowi oferty..."),
   wezwania typu "zadzwoń", "zapraszam do kontaktu", hasztagi, emoji,
   KRZYCZĄCE WERSALIKI i ciągi wykrzykników.
4. Popraw literówki, interpunkcję i polską ortografię. Pisz rzeczowo,
   profesjonalnie, w trzeciej osobie. Bez marketingowej przesady.
5. Opis: 2–5 akapitów, akapity rozdzielone dokładnie jednym pustym wierszem
   (znak "\\n\\n"). Bez nagłówków, bez list, bez HTML, bez markdown.
6. Tytuł: zwięzły, do 70 znaków, bez wersalików, bez ceny i bez wykrzykników.
7. features: 4–10 krótkich, rzeczowych haseł (1–3 słowa, pierwsza litera duża),
   np. "Balkon", "Miejsce postojowe", "Klimatyzacja". Tylko cechy potwierdzone
   w materiale. Bez powtórzeń.
8. metaTitle: maks. 60 znaków. metaDescription: 120–155 znaków, jedno zdanie
   zachęcające, zawierające typ nieruchomości, lokalizację i metraż.

Odpowiadasz wyłącznie obiektem JSON o kluczach:
{"title": string, "description": string, "features": string[],
 "metaTitle": string, "metaDescription": string}`;

export async function polishListing(draft: ListingDraft): Promise<PolishedListing> {
  const context = [
    `Typ nieruchomości: ${draft.propertyType ?? '—'}`,
    `Rodzaj transakcji: ${draft.transactionType ?? '—'}`,
    `Lokalizacja: ${draft.location ?? '—'}`,
    `Powierzchnia: ${draft.area ?? '—'} m2`,
    `Liczba pokoi: ${draft.rooms ?? '—'}`,
    `Cena: ${draft.price ?? '—'} zł`,
    `Cechy wykryte w danych: ${(draft.features ?? []).join(', ') || '—'}`,
    '',
    `Tytuł oryginalny: ${draft.title ?? ''}`,
    '',
    'Opis oryginalny:',
    (draft.description ?? '').slice(0, MAX_INPUT_CHARS),
  ].join('\n');

  const parsed = await chatJson(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
    2500,
  );

  const asString = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;

  const features = Array.isArray(parsed.features)
    ? parsed.features
        .filter((f): f is string => typeof f === 'string')
        .map((f) => f.trim())
        .filter(Boolean)
        .slice(0, 12)
    : draft.features ?? [];

  const description = asString(parsed.description, draft.description ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title: asString(parsed.title, draft.title ?? '').slice(0, 140),
    description,
    features: features.length ? features : (draft.features ?? []),
    metaTitle: asString(parsed.metaTitle, draft.title ?? '').slice(0, 70),
    metaDescription: asString(parsed.metaDescription, '').slice(0, 180),
  };
}
