// ============================================================================
//  Parser ogłoszeń Otodom.
//
//  Otodom to aplikacja Next.js — cała treść ogłoszenia jest w stronie jako
//  JSON w tagu <script id="__NEXT_DATA__">. Czytamy właśnie ten JSON, a nie
//  HTML: jest odporny na zmiany wyglądu serwisu i zawiera dane już rozbite
//  na pola (cena, metraż, pokoje, współrzędne, pełna lista zdjęć).
//
//  Obsługiwane kategorie: mieszkania, domy, działki, lokale, garaże, pokoje
//  (klucz ad.adCategory = { name: 'FLAT' | 'HOUSE' | 'TERRAIN' | ..., type:
//  'SELL' | 'RENT' }), zarówno sprzedaż, jak i wynajem.
// ============================================================================

// --- Bezpieczeństwo: dozwolone hosty (ochrona przed SSRF) -------------------
const ALLOWED_PAGE_HOSTS = ['www.otodom.pl', 'otodom.pl', 'm.otodom.pl'];
const ALLOWED_IMAGE_HOSTS = [
  'ireland.apollo.olxcdn.com',
  'apollo-ireland.akamaized.net',
  'apollo.olxcdn.com',
];

export function assertOtodomUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('To nie jest poprawny adres URL.');
  }
  if (u.protocol !== 'https:') throw new Error('Adres musi zaczynać się od https://');
  if (!ALLOWED_PAGE_HOSTS.includes(u.hostname.toLowerCase())) {
    throw new Error('Dozwolone są wyłącznie linki z otodom.pl');
  }
  if (!/\/oferta\//.test(u.pathname)) {
    throw new Error('Wklej link do konkretnego ogłoszenia (adres zawiera /oferta/...).');
  }
  return `https://${u.hostname}${u.pathname}`;
}

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// --- Słowniki: klucze techniczne Otodom -> polskie etykiety -----------------
const KEY_LABELS: Record<string, string> = {
  m: 'Powierzchnia',
  terrain_area: 'Powierzchnia działki',
  rooms_num: 'Liczba pokoi',
  bathrooms_num: 'Łazienki',
  floor_no: 'Piętro',
  floors_num: 'Liczba kondygnacji',
  building_floors_num: 'Liczba pięter w budynku',
  build_year: 'Rok budowy',
  building_type: 'Rodzaj zabudowy',
  building_material: 'Materiał budynku',
  building_ownership: 'Forma własności',
  construction_status: 'Stan wykończenia',
  market: 'Rynek',
  heating: 'Ogrzewanie',
  windows_type: 'Okna',
  roofing: 'Pokrycie dachu',
  roof_type: 'Typ dachu',
  garret_type: 'Poddasze',
  rent: 'Czynsz administracyjny',
  deposit: 'Kaucja',
  free_from: 'Dostępne od',
  price_per_m: 'Cena za m²',
  type: 'Typ działki',
  location: 'Położenie',
  fence: 'Ogrodzenie',
  access_types: 'Dojazd',
  vicinity: 'Okolica',
  use_types: 'Przeznaczenie',
  media_types: 'Media',
  security_types: 'Zabezpieczenia',
  equipment_types: 'Wyposażenie',
  extras_types: 'Dodatkowo',
  lift: 'Winda',
  advertiser_type: 'Typ ogłoszeniodawcy',
  dimensions: 'Wymiary działki',
  remote_service: 'Obsługa zdalna',
};

