/* ============================================================================
   WIDŻET OPINII GOOGLE
   ---------------------------------------------------------------------------
   Czyta WYŁĄCZNIE tabelę `google_reviews` w Supabase (zwykły fetch/PostgREST,
   tak jak api.js) — nigdy nie odpytuje Google z przeglądarki. Dane w tej
   tabeli odświeża raz dziennie osobna Edge Function (refresh-google-reviews),
   uruchamiana przez harmonogram po stronie Supabase. Dzięki temu liczba
   zapytań do Google Places API nie zależy od liczby odwiedzin strony.

   Zgodność z wymogami atrybucji Google: widżet zawsze pokazuje znak
   "Powered by Google" oraz przycisk prowadzący do pełnych opinii na Google,
   a przy każdej opinii — imię i link do autora (authorAttribution).
   ============================================================================ */

(function () {
  'use strict';

  const CFG = window.WYCENA_CONFIG || {};
  const REST = String(CFG.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1';
  const FALLBACK_REVIEW_URL = 'https://g.page/r/CRISj9t2xrHaEBM/review';

  const GOOGLE_G_ICON =
    '<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">' +
    '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>' +
    '<path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>' +
    '<path fill="#4CAF50" d="M24 44c5.2 0 10.1-2 13.8-5.2l-6.4-5.4C29.3 35.1 26.7 36 24 36c-5.3 0-9.9-3.4-11.5-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"/>' +
    '<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 5l6.4 5.4C41.4 35.9 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"/>' +
    '</svg>';

  const STAR_POINTS =
    '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2';

  let starGradCounter = 0;

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function starsRow(rating, size) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let out = '<span class="gr-stars" role="img" aria-label="Ocena ' + r.toFixed(1) + ' na 5 gwiazdek">';
    for (let i = 0; i < 5; i++) {
      const fill = Math.max(0, Math.min(1, r - i)) * 100;
      const gid = 'grStar' + (starGradCounter++);
      out +=
        '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" class="gr-star">' +
        '<defs><linearGradient id="' + gid + '">' +
        '<stop offset="' + fill + '%" stop-color="currentColor"/>' +
        '<stop offset="' + fill + '%" stop-color="transparent"/>' +
        '</linearGradient></defs>' +
        '<polygon points="' + STAR_POINTS + '" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35"></polygon>' +
        '<polygon points="' + STAR_POINTS + '" fill="url(#' + gid + ')"></polygon>' +
        '</svg>';
    }
    out += '</span>';
    return out;
  }

  function avatar(review) {
    if (review.authorPhotoUrl) {
      return '<img class="gr-avatar" src="' + esc(review.authorPhotoUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    }
    const letter = esc((review.authorName || '?').trim().charAt(0).toUpperCase() || '?');
    return '<span class="gr-avatar gr-avatar-fallback" aria-hidden="true">' + letter + '</span>';
  }

  function reviewCard(review) {
    const nameHtml = review.authorProfileUrl
      ? '<a href="' + esc(review.authorProfileUrl) + '" target="_blank" rel="noopener nofollow">' + esc(review.authorName) + '</a>'
      : esc(review.authorName);
    return (
      '<div class="gr-card">' +
      '<div class="gr-card-head">' +
      avatar(review) +
      '<div>' +
      '<span class="gr-author">' + nameHtml + '</span>' +
      (review.relativeTime ? '<span class="gr-time">' + esc(review.relativeTime) + '</span>' : '') +
      '</div>' +
      '</div>' +
      (review.rating != null ? starsRow(review.rating, 14) : '') +
      (review.text ? '<p class="gr-text">' + esc(review.text) + '</p>' : '') +
      '</div>'
    );
  }

  function renderFallback(container) {
    container.innerHTML =
      '<a class="btn btn-primary google-btn" href="' + FALLBACK_REVIEW_URL + '" target="_blank" rel="noopener">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>' +
      'Zobacz opinie w Google' +
      '</a>';
  }

  function render(container, data) {
    const rating = Number(data.rating) || 0;
    const count = Number(data.user_ratings_total) || 0;
    const reviews = Array.isArray(data.reviews) ? data.reviews.slice(0, 5) : [];
    const mapsUrl = data.maps_uri || FALLBACK_REVIEW_URL;

    if (!count && reviews.length === 0) {
      renderFallback(container);
      return;
    }

    let html = '<div class="gr-summary">';
    html += '<span class="gr-score">' + rating.toFixed(1) + '</span>';
    html += starsRow(rating, 20);
    html += '<span class="gr-count">na podstawie ' + count + ' opinii w Google</span>';
    html += '</div>';

    if (reviews.length) {
      html += '<div class="gr-list">' + reviews.map(reviewCard).join('') + '</div>';
    }

    html += '<div class="gr-footer">';
    html += '<span class="gr-powered">' + GOOGLE_G_ICON + ' Opinie dostarczone przez Google</span>';
    html += '<a class="btn gr-cta" href="' + esc(mapsUrl) + '" target="_blank" rel="noopener">Zobacz wszystkie opinie w Google</a>';
    html += '</div>';

    container.innerHTML = html;
  }

  function init() {
    const container = document.getElementById('googleReviews');
    if (!container) return;

    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
      renderFallback(container);
      return;
    }

    fetch(REST + '/google_reviews?select=rating,user_ratings_total,reviews,maps_uri&id=eq.1', {
      headers: {
        apikey: CFG.supabaseAnonKey,
        Authorization: 'Bearer ' + CFG.supabaseAnonKey,
        Accept: 'application/json',
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) {
          renderFallback(container);
          return;
        }
        render(container, rows[0]);
      })
      .catch(function () {
        renderFallback(container);
      });
  }

  init();
})();
