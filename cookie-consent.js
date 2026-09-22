/* ============================================================================
   ZGODA NA PLIKI COOKIE — zgodnie z Prawem telekomunikacyjnym (art. 173) oraz
   RODO. Skrypty analityczne/marketingowe (Google Analytics, Microsoft Clarity,
   Meta Pixel) są ładowane WYŁĄCZNIE po uzyskaniu zgody użytkownika. Wybór jest
   zapisywany w pliku cookie na 180 dni, więc nie trzeba go powtarzać na każdej
   podstronie — a użytkownik może go w każdej chwili zmienić przez link
   „Ustawienia cookies” w stopce (window.openCookieSettings).
   ============================================================================ */
(function () {
  'use strict';

  var COOKIE_NAME = 'wycena_cookie_consent';
  var COOKIE_MAX_AGE_DAYS = 180;
  var GA_ID = 'G-BYM8NQE2YF';
  var CLARITY_ID = 'ymfmddr843';
  var FB_PIXEL_ID = '957581970731934';

  /* ---------------- odczyt / zapis zgody ---------------- */

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + date.toUTCString() + '; path=/; SameSite=Lax' + secure;
  }

  function readConsent() {
    var raw = getCookie(COOKIE_NAME);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) { /* nieprawidłowy zapis — poproś o zgodę ponownie */ }
    return null;
  }

  function saveConsent(consent) {
    consent.necessary = true;
    consent.ts = new Date().toISOString();
    setCookie(COOKIE_NAME, JSON.stringify(consent), COOKIE_MAX_AGE_DAYS);
    applyConsent(consent);
  }

  /* ---------------- ładowanie skryptów (dopiero po zgodzie) ---------------- */

  var loadedAnalytics = false;
  var loadedMarketing = false;

  function loadAnalytics() {
    if (loadedAnalytics) return;
    loadedAnalytics = true;

    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  function loadMarketing() {
    if (loadedMarketing) return;
    loadedMarketing = true;

    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', FB_PIXEL_ID);
    window.fbq('track', 'PageView');

    var noscript = document.createElement('noscript');
    var img = document.createElement('img');
    img.height = 1; img.width = 1; img.style.display = 'none';
    img.src = 'https://www.facebook.com/tr?id=' + FB_PIXEL_ID + '&ev=PageView&noscript=1';
    noscript.appendChild(img);
    document.body.appendChild(noscript);
  }

  function applyConsent(consent) {
    if (consent.analytics) loadAnalytics();
    if (consent.marketing) loadMarketing();
  }

  /* ---------------- wygląd banera ---------------- */

  var styleInjected = false;
  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css =
      '#ccBanner{position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
      'background:var(--navy-deepest,#1A2127);color:#fff;' +
      'font-family:"Inter",system-ui,sans-serif;' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.28);' +
      'animation:ccSlideUp .35s ease;}' +
      '@keyframes ccSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}' +
      '#ccBanner .cc-inner{max-width:1180px;margin:0 auto;padding:22px 32px;}' +
      '#ccBanner p{margin:0 0 16px;font-size:.92rem;line-height:1.55;color:rgba(255,255,255,.82);max-width:820px;}' +
      '#ccBanner a{color:var(--blue-light,#4A93CE);text-decoration:underline;}' +
      '#ccBanner .cc-settings{display:none;flex-direction:column;gap:12px;margin:0 0 18px;padding:16px 18px;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:4px;}' +
      '#ccBanner .cc-settings.open{display:flex;}' +
      '#ccBanner .cc-toggle{display:flex;align-items:flex-start;gap:10px;font-size:.88rem;color:rgba(255,255,255,.85);cursor:pointer;}' +
      '#ccBanner .cc-toggle input{margin-top:3px;width:16px;height:16px;flex-shrink:0;accent-color:var(--blue,#196DAD);}' +
      '#ccBanner .cc-toggle input:disabled{opacity:.6;}' +
      '#ccBanner .cc-toggle strong{color:#fff;display:block;}' +
      '#ccBanner .cc-toggle span.desc{display:block;color:rgba(255,255,255,.6);font-size:.82rem;margin-top:2px;}' +
      '#ccBanner .cc-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;}' +
      '#ccBanner .cc-btn{font-family:inherit;font-size:.88rem;font-weight:600;padding:11px 22px;border-radius:4px;' +
      'cursor:pointer;transition:transform .15s ease,background .15s ease;border:1.5px solid transparent;}' +
      '#ccBanner .cc-btn:hover{transform:translateY(-2px);}' +
      '#ccBanner .cc-btn-primary{background:var(--blue,#196DAD);color:#fff;}' +
      '#ccBanner .cc-btn-primary:hover{background:#1c7cc4;}' +
      '#ccBanner .cc-btn-outline{background:transparent;color:#fff;border-color:rgba(255,255,255,.45);}' +
      '#ccBanner .cc-btn-outline:hover{border-color:#fff;background:rgba(255,255,255,.08);}' +
      '#ccBanner .cc-btn-text{background:none;border:none;color:rgba(255,255,255,.75);text-decoration:underline;' +
      'padding:11px 4px;font-size:.88rem;cursor:pointer;}' +
      '#ccBanner .cc-btn-text:hover{color:#fff;}' +
      '@media (max-width:640px){#ccBanner .cc-inner{padding:18px 18px;}#ccBanner .cc-actions{flex-direction:column;align-items:stretch;}' +
      '#ccBanner .cc-btn,#ccBanner .cc-btn-text{width:100%;text-align:center;}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  var bannerEl = null;

  function buildBanner(consent) {
    var wrap = document.createElement('div');
    wrap.id = 'ccBanner';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-label', 'Ustawienia plików cookie');

    var analyticsChecked = consent ? !!consent.analytics : false;
    var marketingChecked = consent ? !!consent.marketing : false;

    wrap.innerHTML =
      '<div class="cc-inner">' +
        '<p>Ta strona używa plików cookie. Niezbędne pliki cookie są zawsze aktywne i pozwalają jej prawidłowo działać. ' +
        'Za Twoją zgodą używamy również cookies analitycznych (Google Analytics, Microsoft Clarity) oraz marketingowych ' +
        '(Meta Pixel), aby lepiej rozumieć ruch na stronie i skuteczność reklam. Możesz zaakceptować wszystkie, odrzucić ' +
        'niekonieczne lub samodzielnie dostosować wybór. Szczegóły znajdziesz w ' +
        '<a href="polityka-prywatnosci.html">Polityce prywatności i plików cookie</a>.</p>' +
        '<div class="cc-settings" id="ccSettings">' +
          '<label class="cc-toggle">' +
            '<input type="checkbox" checked disabled>' +
            '<span><strong>Niezbędne</strong><span class="desc">Wymagane do działania strony. Zawsze aktywne.</span></span>' +
          '</label>' +
          '<label class="cc-toggle">' +
            '<input type="checkbox" id="ccAnalytics"' + (analyticsChecked ? ' checked' : '') + '>' +
            '<span><strong>Analityczne</strong><span class="desc">Google Analytics, Microsoft Clarity — statystyki odwiedzin.</span></span>' +
          '</label>' +
          '<label class="cc-toggle">' +
            '<input type="checkbox" id="ccMarketing"' + (marketingChecked ? ' checked' : '') + '>' +
            '<span><strong>Marketingowe</strong><span class="desc">Meta Pixel — pomiar skuteczności reklam.</span></span>' +
          '</label>' +
          '<div class="cc-actions">' +
            '<button type="button" class="cc-btn cc-btn-primary" id="ccSaveSettings">Zapisz wybór</button>' +
          '</div>' +
        '</div>' +
        '<div class="cc-actions" id="ccMainActions">' +
          '<button type="button" class="cc-btn cc-btn-primary" id="ccAcceptAll">Akceptuj wszystkie</button>' +
          '<button type="button" class="cc-btn cc-btn-outline" id="ccRejectAll">Odrzuć niekonieczne</button>' +
          '<button type="button" class="cc-btn-text" id="ccOpenSettings">Ustawienia</button>' +
        '</div>' +
      '</div>';

    return wrap;
  }

  function removeBanner() {
    if (bannerEl && bannerEl.parentNode) {
      bannerEl.parentNode.removeChild(bannerEl);
    }
    bannerEl = null;
  }

  function showBanner(openSettings) {
    injectStyles();
    removeBanner();
    var consent = readConsent();
    bannerEl = buildBanner(consent);
    document.body.appendChild(bannerEl);

    var settingsPanel = document.getElementById('ccSettings');

    if (openSettings) {
      settingsPanel.classList.add('open');
    }

    document.getElementById('ccOpenSettings').addEventListener('click', function () {
      settingsPanel.classList.toggle('open');
    });

    document.getElementById('ccAcceptAll').addEventListener('click', function () {
      saveConsent({ analytics: true, marketing: true });
      removeBanner();
    });

    document.getElementById('ccRejectAll').addEventListener('click', function () {
      saveConsent({ analytics: false, marketing: false });
      removeBanner();
    });

    document.getElementById('ccSaveSettings').addEventListener('click', function () {
      saveConsent({
        analytics: document.getElementById('ccAnalytics').checked,
        marketing: document.getElementById('ccMarketing').checked
      });
      removeBanner();
    });
  }

  /* ---------------- start ---------------- */

  function init() {
    var consent = readConsent();
    if (consent) {
      applyConsent(consent);
    } else {
      showBanner(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Wywoływane z linku „Ustawienia cookies” w stopce — pozwala w każdej
     chwili zmienić lub wycofać zgodę, tak łatwo jak ją wyrazić. */
  window.openCookieSettings = function () {
    showBanner(true);
  };
})();