// Wartości enumów: KEY -> { wartość -> etykieta PL }
const VALUE_LABELS: Record<string, Record<string, string>> = {
  market: { primary: 'Pierwotny', secondary: 'Wtórny' },
  building_type: {
    block: 'Blok',
    tenement: 'Kamienica',
    apartment: 'Apartamentowiec',
    house: 'Dom',
    infill: 'Plomba',
    ribbon: 'Szeregowiec',
    loft: 'Loft',
    detached: 'Wolnostojący',
    semi_detached: 'Bliźniak',
    terraced: 'Szeregowy',
    farm: 'Gospodarstwo',
    residence: 'Rezydencja',
    other: 'Inny',
  },
  construction_status: {
    ready_to_use: 'Do zamieszkania',
    to_completion: 'Do wykończenia',
    to_renovation: 'Do remontu',
    open_space: 'Open space',
    closed_open_space: 'Zamknięty open space',
    divided: 'Podzielony',
  },
  floor_no: {
    cellar: 'Suterena',
    ground_floor: 'Parter',
    floor_1: '1',
    floor_2: '2',
    floor_3: '3',
    floor_4: '4',
    floor_5: '5',
    floor_6: '6',
    floor_7: '7',
    floor_8: '8',
    floor_9: '9',
    floor_10: '10',
    floor_higher_10: 'powyżej 10',
    garret: 'Poddasze',
  },
  floors_num: {
    cellar: 'Suterena',
    ground_floor: 'Parterowy',
    floor_1: '1 piętro',
    floor_2: '2 piętra',
    floor_3: '3 piętra',
    garret: 'Z poddaszem',
  },
  heating: {
    urban: 'Miejskie',
    gas: 'Gazowe',
    electrical: 'Elektryczne',
    boiler_room: 'Kotłownia',
    tiled_stove: 'Piece kaflowe',
    biomass: 'Biomasa',
    solar_collector: 'Kolektor słoneczny',
    heat_pump: 'Pompa ciepła',
    other: 'Inne',
  },
  building_ownership: {
    full_ownership: 'Pełna własność',
    limited_ownership: 'Ograniczone prawo rzeczowe',
    co_operative_ownership: 'Spółdzielcze własnościowe',
    co_operative_ownership_with_a_land_and_mortgage_register:
      'Spółdzielcze własnościowe z KW',
    share: 'Udział',
  },
  windows_type: { plastic: 'PVC', wooden: 'Drewniane', aluminium: 'Aluminiowe' },
  building_material: {
    brick: 'Cegła',
    wood: 'Drewno',
    breezeblock: 'Pustak',
    hydroton: 'Keramzyt',
    concrete_plate: 'Płyta betonowa',
    concrete: 'Beton',
    silikat: 'Silikat',
    cellular_concrete: 'Beton komórkowy',
    reinforced_concrete: 'Żelbet',
    other: 'Inny',
  },
  roofing: {
    tile: 'Dachówka',
    ceramic_tile: 'Dachówka ceramiczna',
    concrete_tile: 'Dachówka betonowa',
    sheet_metal: 'Blacha',
    bitumen: 'Gont bitumiczny',
    tar_paper: 'Papa',
    slate: 'Łupek',
    reed: 'Strzecha',
  },
  roof_type: { flat: 'Płaski', diagonal: 'Skośny' },
  garret_type: { usable: 'Użytkowe', unusable: 'Nieużytkowe', nonexistent: 'Brak' },
  type: {
    building: 'Budowlana',
    agricultural: 'Rolna',
    agricultural_building: 'Rolno-budowlana',
    recreational: 'Rekreacyjna',
    industrial: 'Przemysłowa',
    habitat: 'Siedliskowa',
    forest: 'Leśna',
    other: 'Inna',
  },
  location: { city: 'Miasto', suburban: 'Przedmieście', countryside: 'Wieś' },
  access_types: { asphalt: 'Asfaltowy', paved: 'Utwardzony', dirt: 'Gruntowy' },
  vicinity: {
    forest: 'Las',
    lake: 'Jezioro',
    mountains: 'Góry',
    sea: 'Morze',
    open_area: 'Tereny otwarte',
  },
  advertiser_type: {
    agency: 'Biuro nieruchomości',
    private: 'Oferta prywatna',
    developer: 'Deweloper',
    business: 'Firma',
  },
  media_types: {
    internet: 'Internet',
    'cable-television': 'Telewizja kablowa',
    cable_television: 'Telewizja kablowa',
    phone: 'Telefon',
    water: 'Woda',
    gas: 'Gaz',
    electricity: 'Prąd',
    sewage: 'Kanalizacja',
    septic_tank: 'Szambo',
    water_treatment_plant: 'Oczyszczalnia',
  },
  security_types: {
    entryphone: 'Domofon',
    monitoring: 'Monitoring / ochrona',
    closed_area: 'Teren zamknięty',
    alarm: 'System alarmowy',
    anti_burglary_door: 'Drzwi antywłamaniowe',
    anti_burglary_windows: 'Okna antywłamaniowe',
    roller_shutters: 'Rolety antywłamaniowe',
    intercom: 'Domofon',
  },
  equipment_types: {
    furniture: 'Umeblowane',
    washing_machine: 'Pralka',
    dishwasher: 'Zmywarka',
    fridge: 'Lodówka',
    stove: 'Kuchenka',
    oven: 'Piekarnik',
    tv: 'Telewizor',
  },
  extras_types: {
    balcony: 'Balkon',
    garden: 'Ogród',
    terrace: 'Taras',
    lift: 'Winda',
    garage: 'Garaż / miejsce postojowe',
    basement: 'Piwnica',
    two_storey: 'Dwupoziomowe',
    separate_kitchen: 'Oddzielna kuchnia',
    air_conditioning: 'Klimatyzacja',
    usable_room: 'Pomieszczenie użytkowe',
    non_smokers_only: 'Tylko dla niepalących',
    swimming_pool: 'Basen',
    attic: 'Strych',
    fence: 'Ogrodzenie',
    driveway: 'Podjazd',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  FLAT: 'Mieszkanie',
  HOUSE: 'Dom',
  TERRAIN: 'Działka',
  COMMERCIAL_PROPERTY: 'Lokal użytkowy',
  ROOM: 'Pokój',
  GARAGE: 'Garaż',
  INVESTMENT: 'Inwestycja',
  HALL: 'Hala / magazyn',
};

function labelValue(key: string, value: string): string {
  const clean = String(value).replace(/^.*::/, '').trim();
  const dict = VALUE_LABELS[key];
  if (dict && dict[clean]) return dict[clean];
  if (clean === 'y') return 'Tak';
  if (clean === 'n') return 'Nie';
  if (/^floor_\d+$/.test(clean)) return clean.replace('floor_', '');
  // Nieznana wartość -> czytelny zapis zamiast surowego enuma.
  return clean
    .replace(/[_-]+/g, ' ')
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

// --- HTML -> czysty tekst z akapitami --------------------------------------
const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  oacute: 'ó', Oacute: 'Ó', aacute: 'á', eacute: 'é', hellip: '…',
  ndash: '–', mdash: '—', laquo: '«', raquo: '»', sup2: '²', deg: '°',
  bdquo: '„', rdquo: '”', ldquo: '“', lsquo: '‘', rsquo: '’', middot: '·',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z#0-9]+);/g, (m, name) => ENTITIES[name] ?? m);
}

export function htmlToParagraphs(html: string): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|h[1-6]|tr|ul|ol)\s*>/gi, '\n\n')
      .replace(/<\s*li[^>]*>/gi, '\n• ')
      .replace(/<\s*\/\s*li\s*>/gi, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Wynik parsowania -------------------------------------------------------
export interface ScrapedImage {
  url: string;       // duża wersja (galeria)
  thumbUrl: string;  // miniatura (karty listy)
}

export interface ScrapedListing {
  sourceId: string | null;
  sourceUrl: string;
  title: string;
  transactionType: 'Sprzedaż' | 'Wynajem';
  propertyType: string;
  price: number | null;
  priceUnit: string;
  pricePerM: number | null;
  rent: number | null;
  priceHidden: boolean;
  location: string;
  street: string | null;
  district: string | null;
  city: string | null;
  county: string | null;
  voivodeship: string | null;
  lat: number | null;
  lng: number | null;
  area: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  floorsTotal: number | null;
  plotArea: number | null;
  year: number | null;
  market: string | null;
  heating: string | null;
  buildingType: string | null;
  condition: string | null;
  description: string;
  features: string[];
  details: { label: string; value: string }[];
  images: ScrapedImage[];
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Pobiera stronę ogłoszenia i wyciąga obiekt `ad` z __NEXT_DATA__. */
// deno-lint-ignore no-explicit-any
export async function fetchOtodomAd(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pl-PL,pl;q=0.9',
    },
    redirect: 'follow',
  });

  if (res.status === 404) throw new Error('Ogłoszenie nie istnieje lub zostało usunięte (404).');
  if (!res.ok) throw new Error(`Otodom odpowiedział kodem ${res.status}. Spróbuj ponownie za chwilę.`);

  const html = await res.text();
  // Uwaga: tag ma dodatkowe atrybuty (type, crossorigin) — regex musi być luźny.
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(
      'Nie znalazłem danych ogłoszenia na stronie (Otodom mógł zmienić format lub zablokował żądanie).',
    );
  }

  let parsed: Record<string, never>;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error('Dane ogłoszenia są uszkodzone — nie udało się sparsować JSON.');
  }

  // deno-lint-ignore no-explicit-any
  const ad = (parsed as any)?.props?.pageProps?.ad;
  if (!ad) throw new Error('Strona nie zawiera ogłoszenia (sprawdź, czy link prowadzi do oferty).');
  if (ad.shouldShowExpiredAdPage) {
    throw new Error('To ogłoszenie jest już nieaktywne / wygasłe.');
  }
  return ad;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function firstOf(v: unknown): string | null {
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/** Zamienia parametry rozmiaru w URL-u CDN OLX (…/image;s=2048x1536;q=80). */
function resizeCdnUrl(url: string, size: string, quality: number): string {
  if (/\/image;/.test(url)) {
    return url.replace(/\/image;[^/]*$/, `/image;s=${size};q=${quality}`);
  }
  if (/\/image$/.test(url)) return `${url};s=${size};q=${quality}`;
  return url;
}

// deno-lint-ignore no-explicit-any
export function mapOtodomAd(ad: any, sourceUrl: string): ScrapedListing {
  // --- charakterystyki jako mapa key -> value ---
  const chars: Record<string, string> = {};
  const charsLocalized: Record<string, string> = {};
  for (const c of ad.characteristics ?? []) {
    if (!c?.key) continue;
    chars[c.key] = String(c.value ?? '');
    if (c.localizedValue) charsLocalized[c.key] = String(c.localizedValue);
  }

  const target = ad.target ?? {};
  const categoryName = String(ad.adCategory?.name ?? '').toUpperCase();
  const propertyType =
    CATEGORY_LABELS[categoryName] ??
    (target.ProperType
      ? String(target.ProperType).replace(/^\p{Ll}/u, (c: string) => c.toUpperCase())
      : 'Nieruchomość');

  const isRent =
    String(ad.adCategory?.type ?? '').toUpperCase() === 'RENT' ||
    String(target.OfferType ?? '') === 'wynajem';
  const transactionType: 'Sprzedaż' | 'Wynajem' = isRent ? 'Wynajem' : 'Sprzedaż';

  // --- lokalizacja: nazwy z reverseGeocoding mają poprawną pisownię ---
  const geo: Record<string, string> = {};
  for (const loc of ad.location?.reverseGeocoding?.locations ?? []) {
    if (loc?.locationLevel && loc?.name) geo[loc.locationLevel] = String(loc.name);
  }
  const addr = ad.location?.address ?? {};
  const street = addr.street?.name
    ? String(addr.street.name) + (addr.street.number ? ` ${addr.street.number}` : '')
    : null;
  const city = addr.city?.name ?? geo.city_or_village ?? geo.commune ?? null;
  const district = addr.district?.name ?? geo.district ?? null;
  const county = geo.county ?? null;
  const voivodeship = geo.voivodeship ?? null;

  const locationParts = [city, district, street].filter(Boolean) as string[];
  const location = locationParts.length
    ? locationParts.join(', ')
    : [geo.commune, voivodeship].filter(Boolean).join(', ');

  // --- powierzchnie ---
  const areaRaw = num(chars.m) ?? num(target.Area);
  const terrainArea = num(chars.terrain_area) ?? num(target.Terrain_area);
  // Dla działek `m` JEST powierzchnią działki — nie dublujemy jej w plot_area.
  const isPlot = categoryName === 'TERRAIN';
  const area = areaRaw;
  const plotArea = isPlot ? null : terrainArea;

  // --- piętro: 'Parter', '3/5' ---
  const floorsTotal = num(chars.building_floors_num) ?? num(target.Building_floors_num);
  let floor: string | null = null;
  const floorRaw = chars.floor_no ?? firstOf(target.Floor_no);
  if (floorRaw) {
    const floorLabel = labelValue('floor_no', floorRaw);
    floor = floorsTotal ? `${floorLabel}/${floorsTotal}` : floorLabel;
  }

  // --- cechy / udogodnienia ---
  const features: string[] = [];
  const pushFeatures = (key: string, values: unknown) => {
    for (const v of Array.isArray(values) ? values : []) {
      const label = labelValue(key, String(v));
      if (label && !features.includes(label)) features.push(label);
    }
  };
  pushFeatures('extras_types', target.Extras_types);
  pushFeatures('security_types', target.Security_types);
  pushFeatures('equipment_types', target.Equipment_types);
  pushFeatures('media_types', target.Media_types);
  if (chars.lift === 'y' && !features.includes('Winda')) features.push('Winda');

  // --- tabela "Szczegóły" na podstronie oferty ---
  const DETAIL_KEYS = [
    'market', 'building_type', 'construction_status', 'building_ownership',
    'heating', 'windows_type', 'building_material', 'roofing', 'roof_type',
    'garret_type', 'type', 'location', 'fence', 'access_types', 'use_types',
    'floors_num', 'building_floors_num', 'rent', 'deposit', 'free_from',
    'bathrooms_num', 'advertiser_type',
  ];
  const details: { label: string; value: string }[] = [];
  const seenLabels = new Set<string>();
  for (const key of DETAIL_KEYS) {
    const raw = chars[key];
    if (raw === undefined || raw === '') continue;
    const label = KEY_LABELS[key] ?? key;
    if (seenLabels.has(label)) continue;
    let value: string;
    if (key === 'rent' || key === 'deposit') {
      const n = num(raw);
      value = n ? `${new Intl.NumberFormat('pl-PL').format(n)} zł` : charsLocalized[key] ?? raw;
    } else if (key === 'building_floors_num' || key === 'bathrooms_num') {
      value = String(raw);
    } else {
      value = labelValue(key, raw);
    }
    if (!value) continue;
    details.push({ label, value });
    seenLabels.add(label);
  }

  // --- zdjęcia: dwie wersje (galeria + miniatura) ---
  const images: ScrapedImage[] = [];
  for (const img of ad.images ?? []) {
    const src: string | undefined = img?.large ?? img?.medium ?? img?.small ?? img?.thumbnail;
    if (!src || !isAllowedImageUrl(src)) continue;
    images.push({
      url: resizeCdnUrl(src, '1600x1200', 80),
      thumbUrl: resizeCdnUrl(src, '640x480', 72),
    });
  }

  // Uwaga: ad.price to obiekt { type: 'VISIBLE' | ... }, a nie liczba —
  // właściwa kwota jest w characteristics / target.
  const price = num(chars.price) ?? num(target.Price);
  const priceVisibility = String(ad.price?.type ?? 'VISIBLE').toUpperCase();
  const priceHidden =
    price === null ||
    priceVisibility !== 'VISIBLE' ||
    String(target.hidePrice ?? '0') === '1';

  return {
    sourceId: ad.id ? String(ad.id) : null,
    sourceUrl,
    title: String(ad.title ?? '').trim(),
    transactionType,
    propertyType,
    price,
    priceUnit: isRent ? '/mies.' : '',
    pricePerM: num(chars.price_per_m) ?? num(target.Price_per_m),
    rent: num(chars.rent),
    priceHidden,
    location,
    street,
    district,
    city,
    county,
    voivodeship,
    lat: num(ad.location?.coordinates?.latitude),
    lng: num(ad.location?.coordinates?.longitude),
    area,
    rooms: num(chars.rooms_num) ?? num(firstOf(target.Rooms_num)),
    bathrooms: num(chars.bathrooms_num),
    floor,
    floorsTotal,
    plotArea,
    year: num(chars.build_year) ?? num(target.Build_year),
    market: chars.market ? labelValue('market', chars.market) : null,
    heating: chars.heating ? labelValue('heating', chars.heating) : null,
    buildingType: chars.building_type ? labelValue('building_type', chars.building_type) : null,
    condition: chars.construction_status
      ? labelValue('construction_status', chars.construction_status)
      : null,
    description: htmlToParagraphs(String(ad.description ?? '')),
    features,
    details,
    images,
  };
}
