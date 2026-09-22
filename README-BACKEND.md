# Moduł nieruchomości — backend i panel ogłoszeń

Kompletny, darmowy w utrzymaniu system ogłoszeń nieruchomości dla strony
**Wycena — Beata Adamkiewicz-Dudek**: baza danych, zdjęcia, panel
administracyjny, import ogłoszeń z Otodom i obróbka tekstu przez AI.

---

## 1. Co powstało

### Strony (frontend — wrzucasz na hosting / GitHub Pages)

| Plik | Rola |
|---|---|
| `nieruchomosci.html` | Lista ofert. Filtry (sprzedaż/wynajem, typ, miejscowość), wyszukiwarka, sortowanie, zdjęcia, dane strukturalne dla Google. |
| `oferta.html` | Podstrona jednej oferty: `oferta.html?slug=...`. Galeria z powiększaniem, tabela szczegółów, meta tagi i schema.org, podobne oferty. |
| `admin.html` | Panel ogłoszeń: logowanie, lista, dodawanie ręczne, import z Otodom, zdjęcia, SEO, sitemap. |
| `config.js` | **Jedyny plik do uzupełnienia.** Adres projektu Supabase, klucz publiczny, dane kontaktowe. |
| `api.js` | Warstwa danych stron publicznych (czyste `fetch`, bez bibliotek). |
| `google-reviews-widget.js` | Widżet opinii Google na `index.html` i `posrednictwo.html` — czyta wyłącznie tabelę `google_reviews` (cache), patrz sekcja 15. |
| `theme.css` | Wspólny motyw (kolory, nawigacja, przyciski, stopka). |
| `logo-white.png` | Logo wyodrębnione z kodu HTML — patrz punkt 9. |
| `robots.txt`, `sitemap.xml` | SEO. |

### Backend (wgrywasz do Supabase)

| Plik | Rola |
|---|---|
| `supabase/schema.sql` | Tabele, reguły bezpieczeństwa (RLS), bucket na zdjęcia, funkcje pomocnicze. |
| `supabase/functions/scrape-otodom/` | Pobiera i parsuje ogłoszenie z Otodom, opcjonalnie porządkuje tekst przez AI. |
| `supabase/functions/import-images/` | Przenosi zdjęcia z Otodom do Twojego Storage. |
| `supabase/functions/enhance-text/` | Poprawia tekst wpisany ręcznie + generuje meta tagi SEO. |
| `supabase/functions/refresh-google-reviews/` | Raz dziennie pobiera ocenę i opinie z Google Places API (New) i zapisuje je w tabeli `google_reviews`. Patrz sekcja 15. |
| `supabase/functions/_shared/` | Wspólny kod: CORS, autoryzacja, OpenAI, parser Otodom. |

---

## 2. Konto i baza w Supabase (15 minut)

