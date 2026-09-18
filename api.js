/* ============================================================================
   WARSTWA DANYCH dla stron publicznych (nieruchomosci.html, oferta.html).

   Świadomie bez żadnej biblioteki: komunikacja z Supabase odbywa się przez
   zwykłe REST-owe fetch()e (PostgREST). Zero zależności = szybsze ładowanie
   na telefonie i brak ryzyka, że zewnętrzny CDN przestanie działać.

   Panel administratora (admin.html) korzysta z oficjalnego SDK, bo potrzebuje
   logowania i uploadu plików.
   ============================================================================ */

(function () {
  'use strict';

  const CFG = window.WYCENA_CONFIG || {};
  const REST = String(CFG.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1';

  /* --- Kolumny udostępniane publicznie (bez pól technicznych typu `raw`) -- */
  const PUBLIC_COLUMNS = [
    'id', 'slug', 'title', 'transaction_type', 'property_type',
    'price', 'price_unit', 'price_per_m', 'rent', 'price_hidden',
    'location', 'street', 'district', 'city', 'voivodeship', 'lat', 'lng',
    'area', 'rooms', 'bathrooms', 'floor', 'floors_total', 'plot_area', 'year',
    'market', 'heating', 'building_type', 'condition',
    'description', 'features', 'details', 'status', 'featured',
    'meta_title', 'meta_description', 'created_at', 'updated_at',
    'property_images(url,thumb_url,alt,position)',
  ].join(',');

  function isConfigured() {
    return (
      CFG.supabaseUrl &&
      CFG.supabaseAnonKey &&
      !/TWOJ-PROJEKT/.test(CFG.supabaseUrl) &&
      !/WKLEJ_TUTAJ/.test(CFG.supabaseAnonKey)
    );
  }

  async function request(path) {
    if (!isConfigured()) {
      throw new Error(
        'Brak konfiguracji Supabase — uzupełnij plik config.js (supabaseUrl i supabaseAnonKey).'
      );
    }
    const res = await fetch(REST + path, {
      headers: {
        apikey: CFG.supabaseAnonKey,
        Authorization: 'Bearer ' + CFG.supabaseAnonKey,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('Błąd pobierania danych (' + res.status + '). ' + text.slice(0, 200));
    }
    return res.json();
  }

  /* ------------------------------------------------------------------------
     Mapowanie rekordu z bazy (snake_case) na obiekt używany przez frontend
     (camelCase). Dzięki temu widok nie wie nic o strukturze bazy.
     ------------------------------------------------------------------------ */
  function mapRow(row) {
    const images = (row.property_images || [])
      .slice()
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    return {
      id: row.id,
      slug: row.slug,
      title: row.title || '',
      transactionType: row.transaction_type || 'Sprzedaż',
      propertyType: row.property_type || '',
      price: row.price != null ? Number(row.price) : null,
      priceUnit: row.price_unit || '',
      pricePerM: row.price_per_m != null ? Number(row.price_per_m) : null,
      rent: row.rent != null ? Number(row.rent) : null,
      priceHidden: Boolean(row.price_hidden),
      location: row.location || [row.city, row.district].filter(Boolean).join(', '),
      street: row.street || null,
      district: row.district || null,
      city: row.city || null,
      voivodeship: row.voivodeship || null,
      lat: row.lat,
      lng: row.lng,
      area: row.area != null ? Number(row.area) : null,
      rooms: row.rooms != null ? Number(row.rooms) : null,
      bathrooms: row.bathrooms != null ? Number(row.bathrooms) : null,
      floor: row.floor || null,
      floorsTotal: row.floors_total || null,
      plotArea: row.plot_area != null ? Number(row.plot_area) : null,
      year: row.year || null,
      market: row.market || null,
      heating: row.heating || null,
      buildingType: row.building_type || null,
      condition: row.condition || null,
      description: row.description || '',
      features: Array.isArray(row.features) ? row.features : [],
      details: Array.isArray(row.details) ? row.details : [],
      status: row.status || 'Dostępna',
      featured: Boolean(row.featured),
      metaTitle: row.meta_title || null,
      metaDescription: row.meta_description || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      images: images.map((img) => ({
        url: img.url,
        thumbUrl: img.thumb_url || img.url,
        alt: img.alt || row.title || 'Zdjęcie nieruchomości',
      })),
    };
  }

  /** Wszystkie opublikowane ogłoszenia — wyróżnione najpierw. */
  async function loadProperties() {
    const query =
      '/properties?select=' + encodeURIComponent(PUBLIC_COLUMNS) +
      '&published=eq.true' +
      '&order=' + encodeURIComponent('featured.desc,sort_order.desc,created_at.desc') +
      '&property_images.order=' + encodeURIComponent('position.asc') +
      '&limit=' + (CFG.pageSize || 300);
    const rows = await request(query);
    return rows.map(mapRow);
  }

  /** Jedno ogłoszenie po slugu (podstrona oferty). */
  async function loadProperty(slug) {
    const query =
      '/properties?select=' + encodeURIComponent(PUBLIC_COLUMNS) +
      '&published=eq.true' +
      '&slug=eq.' + encodeURIComponent(slug) +
      '&property_images.order=' + encodeURIComponent('position.asc') +
      '&limit=1';
    const rows = await request(query);
    return rows.length ? mapRow(rows[0]) : null;
  }

  /* ------------------------------------------------------------------------
     Pomocniki wyświetlania
     ------------------------------------------------------------------------ */

  /** Ucieczka znaków HTML — WSZYSTKIE dane z bazy przechodzą przez tę funkcję
      przed wstawieniem do innerHTML (ochrona przed XSS). */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const nf = new Intl.NumberFormat('pl-PL');
  const nf2 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });

  function formatPrice(p) {
    if (p.priceHidden || p.price == null) return 'Cena do uzgodnienia';
    return nf.format(Math.round(p.price)) + ' zł' + (p.priceUnit || '');
  }

  function formatNumber(value, fractional) {
    if (value == null) return null;
    return (fractional ? nf2 : nf).format(value);
  }

  /** Dla działek pole `area` oznacza powierzchnię działki. */
  function areaLabel(p) {
    return p.propertyType === 'Działka' ? 'Powierzchnia działki' : 'Powierzchnia';
  }

  function propertyUrl(p) {
    return 'oferta.html?slug=' + encodeURIComponent(p.slug);
  }

  function absoluteUrl(path) {
    const base = String(CFG.siteUrl || '').replace(/\/$/, '');
    return base + '/' + String(path).replace(/^\//, '');
  }

  /** Temat wiadomości dla przycisków kontaktowych. */
  function contactMailto(p) {
    const business = CFG.business || {};
    const subject = p
      ? 'Zapytanie o ofertę: ' + p.title + ' (' + p.slug + ')'
      : 'Zapytanie ze strony';
    const body = p
      ? 'Dzień dobry,\n\nproszę o więcej informacji na temat oferty:\n' +
        p.title + '\n' + absoluteUrl(propertyUrl(p)) + '\n\nZ poważaniem,\n'
      : '';
    return (
      'mailto:' + (business.email || '') +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body)
    );
  }

  window.WycenaAPI = {
    isConfigured,
    loadProperties,
    loadProperty,
    mapRow,
    esc,
    formatPrice,
    formatNumber,
    areaLabel,
    propertyUrl,
    absoluteUrl,
    contactMailto,
    config: CFG,
  };
})();
