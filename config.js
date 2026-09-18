/* ============================================================================
   KONFIGURACJA PUBLICZNA — jedyny plik, który trzeba uzupełnić po stronie
   strony internetowej. Może spokojnie leżeć na GitHub Pages.

   Dlaczego to jest bezpieczne?
   ---------------------------------------------------------------------------
   Klucz `supabaseAnonKey` jest kluczem PUBLICZNYM. Jest z założenia widoczny
   w kodzie strony (tak samo działa np. Firebase). Sam z siebie nie daje
   żadnych uprawnień — o tym, co można zrobić, decydują reguły RLS w bazie
   (plik supabase/schema.sql):
     • odczyt  → wyłącznie ogłoszenia z published = true,
     • zapis   → wyłącznie zalogowany użytkownik z tabeli `admins`.

   Klucze, które NIGDY nie mogą tu trafić (i nie są potrzebne):
     • SUPABASE_SERVICE_ROLE_KEY,
     • OPENAI_API_KEY.
   Oba żyją tylko jako sekrety Edge Functions na serwerze Supabase.
   ============================================================================ */

window.WYCENA_CONFIG = {
  /* --- Supabase: Dashboard -> Project Settings -> API -------------------- */
  supabaseUrl: 'https://crwahhzjcgvrrdfiwrpc.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyd2FoaHpqY2d2cnJkZml3cnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NzY2MTEsImV4cCI6MjEwNTE1MjYxMX0.GeEeG4JcXiPpDbhdF1fCor6NOhHPTcTRAn4f4jagJEQ',

  /* --- Adres strony (bez ukośnika na końcu) — używany w meta tagach,
         danych strukturalnych i mapie witryny. Na GitHub Pages będzie to
         np. 'https://uzytkownik.github.io/nazwa-repo'.                     */
  siteUrl: 'https://www.e-wycena.com.pl',

  /* --- Dane firmy: wchodzą do stopki, przycisków kontaktu i JSON-LD ----- */
  business: {
    name: 'Kancelaria Rzeczoznawcy Majątkowego „Wycena" Beata Adamkiewicz-Dudek',
    shortName: 'Wycena — Beata Adamkiewicz-Dudek',
    email: 'b.dudek@e-wycena.com.pl',
    phone: '+48 603 118 079',
    phoneHref: '+48603118079',
    area: 'Wielkopolska i okolice',
  },

  /* --- Ile ogłoszeń wczytywać na raz (strona filtruje je potem lokalnie,
         co daje natychmiastową reakcję na kliknięcia) --------------------- */
  pageSize: 300,
};