1. Wejdź na [supabase.com](https://supabase.com) → **Start your project** → zaloguj się
   (np. kontem GitHub). Plan **Free** nie wymaga karty.
2. **New project**:
   - *Name*: `wycena-nieruchomosci`
   - *Database Password*: wygeneruj długie hasło i **zapisz je w menedżerze haseł**
   - *Region*: **Frankfurt (eu-central-1)** — najbliżej Polski, najszybsze ładowanie
3. Poczekaj ~2 minuty na utworzenie projektu.
4. Lewe menu → **SQL Editor** → **New query** → wklej **całą** zawartość
   `supabase/schema.sql` → **Run**.
   Powinno pojawić się `Success. No rows returned`.
5. Sprawdź: **Table Editor** → są tabele `properties`, `property_images`,
   `admins`, `api_usage`. **Storage** → jest bucket `property-images`.

---

## 3. Konto administratora

Panel działa tylko dla kont dopisanych do tabeli `admins`. Samo założenie konta
w Supabase nie daje dostępu — to celowe zabezpieczenie.

1. **Authentication** → **Users** → **Add user** → **Create new user**:
   - e-mail: Twój adres
   - hasło: długie i unikalne
   - zaznacz **Auto Confirm User** (inaczej trzeba potwierdzać e-mailem)
2. Skopiuj **User UID** utworzonego konta (kolumna `UID`).
3. **SQL Editor** → nowe zapytanie (podmień UID i e-mail):

```sql
insert into public.admins (user_id, email)
values ('WKLEJ-TUTAJ-USER-UID', 'twoj@email.pl')
on conflict (user_id) do nothing;
```

4. **Zamknij rejestrację dla obcych**: **Authentication** → **Sign In / Providers**
   → **Email** → wyłącz **Allow new users to sign up** → **Save**.
   Od tej pory konta dodajesz tylko Ty, z panelu Supabase.

---

## 4. Funkcje serwerowe (Edge Functions)

Tu dzieje się scraping i rozmowa z OpenAI. Kod działa na serwerach Supabase,
dlatego klucze prywatne nigdy nie trafiają do przeglądarki.

**Pełna procedura krok po kroku (z komendami sprawdzonymi na tym komputerze)
znajduje się w osobnym pliku [`INSTALACJA.md`](INSTALACJA.md), kroki 6–8.**

Skrót:

```powershell
cd D:\Pulpito\mamastrona\STRONA09
$sb = "$env:LOCALAPPDATA\supabase-cli\supabase.exe"   # CLI jest już pobrane

& $sb login
& $sb secrets set --project-ref TWOJ_REF --env-file supabase\.env.secrets
& $sb functions deploy --project-ref TWOJ_REF --use-api scrape-otodom import-images enhance-text
```

Dwie rzeczy, o które łatwo się potknąć:

- **`--use-api`** — bez tej flagi CLI próbuje zbudować funkcje w Dockerze.
  Z nią budowanie odbywa się po stronie Supabase i Docker nie jest potrzebny.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY` Supabase
  ustawia automatycznie — **nie dodawaj ich do sekretów ręcznie**.

---

## 5. Uzupełnienie `config.js`

**Project Settings → API**: skopiuj *Project URL* oraz klucz *anon public*.

```js
window.WYCENA_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',          // klucz PUBLICZNY — może tu być
  siteUrl: 'https://TWOJADOMENA.pl',          // bez / na końcu
  business: {
    name: 'Kancelaria Rzeczoznawcy Majątkowego „Wycena" Beata Adamkiewicz-Dudek',
    shortName: 'Wycena — Beata Adamkiewicz-Dudek',
    email: 'kontakt@wycena-adamkiewicz.pl',
    phone: '+48 600 000 000',                 // ← podmień na prawdziwy numer
    phoneHref: '+48600000000',                // ten sam numer bez spacji
    area: 'Wielkopolska i okolice'
  },
  pageSize: 300
};
```

Numer telefonu warto podmienić także w `index.html` (jest tam
placeholder `+48 000 000 000`).

---

## 6. Publikacja strony

### GitHub Pages (darmowo)

1. Utwórz repozytorium na GitHubie.
2. Wgraj pliki: `index.html`, `nieruchomosci.html`, `oferta.html`, `admin.html`,
   `config.js`, `api.js`, `theme.css`, `logo-white.png`, `robots.txt`,
   `sitemap.xml`, `.gitignore`.
   Pliki `logo.jpg` i `wiezowce.jpg` możesz pominąć — żadna strona ich nie
   używa (`index.html` ma obrazy wklejone jako base64).
   Katalog `supabase/` **nie musi** tam trafiać (to kod serwerowy), ale nie
   zawiera żadnych sekretów, więc nie ma z tym problemu.
3. **Settings → Pages** → *Source*: `Deploy from a branch`, branch `main`, katalog `/`.
4. Po chwili strona działa pod `https://uzytkownik.github.io/nazwa-repo/`.
   Ten adres wpisz do `siteUrl` w `config.js` **oraz** do sekretu `ALLOWED_ORIGINS`.

### Własna domena

Wgraj te same pliki przez FTP do katalogu głównego. Strona to zwykły HTML —
działa na każdym hostingu, nie wymaga PHP ani Node.js.

---

## 7. Jak dodać ogłoszenie

Wejdź na `https://twojadomena.pl/admin.html` i zaloguj się.

### Sposób A — import z Otodom

1. Zakładka **Import z Otodom**.
2. Wklej link, np.
   `https://www.otodom.pl/pl/oferta/elegancki-lokal-mieszkalny-...-ID4BF0c`.
3. Zostaw zaznaczone *Uporządkuj opis (…) przy pomocy AI* (jeśli masz klucz OpenAI).
4. **Pobierz dane z Otodom** — w okienku logu zobaczysz, co zostało odczytane.
5. Formularz wypełni się sam: tytuł, cena, cena za m², metraż, pokoje, piętro,
   rok budowy, lokalizacja, współrzędne, opis, udogodnienia, tabela szczegółów
   oraz kolejka zdjęć.
6. Popraw, co chcesz → **Zapisz i opublikuj**. Zdjęcia przeniosą się
   partiami (widać postęp) do Twojego Storage.

Obsługiwane są mieszkania, domy, działki, lokale, garaże i pokoje —
zarówno sprzedaż, jak i wynajem.

### Sposób B — ręcznie

1. Zakładka **Dodaj / edytuj ręcznie** (lub **+ Nowe ogłoszenie**).
2. Wypełnij tytuł, typ, cenę, lokalizację, parametry i opis.
3. Opcjonalnie **Popraw tekst (AI)** — poprawi styl i ortografię oraz
   zaproponuje meta tagi SEO.
4. Przeciągnij zdjęcia na pole uploadu. Są automatycznie zmniejszane
   (maks. 1600 px) i dostają miniaturę — dzięki temu strona jest szybka
   na telefonie, a darmowy 1 GB miejsca wystarcza na setki ofert.
5. **Zapisz i opublikuj**.

### Wskazówki

- **Szkic**: zapisz bez zaznaczonego *Opublikowane* — ogłoszenie nie będzie
  widoczne na stronie, ale zostanie w bazie.
- **Kolejność zdjęć**: strzałki pod miniaturą. Pierwsze = główne na liście.
- **Sprzedana / Zarezerwowana**: ustaw *Status* — karta dostanie nakładkę
  z informacją, a oferta zostanie oznaczona jako niedostępna także dla Google.
- **Wyróżnione**: przesuwa ofertę na początek listy.

---

## 8. SEO — co jest zrobione, a co zależy od Ciebie

Zrobione automatycznie:

- osobny adres dla każdej oferty (`oferta.html?slug=...`) — możliwy do
  zaindeksowania i wygodny do wysłania klientowi,
- `<title>`, `description`, `canonical` i tagi Open Graph ustawiane z danych oferty,
- dane strukturalne **schema.org**: `RealEstateListing` + `Offer` + `BreadcrumbList`
  na podstronie oferty, `ItemList` na liście — to one dają rozszerzone wyniki w Google,
- `robots.txt` z wykluczonym panelem, `noindex` na `admin.html`,
- karty ofert są prawdziwymi linkami `<a href>` (roboty je odwiedzą),
- oferty nieaktywne raportują `OutOfStock`, a brakujące oferty — `noindex`.

Do zrobienia po wdrożeniu:

1. W `robots.txt` i `sitemap.xml` podmień `TWOJADOMENA.pl` na swój adres.
2. Po dodaniu ofert: **admin.html → Narzędzia i SEO → Wygeneruj i pobierz
   sitemap.xml** → podmień plik w repozytorium. Powtarzaj po większych zmianach.
3. Dodaj stronę do [Google Search Console](https://search.google.com/search-console)
   i zgłoś `sitemap.xml`.

Warto wiedzieć: treść ofert dociąga JavaScript. Google i Bing wykonują JS
i indeksują takie strony poprawnie. Natomiast podglądy linków na
Facebooku/LinkedInie JS-a **nie** wykonują — przy udostępnianiu pokaże się
logo i ogólny opis, a nie zdjęcie konkretnej oferty. Jeśli kiedyś będzie to
istotne, rozwiązaniem jest dostawienie prostego prerenderu (np. darmowy
Cloudflare Worker) — architektura tego nie blokuje.

---

## 9. Optymalizacja, którą przy okazji zrobiłem

Logo było wklejone w każdą stronę dwa razy jako obrazek w base64 (~67 kB za
każdym razem). Zostało zapisane jako `logo-white.png` (50 kB) i jest teraz
wczytywane jako plik — przeglądarka pobiera je **raz** i trzyma w pamięci dla
wszystkich podstron.

Efekt: `nieruchomosci.html` zmalał ze **165 kB do ~35 kB**. Przy wejściu
z telefonu w zasięgu LTE to odczuwalna różnica.

> `index.html` (3,2 MB — głównie zdjęcia w base64) pozostawiłem bez zmian,
> bo nie był przedmiotem zlecenia. Ten sam zabieg dałby tam znacznie większą
> oszczędność — mogę to zrobić, jeśli zechcesz.

---

## 10. Bezpieczeństwo

### Co gdzie leży

| Klucz / dane | Gdzie | Widoczne publicznie? |
|---|---|---|
| `supabaseAnonKey` | `config.js` | **Tak — i tak ma być.** Sam z siebie nie daje uprawnień. |
| `SUPABASE_SERVICE_ROLE_KEY` | sekret Edge Functions | Nie. Nigdy nie opuszcza serwera. |
| `OPENAI_API_KEY` | sekret Edge Functions | Nie. |
| Hasło administratora | Supabase Auth (hash) | Nie. |

Nawet gdyby ktoś pobrał **wszystkie** pliki strony (co na GitHub Pages jest
normalne), nie uzyska nic poza tym, co i tak widzi każdy odwiedzający.

### Warstwy ochrony

1. **RLS (Row Level Security)** — reguły w samej bazie:
   - odczyt: tylko wiersze z `published = true`,
   - zapis/edycja/usuwanie: tylko konto obecne w tabeli `admins`.
   Nie da się tego obejść, podmieniając kod strony — decyzję podejmuje baza.
2. **Podwójna weryfikacja w funkcjach serwerowych** — brama Supabase sprawdza
   token, a kod funkcji dodatkowo weryfikuje wpis w tabeli `admins`.
3. **Ochrona przed SSRF** — funkcje pobierają treść *wyłącznie* z domen
   `otodom.pl`, a zdjęcia tylko z CDN OLX. Podanie innego adresu (np. adresu
   wewnętrznego) kończy się odrzuceniem żądania.
4. **Limity użycia** — maks. 40 importów i 60 zapytań do AI na godzinę na
   konto (tabela `api_usage`). Zabezpieczenie przed przypadkowym
   wyczerpaniem limitów i rachunkiem u OpenAI.
5. **Ochrona przed XSS** — każda wartość z bazy jest przed wyświetleniem
   przepuszczana przez funkcję `esc()`. Opisy z Otodom są dodatkowo
   pozbawiane HTML-a już na serwerze.
6. **Storage** — czytanie publiczne (zdjęcia w ogłoszeniach), zapis i
   usuwanie tylko dla administratora; dozwolone wyłącznie pliki graficzne
   do 10 MB.
7. **CORS** — sekret `ALLOWED_ORIGINS` ogranicza, z jakich stron można
   wywoływać funkcje.

### Co warto zrobić samodzielnie

- Włącz **dwuetapową weryfikację (MFA)** na koncie Supabase i GitHub.
- Trzymaj hasło do panelu w menedżerze haseł.
- W OpenAI ustaw **miesięczny limit wydatków** (*Settings → Limits*) —
  np. 5 USD. To zabezpieczenie na wypadek pomyłki.

---

## 11. Koszty i limity

| Usługa | Plan | Limit | Koszt |
|---|---|---|---|
| Supabase | Free | 500 MB bazy, 1 GB zdjęć, 5 GB transferu/mies., 500 tys. wywołań funkcji | 0 zł |
| GitHub Pages | Free | 1 GB strony, 100 GB transferu/mies. | 0 zł |
| OpenAI | *pay-as-you-go* | — | ~grosze za ogłoszenie |

Realnie: **całość poza AI jest darmowa** i taka pozostanie przy normalnym
ruchu strony kancelarii. Zdjęcia po zmniejszeniu zajmują ~0,3 MB na sztukę,
czyli 1 GB to kilkaset ofert z pełną galerią.

OpenAI to jedyny element płatny — jedno ogłoszenie to jedno krótkie zapytanie
(grosze). **AI jest w pełni opcjonalne**: bez ustawienia `OPENAI_API_KEY`
import z Otodom i dodawanie ręczne działają normalnie, tylko bez
automatycznego wygładzania tekstu. Odznaczenie *„Uporządkuj opis (…) AI"*
też wyłącza tę funkcję dla danego ogłoszenia.

**Ważne o planie Free w Supabase:** projekt bez żadnego ruchu przez 7 dni
zostaje uśpiony (wybudza się jednym kliknięciem w panelu). Odwiedziny strony
liczą się jako ruch, więc przy działającej stronie to nie wystąpi. Jeśli
jednak strona ma miesiącami stać bez odwiedzin — zaglądaj czasem do panelu
Supabase.

---

## 12. Gdy coś nie działa

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| „Brak konfiguracji Supabase" | Niewypełniony `config.js` (`supabaseUrl`, `supabaseAnonKey`). |
| „To konto nie ma uprawnień administratora" | Brak wpisu w tabeli `admins` — patrz punkt 3. |
| Lista ofert pusta, choć ogłoszenia są | Nie są *opublikowane*. Zaznacz *Opublikowane* albo kliknij **Publikuj** na liście. |
| „Nie znalazłem danych ogłoszenia na stronie" | Link nie prowadzi do oferty, ogłoszenie wygasło, albo Otodom zmienił format strony (wtedy trzeba zaktualizować `_shared/otodom.ts`). |
| „Dozwolone są wyłącznie linki z otodom.pl" | Wklejony adres z innego serwisu (celowa blokada). |
| „Obróbka AI jest wyłączona" | Brak sekretu `OPENAI_API_KEY`. Import działa dalej — bez AI. |
| Błąd OpenAI o nieznanym modelu | Nazwa modelu niedostępna na Twoim koncie. Sprawdź listę modeli w panelu OpenAI i ustaw `supabase secrets set OPENAI_MODEL=...`. Kod nie wymaga zmian. |
| Zdjęcia z Otodom się nie przeniosły | Log w panelu pokazuje powód dla każdego pliku. Zdjęcia można też dodać ręcznie z dysku. |
| Błąd CORS w konsoli | Adres strony niewpisany do sekretu `ALLOWED_ORIGINS` (pamiętaj: bez `/` na końcu). |
| Funkcja zwraca 401 / „Sesja wygasła" | Wyloguj się i zaloguj ponownie. |

Logi funkcji serwerowych: **Supabase → Edge Functions → wybierz funkcję → Logs**.

---

## 13. Uwagi o imporcie z Otodom

Parser czyta dane z JSON-a, który Otodom sam umieszcza w kodzie strony
(`__NEXT_DATA__`) — jest to znacznie stabilniejsze niż analiza wyglądu strony
i daje gotowe pola: cenę, metraż, pokoje, piętro, rok budowy, współrzędne,
pełną listę zdjęć i słownik parametrów przetłumaczony na polskie etykiety.

Praktyczne zasady:

- Import jest przeznaczony do **przenoszenia własnych ogłoszeń** kancelarii
  (lub takich, do których masz prawa). Opisy i zdjęcia cudzych ofert są
  utworami — przenoszenie ich bez zgody autora jest ryzykowne prawnie.
- Importuj pojedyncze ogłoszenia w miarę potrzeb. Limit 40/godzinę jest z
  dużym zapasem i chroni przed zachowaniem wyglądającym jak masowe pobieranie.
- Ponowny import tego samego ogłoszenia zostanie rozpoznany — panel ostrzeże
  przed utworzeniem duplikatu.
- Jeśli Otodom kiedyś zmieni strukturę danych, import przestanie działać i
  zgłosi zrozumiały błąd. Dodawanie ręczne pozostanie sprawne — nic nie
  zablokuje pracy.

---

## 14. Struktura danych (dla przyszłych zmian)

```
properties                      -- ogłoszenie
  id, slug (adres podstrony)
  title, transaction_type, property_type
  price, price_unit, price_per_m, rent, price_hidden
  location, street, district, city, county, voivodeship, lat, lng
  area, rooms, bathrooms, floor, floors_total, plot_area, year
  market, heating, building_type, condition
  description            -- akapity rozdzielone pustym wierszem
  features  jsonb        -- ["Balkon", "Winda", ...]
  details   jsonb        -- [{ label: "Rynek", value: "Wtórny" }, ...]
  status, published, featured, sort_order
  meta_title, meta_description
  source, source_url, source_id, ai_processed, raw
  created_by, created_at, updated_at

property_images                 -- zdjęcia (kolejność wg `position`)
  id, property_id, url, thumb_url, storage_path, thumb_path, alt, position

admins                          -- kto ma dostęp do panelu
  user_id, email, created_at

api_usage                       -- licznik importów i zapytań do AI
  id, user_id, kind, meta, created_at
```

Nazwy pól w bazie są w `snake_case`, a frontend używa `camelCase` —
tłumaczenie odbywa się w jednym miejscu: funkcja `mapRow()` w `api.js`.
Dodając nową kolumnę, wystarczy dopisać ją tam oraz do listy
`PUBLIC_COLUMNS` w tym samym pliku.

---

## 15. Opinie Google (widżet ocen)

Widżet na `index.html` i `posrednictwo.html` pokazuje ocenę, liczbę opinii
i 5 najnowszych opinii z wizytówki Google Firmy. Działa w architekturze
"raz dziennie odśwież w tle, strona tylko czyta cache":

```
Google Places API (New)
        ↑  1× dziennie, wywołanie z harmonogramu
Edge Function „refresh-google-reviews”  (klucz Google — sekret, nigdy w przeglądarce)
        ↓  zapisuje wynik
Tabela public.google_reviews  (1 wiersz — cache)
        ↑  zwykły odczyt REST (klucz anon), przy KAŻDYM wejściu na stronę
google-reviews-widget.js  →  wyświetla ocenę + 5 opinii + przycisk do Google
```

**Strona WWW nigdy nie odpytuje Google.** Niezależnie od tego, ile osób
wejdzie na stronę, do Google Places API idzie dokładnie jedno zapytanie na
dobę (harmonogram) — to gwarantuje, że darmowy limit nie zostanie
przekroczony.

### 15.1 Włącz Places API (New) w Google Cloud

1. [console.cloud.google.com](https://console.cloud.google.com/) → wybierz
   projekt (lub utwórz nowy).
2. **Włącz płatność (Billing)** na koncie — Google wymaga aktywnej karty
   nawet przy korzystaniu wyłącznie z darmowego limitu. Przy 1
   zapytaniu dziennie realny koszt to 0 zł, ale bez włączonego rozliczenia
   API w ogóle nie zadziała.
3. **APIs & Services → Library** → wyszukaj **„Places API (New)”** → **Enable**.
   (To inne API niż stare „Places API” — upewnij się, że włączasz wersję „New”.)
4. **APIs & Services → Credentials → Create credentials → API key.**
5. Od razu ogranicz klucz (**Edit API key**):
   - **API restrictions** → **Restrict key** → zaznacz tylko **Places API (New)**.
   - **Application restrictions** → **IP addresses** — na razie zostaw
     bez ograniczeń (funkcja woła Google z serwerów Supabase o zmiennych
     adresach IP); klucz i tak nigdy nie trafia do przeglądarki.

### 15.2 Znajdź swój Place ID

To **nie jest** to samo, co krótki link `g.page/...` używany dziś do przycisku
„Zobacz opinie”. Znajdź właściwy identyfikator:

1. Wejdź na [developers.google.com/maps/documentation/places/web-service/place-id](https://developers.google.com/maps/documentation/places/web-service/place-id)
   → widget **„Place ID Finder”** na dole strony.
2. Wpisz nazwę i miejscowość kancelarii (np. „Kancelaria Rzeczoznawcy
   Majątkowego Wycena Beata Adamkiewicz-Dudek, Jarocin”), kliknij właściwy
   wynik na mapie.
3. Skopiuj **Place ID** (zaczyna się zwykle od `ChIJ...`).

### 15.3 Ustaw sekrety w Supabase

Dopisz do `supabase\.env.secrets` (na podstawie `.env.secrets.example`):

```
GOOGLE_PLACES_API_KEY=klucz-z-kroku-15.1
GOOGLE_PLACE_ID=identyfikator-z-kroku-15.2
CRON_SECRET=dowolny-dlugi-losowy-ciag-znakow
```

`CRON_SECRET` możesz wygenerować dowolnie, np. w PowerShell:

```powershell
[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()
```

Wyślij sekrety i wdróż funkcję (dopisz ją do istniejącej komendy z sekcji 4):

```powershell
cd D:\Pulpito\mamastrona\STRONA09
$sb = "$env:LOCALAPPDATA\supabase-cli\supabase.exe"

& $sb secrets set --project-ref TWOJ_REF --env-file supabase\.env.secrets
& $sb functions deploy --project-ref TWOJ_REF --use-api refresh-google-reviews
```

### 15.4 Utwórz tabelę cache

Jeśli już uruchamiałeś `supabase/schema.sql` wcześniej — uruchom go
**ponownie w całości** (SQL Editor → wklej → Run). Skrypt jest idempotentny
i doda tylko nową tabelę `google_reviews` (sekcja 11 pliku), nie ruszając
reszty danych.

### 15.5 Zaplanuj codzienne odświeżanie (pg_cron)

**SQL Editor → New query** — włącz rozszerzenia i zaplanuj wywołanie funkcji
raz dziennie (podmień `TWOJ-PROJEKT-REF` i `TWOJ_CRON_SECRET` na wartości z
kroku 15.3; adres znajdziesz w **Project Settings → API → Project URL**):

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'refresh-google-reviews-daily',
  '0 3 * * *',  -- codziennie o 03:00 UTC (04:00/05:00 czasu polskiego)
  $$
  select net.http_post(
    url     := 'https://TWOJ-PROJEKT-REF.supabase.co/functions/v1/refresh-google-reviews',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', 'TWOJ_CRON_SECRET'
               ),
    body    := '{}'::jsonb
  );
  $$
);
```

Sprawdź, że zadanie istnieje: `select * from cron.job;`

### 15.6 Pierwsze wywołanie — nie czekaj do jutra

Wywołaj funkcję ręcznie raz, żeby cache wypełnił się od razu (PowerShell):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://TWOJ-PROJEKT-REF.supabase.co/functions/v1/refresh-google-reviews" `
  -Headers @{ "X-Cron-Secret" = "TWOJ_CRON_SECRET" }
```

Odpowiedź `{"ok":true,"rating":...,"reviewCount":...}` oznacza sukces.
Sprawdź też **Table Editor → google_reviews** — powinien pojawić się
1 wiersz. Odśwież `index.html` w przeglądarce — widżet powinien pokazać
prawdziwą ocenę i opinie zamiast zapasowego przycisku.

### 15.7 Zgodność z wymogami Google (atrybucja)

Widżet spełnia wymagania Google dla treści z Places API:

- zawsze pokazuje znak **„Opinie dostarczone przez Google”** z logo Google,
- każda opinia jest podpisana imieniem i nazwiskiem autora z linkiem do
  jego profilu Google (`authorAttribution`), bez zmiany treści opinii,
- zawsze jest widoczny przycisk **„Zobacz wszystkie opinie w Google”**
  prowadzący na pełną wizytówkę,
- cache jest odświeżany co 24h — mieści się w dozwolonym przez Google
  oknie do 30 dni na przechowywanie danych z Places API.

### 15.8 Gdy coś nie działa

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| Widżet pokazuje tylko przycisk „Zobacz opinie w Google” (stary wygląd) | Normalne, dopóki tabela `google_reviews` jest pusta — patrz krok 15.6. |
| Funkcja zwraca 401 „Brak uprawnień” | Nagłówek `X-Cron-Secret` nie zgadza się z sekretem `CRON_SECRET`. |
| Funkcja zwraca 500 „Brak konfiguracji” | Nie ustawiono `GOOGLE_PLACE_ID` lub `GOOGLE_PLACES_API_KEY` — wróć do kroku 15.3. |
| Google Places API zwraca błąd 403 | Nie włączono rozliczenia (Billing) w Google Cloud albo włączono starą wersję „Places API” zamiast „Places API (New)”. |
| `select * from cron.job;` jest puste | Rozszerzenia `pg_cron`/`pg_net` nie zostały włączone, albo zapytanie z kroku 15.5 nie wykonało się — sprawdź komunikat błędu w SQL Editor. |
| Liczba opinii w widżecie różni się od tej na Google Maps | Google Places API zwraca maks. 5 „najbardziej trafnych” opinii (nie wszystkie) — to ograniczenie samego API, nie błąd. |
