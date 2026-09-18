# INSTALACJA — krok po kroku

Instrukcja dla modułu nieruchomości strony **Wycena — Beata Adamkiewicz-Dudek**.
Wszystkie komendy PowerShell zostały sprawdzone na tym komputerze
(Windows 11, Python 3.9.7, Supabase CLI 2.117.0).

**Czas:** ok. 40–60 minut przy pierwszym podejściu.
**Koszt:** 0 zł (poza opcjonalnym OpenAI — grosze za ogłoszenie).

---

## Spis kroków

| # | Krok | Czas | Wymaga |
|---|---|---|---|
| 1 | Konto i projekt w Supabase | 10 min | przeglądarka |
| 2 | Utworzenie bazy danych | 3 min | przeglądarka |
| 3 | Konto administratora | 5 min | przeglądarka |
| 4 | Zablokowanie rejestracji | 1 min | przeglądarka |
| 5 | Uzupełnienie `config.js` | 5 min | edytor tekstu |
| 6 | Supabase CLI | 2 min | PowerShell |
| 7 | Sekrety (klucze prywatne) | 5 min | PowerShell |
| 8 | Wdrożenie funkcji serwerowych | 3 min | PowerShell |
| 9 | Test lokalny | 10 min | PowerShell + przeglądarka |
| 10 | Publikacja w internecie | 10 min | GitHub lub FTP |
| 11 | SEO | 5 min | przeglądarka |

Po każdym kroku jest **✅ SPRAWDŹ** — jeśli się nie zgadza, nie idź dalej,
bo błąd będzie trudniejszy do znalezienia później.

---

## KROK 1 — Konto i projekt w Supabase

Supabase to hosting bazy danych i plików. Plan darmowy nie wymaga karty płatniczej.

1. Otwórz **https://supabase.com** → przycisk **Start your project**
   (prawy górny róg).
2. Zaloguj się — najprościej kontem **GitHub** (przyda się w kroku 10).
3. Jeśli to pierwszy raz, Supabase poprosi o utworzenie **organizacji**:
   - *Name*: `Wycena` (dowolne)
   - *Type*: `Personal`
   - *Plan*: **Free**
4. Kliknij **New project** i wypełnij:

   | Pole | Co wpisać |
   |---|---|
   | **Project name** | `wycena-nieruchomosci` |
   | **Database Password** | kliknij *Generate a password* |
   | **Region** | **Central EU (Frankfurt)** |

5. ⚠️ **Zapisz hasło do bazy w menedżerze haseł.** Supabase pokaże je tylko raz.
   (Do tej instrukcji nie jest potrzebne, ale bez niego nie odzyskasz dostępu
   do bazy w przyszłości.)
6. Kliknij **Create new project** i odczekaj ~2 minuty.

### Zapisz sobie trzy wartości

Wejdź w **Project Settings** (ikona zębatki, lewy dolny róg) → **API**
i przepisz do notatnika:

| Nazwa | Wygląda tak | Gdzie to jest |
|---|---|---|
| **Project URL** | `https://abcdefghijkl.supabase.co` | sekcja *Project URL* |
| **anon public** | `eyJhbGciOiJI...` (bardzo długi) | sekcja *Project API keys* |
| **Reference ID** | `abcdefghijkl` (20 znaków) | *Settings → General*, lub środek Project URL |

> **service_role** to czwarty klucz na tej stronie. **Nie kopiuj go nigdzie** —
> nie będzie potrzebny. Supabase sam przekaże go funkcjom serwerowym.

✅ **SPRAWDŹ:** masz zapisane trzy wartości: URL, klucz `anon public`, `Reference ID`.

---

## KROK 2 — Utworzenie bazy danych

1. W Supabase, lewe menu → **SQL Editor**.
2. Kliknij **New query** (lub zakładkę z plusem).
3. Otwórz na komputerze plik `D:\Pulpito\mamastrona\STRONA09\supabase\schema.sql`
   (np. w Notatniku), zaznacz **całość** (`Ctrl+A`), skopiuj (`Ctrl+C`).
4. Wklej do okna SQL Editor (`Ctrl+V`).
5. Kliknij zielony **Run** (albo `Ctrl+Enter`).

Poprawny wynik: na dole pojawia się **`Success. No rows returned`**.

✅ **SPRAWDŹ:**
- Lewe menu → **Table Editor**: na liście są tabele
  `admins`, `api_usage`, `properties`, `property_images`.
- Lewe menu → **Storage**: istnieje bucket **`property-images`**
  z oznaczeniem `Public`.

> Skrypt można uruchamiać wielokrotnie — nie niszczy istniejących danych.

---

## KROK 3 — Konto administratora

To konto będzie służyć do logowania w panelu ogłoszeń. Uwaga: samo utworzenie
konta **nie** daje uprawnień — trzeba jeszcze dopisać je do tabeli `admins`
(punkt 3.3). Tak działa zabezpieczenie panelu.

### 3.1. Utwórz użytkownika

1. Lewe menu → **Authentication** → zakładka **Users**.
2. Przycisk **Add user** → **Create new user**.
3. Wypełnij:
   - **Email address**: Twój adres e-mail
   - **Password**: długie, unikalne hasło (min. 12 znaków) — **zapisz je**
   - ☑️ **Auto Confirm User** — zaznacz! Bez tego trzeba potwierdzać e-mailem.
4. **Create user**.

### 3.2. Skopiuj identyfikator użytkownika

Na liście użytkowników znajdź swój e-mail i skopiuj wartość z kolumny
**UID** (wygląda jak `8f14e45f-ceea-467a-9f4b-2c3d1a5b7e90`).

> Jeśli kolumny UID nie widać: kliknij na wiersz użytkownika — UID jest
> na górze panelu szczegółów, z ikoną kopiowania.

### 3.3. Nadaj uprawnienia

1. Lewe menu → **SQL Editor** → **New query**.
2. Wklej poniższe, podmieniając **oba** miejsca w nawiasach:

```sql
insert into public.admins (user_id, email)
values ('TUTAJ-WKLEJ-UID', 'tutaj@twoj-email.pl')
on conflict (user_id) do nothing;
```

3. **Run**. Wynik: `Success. No rows returned`.

✅ **SPRAWDŹ:** uruchom w SQL Editor:

```sql
select a.email, a.user_id, u.last_sign_in_at
from public.admins a
join auth.users u on u.id = a.user_id;
```

Musi zwrócić **dokładnie jeden wiersz** z Twoim e-mailem.
Jeśli zwraca pusto — UID został wklejony błędnie.

---

## KROK 4 — Zablokowanie rejestracji

Bez tego kroku **każdy** mógłby założyć sobie konto w Twoim projekcie.
Uprawnień do panelu i tak by nie dostał (patrz krok 3), ale po co dawać komuś
możliwość zapełniania bazy kontami.

1. Lewe menu → **Authentication** → **Sign In / Providers**.
2. Sekcja **Email** → rozwiń.
3. **Wyłącz** przełącznik **Allow new users to sign up**.
4. **Save**.

✅ **SPRAWDŹ:** przełącznik *Allow new users to sign up* jest szary/wyłączony.
Nowe konta dodajesz od teraz wyłącznie tak jak w kroku 3.

---

## KROK 5 — Uzupełnienie `config.js`

1. Otwórz `D:\Pulpito\mamastrona\STRONA09\config.js` w edytorze tekstu
   (Notatnik wystarczy, ale lepiej Notepad++ / VS Code).
2. Podmień wartości na swoje:

```js
window.WYCENA_CONFIG = {
  supabaseUrl: 'https://abcdefghijkl.supabase.co',   // ← Project URL z kroku 1
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...', // ← anon public z kroku 1
  siteUrl: 'http://localhost:5500',                  // ← na razie lokalnie!
  business: {
    name: 'Kancelaria Rzeczoznawcy Majątkowego „Wycena" Beata Adamkiewicz-Dudek',
    shortName: 'Wycena — Beata Adamkiewicz-Dudek',
    email: 'kontakt@wycena-adamkiewicz.pl',
    phone: '+48 601 234 567',        // ← PODMIEŃ na prawdziwy numer
    phoneHref: '+48601234567',       // ← ten sam numer bez spacji i myślników
    area: 'Wielkopolska i okolice'
  },
  pageSize: 300
};
```

3. Zapisz plik **w kodowaniu UTF-8** (w Notatniku: *Plik → Zapisz jako →
   Kodowanie: UTF-8*). Inaczej polskie znaki się rozsypią.

> `siteUrl` ustawimy na prawdziwy adres w kroku 10. Teraz `http://localhost:5500`
> pozwoli przetestować wszystko lokalnie.

✅ **SPRAWDŹ:** w pliku nie ma już nigdzie napisów `TWOJ-PROJEKT`
ani `WKLEJ_TUTAJ`.

---

## KROK 6 — Supabase CLI

CLI to program konsolowy, którym wysyła się funkcje serwerowe do Supabase.

### Już jest pobrane

Podczas przygotowywania projektu pobrałem je i sprawdziłem. Leży tutaj:

```
C:\Users\jakub\AppData\Local\supabase-cli\supabase.exe
```

Otwórz **PowerShell** (`Win` → wpisz `powershell` → Enter) i sprawdź:

```powershell
& "$env:LOCALAPPDATA\supabase-cli\supabase.exe" --version
```

Powinno wypisać `2.117.0` (lub nowszy).

### Skrót na potrzeby dalszych komend

W tym samym okienku PowerShell wykonaj (to skraca pisanie):

```powershell
cd D:\Pulpito\mamastrona\STRONA09
$sb = "$env:LOCALAPPDATA\supabase-cli\supabase.exe"
```

> ⚠️ Zmienna `$sb` działa **tylko w tym okienku**. Jeśli je zamkniesz,
> wykonaj te dwie linie ponownie.

### Gdyby trzeba było pobrać CLI od nowa

```powershell
$dest = "$env:LOCALAPPDATA\supabase-cli"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Invoke-WebRequest -Uri 'https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.tar.gz' -OutFile "$env:TEMP\sb.tar.gz"
tar -xzf "$env:TEMP\sb.tar.gz" -C $dest
Remove-Item "$env:TEMP\sb.tar.gz"
```

### Opcjonalnie: dodanie do PATH

Żeby móc pisać po prostu `supabase` zamiast całej ścieżki:

```powershell
[Environment]::SetEnvironmentVariable('Path', $env:Path + ";$env:LOCALAPPDATA\supabase-cli", 'User')
```

Zmiana zadziała **po ponownym otwarciu** PowerShella.

### Logowanie

```powershell
& $sb login
```

Otworzy się przeglądarka z prośbą o autoryzację → **Authorize**.
Wróć do PowerShella — powinno pojawić się `Finished supabase login`.

✅ **SPRAWDŹ:** komenda `& $sb projects list` wypisuje Twój projekt
`wycena-nieruchomosci` wraz z jego `REFERENCE ID`.

---

## KROK 7 — Sekrety (klucze prywatne)

Tu trafiają klucze, których **nie wolno** umieszczać w plikach strony.

### 7.1. Klucz OpenAI (opcjonalnie)

Pomiń ten punkt, jeśli na razie nie chcesz AI — wszystko inne będzie działać.

1. Wejdź na **https://platform.openai.com/api-keys** → **Create new secret key**.
2. Skopiuj klucz (`sk-...`) — pokaże się tylko raz.
3. ⚠️ Ustaw limit wydatków: **Settings → Billing → Limits** → *Budget limit*
   np. **5 USD/mies.** To zabezpieczenie na wypadek pomyłki.
4. Sprawdź nazwę modelu: **https://platform.openai.com/docs/models** —
   czy `gpt-5.5-mini` jest na Twoim koncie dostępny. Jeśli nie, wybierz
   inny mały model i użyj jego nazwy w punkcie 7.2.

### 7.2. Przygotuj plik z sekretami

W PowerShellu:

```powershell
Copy-Item supabase\.env.secrets.example supabase\.env.secrets
notepad supabase\.env.secrets
```

Uzupełnij i zapisz:

```
ALLOWED_ORIGINS=http://localhost:5500
OPENAI_API_KEY=sk-twoj-prawdziwy-klucz
OPENAI_MODEL=gpt-5.5-mini
```

- **Nie chcesz AI?** Usuń dwie linie z `OPENAI_`, zostaw tylko `ALLOWED_ORIGINS`.
- Adres prawdziwej strony dopiszemy w kroku 10.
- Bez ukośnika na końcu adresów, bez spacji po przecinkach.

### 7.3. Wyślij sekrety do Supabase

Podmień `TWOJ_REF` na *Reference ID* z kroku 1:

```powershell
& $sb secrets set --project-ref TWOJ_REF --env-file supabase\.env.secrets
```

✅ **SPRAWDŹ:**

```powershell
& $sb secrets list --project-ref TWOJ_REF
```

Na liście muszą być `ALLOWED_ORIGINS` (i `OPENAI_API_KEY`, jeśli dodany).
Wartości są pokazane jako skróty (hash) — to normalne.

> Plik `supabase\.env.secrets` możesz teraz usunąć — wartości są już
> po stronie Supabase. Jest w `.gitignore`, więc nie trafi do repozytorium,
> ale bezpieczniej go nie trzymać.

---

## KROK 8 — Wdrożenie funkcji serwerowych

```powershell
& $sb functions deploy --project-ref TWOJ_REF --use-api scrape-otodom import-images enhance-text
```

> **Flaga `--use-api` jest ważna.** Bez niej CLI próbuje zbudować funkcje
> lokalnie w Dockerze i zatrzyma się z błędem, jeśli Docker Desktop nie jest
> zainstalowany. Z tą flagą budowanie odbywa się po stronie Supabase.

Poprawny wynik — trzy linie w stylu:

```
Deployed Functions on project abcdefghijkl: scrape-otodom, import-images, enhance-text
```

✅ **SPRAWDŹ:** Supabase → lewe menu **Edge Functions**. Są trzy funkcje,
każda ze statusem **ACTIVE**.

---

## KROK 9 — Test lokalny

Zanim cokolwiek trafi do internetu, sprawdźmy, czy działa.

### 9.1. Uruchom serwer lokalny

Strony trzeba otworzyć przez `http://`, a **nie** dwuklikiem z dysku
(otwarcie jako `file://` blokuje logowanie i wywołania funkcji).

Na tym komputerze jest Python, więc wystarczy:

```powershell
cd D:\Pulpito\mamastrona\STRONA09
python -m http.server 5500
```

Okienko zostanie zajęte i wypisze `Serving HTTP on :: port 5500`.
**Zostaw je otwarte.** Zatrzymanie serwera: `Ctrl+C`.

### 9.2. Sprawdź stronę publiczną

Otwórz w przeglądarce: **http://localhost:5500/nieruchomosci.html**

Oczekiwany widok: nagłówek „Oferta nieruchomości", pasek filtrów i komunikat
**„Brak ofert spełniających kryteria"** — baza jest jeszcze pusta. To poprawny wynik.

❌ Jeśli widzisz „Nie udało się wczytać ofert":
naciśnij `F12` → zakładka **Console** i porównaj komunikat z tabelą na końcu
tego pliku.

### 9.3. Zaloguj się do panelu

Otwórz: **http://localhost:5500/admin.html**

Podaj e-mail i hasło z kroku 3. Powinna pojawić się zakładka **Ogłoszenia**
z informacją `0 ogłoszeń w bazie`.

❌ „To konto nie ma uprawnień administratora" → wróć do kroku 3.3.

### 9.4. Test A: import z Otodom

1. Zakładka **Import z Otodom**.
2. Wklej dowolny link do ogłoszenia, np.:
   `https://www.otodom.pl/pl/oferta/elegancki-lokal-mieszkalny-z-ogrodkiem-schowkiem-miejsce-p-parter-ID4BF0c`
3. Kliknij **Pobierz dane z Otodom**.
4. W czarnym okienku logu powinno pojawić się m.in.:

```
✓ pobrano: Elegancki lokal mieszkalny z ogródkiem...
  typ: Mieszkanie · Sprzedaż · cena: 618 000 zł
  lokalizacja: Jarocin, ul. Księdza Jerzego Popiełuszki
  zdjęć do przeniesienia: 14
```

5. Panel przełączy się na formularz z wypełnionymi polami.
6. Kliknij **Zapisz i opublikuj** (przycisk na dole).
7. Log pokaże `✓ utworzono ogłoszenie`, a potem postęp przenoszenia zdjęć.

⏱️ Przenoszenie 14 zdjęć zajmuje ok. 20–40 sekund. Nie zamykaj strony.

### 9.5. Test B: dodanie ręczne

1. **+ Nowe ogłoszenie**.
2. Wypełnij minimum: **Tytuł**, **Typ nieruchomości**, **Cena**, **Powierzchnia**, **Opis**.
3. Przeciągnij 2–3 zdjęcia na pole uploadu.
4. **Zapisz i opublikuj**.

### 9.6. Sprawdź efekt

Wróć na **http://localhost:5500/nieruchomosci.html** i odśwież (`Ctrl+F5`).

✅ **SPRAWDŹ wszystkie punkty:**
- [ ] Widać karty ogłoszeń ze zdjęciami
- [ ] Licznik pokazuje właściwą liczbę nieruchomości
- [ ] Filtr **Sprzedaż** / **Wynajem** działa
- [ ] Wyszukiwarka reaguje na nazwę miejscowości
- [ ] Kliknięcie karty otwiera podstronę oferty z galerią
- [ ] W galerii działają strzałki i powiększenie po kliknięciu zdjęcia
- [ ] Zwężenie okna przeglądarki do szerokości telefonu nie psuje układu,
      a w nawigacji pojawia się przycisk menu (hamburger)

---

## KROK 10 — Publikacja w internecie

### Wariant A: GitHub Pages (darmowo)

#### 10.1. Utwórz repozytorium

1. **https://github.com/new**
2. *Repository name*: `wycena` (lub inna nazwa)
3. *Public* (GitHub Pages dla prywatnych repo wymaga płatnego planu)
4. **Create repository**

#### 10.2. Wgraj pliki

Najprościej przez przeglądarkę: na stronie repozytorium
**Add file → Upload files**, przeciągnij te pliki i katalogi:

**Niezbędne do działania strony:**

```
index.html          nieruchomosci.html    oferta.html
admin.html          config.js             api.js
theme.css           logo-white.png
robots.txt          sitemap.xml           .gitignore
```

**Warto dołożyć (dokumentacja i kod serwerowy):**

```
README-BACKEND.md   INSTALACJA.md         supabase/  (cały katalog)
```

Potem **Commit changes**.

> **`logo.jpg` i `wiezowce.jpg`** możesz pominąć — sprawdziłem, że żadna
> strona ich nie używa (`index.html` ma wszystkie obrazy wklejone w kodzie
> jako base64). To pliki źródłowe; `wiezowce.jpg` waży 2,3 MB, więc nie ma
> sensu wrzucać go na hosting. Zachowaj je lokalnie.
>
> Katalog `supabase/` nie jest potrzebny do działania strony (to kod
> serwerowy), ale warto go trzymać razem z projektem. Nie zawiera żadnych
> sekretów — plik `.env.secrets` jest wykluczony przez `.gitignore`.

#### 10.3. Włącz GitHub Pages

1. W repozytorium: **Settings** → lewe menu **Pages**.
2. *Source*: **Deploy from a branch**
3. *Branch*: `main`, katalog `/ (root)` → **Save**.
4. Po 1–2 minutach na górze pojawi się adres:
   `https://twoj-login.github.io/wycena/`

#### 10.4. Dopisz prawdziwy adres w trzech miejscach

To najczęstsze źródło błędów po publikacji — **żadnego nie pomiń**.

**a) `config.js`** — zmień `siteUrl` (bez ukośnika na końcu):

```js
siteUrl: 'https://twoj-login.github.io/wycena',
```

**b) `robots.txt` i `sitemap.xml`** — podmień wszystkie wystąpienia
`TWOJADOMENA.pl` na swój adres.

Wgraj poprawione pliki do repozytorium ponownie.

**c) Sekret `ALLOWED_ORIGINS`** — w PowerShellu:

```powershell
cd D:\Pulpito\mamastrona\STRONA09
$sb = "$env:LOCALAPPDATA\supabase-cli\supabase.exe"
& $sb secrets set --project-ref TWOJ_REF ALLOWED_ORIGINS=https://twoj-login.github.io,http://localhost:5500
```

> Podaje się **domenę**, bez ścieżki `/wycena`. Zostawienie
> `http://localhost:5500` pozwala dalej testować lokalnie.

### Wariant B: własna domena / FTP

1. Wgraj te same pliki (bez katalogu `supabase/`) do katalogu głównego
   hostingu — zwykle `public_html` lub `www`.
2. Wykonaj punkt 10.4, wpisując `https://twojadomena.pl`.
3. Upewnij się, że działa **HTTPS** (certyfikat Let's Encrypt — u większości
   hostingów włącza się jednym kliknięciem). Bez HTTPS przeglądarka
   zablokuje logowanie do panelu.

Strona to czysty HTML — nie wymaga PHP, Node.js ani bazy na hostingu.

✅ **SPRAWDŹ:** otwórz `https://twoj-adres/nieruchomosci.html` — widać ogłoszenia.
Następnie `https://twoj-adres/admin.html` — logowanie działa, a import z Otodom
kończy się sukcesem (to weryfikuje `ALLOWED_ORIGINS`).

---

## KROK 11 — SEO

1. **Wygeneruj mapę witryny:** panel → **Narzędzia i SEO** →
   **Wygeneruj i pobierz sitemap.xml**. Podmień plik `sitemap.xml`
   w repozytorium / na serwerze.
   Powtarzaj po dodaniu większej liczby ofert.

2. **Google Search Console** — https://search.google.com/search-console
   - **Dodaj usługę** → *Prefiks adresu URL* → wpisz adres strony
   - potwierdź własność (dla GitHub Pages najprościej metodą pliku HTML
     lub tagu `<meta>` w `index.html`)
   - **Mapy witryny** → wpisz `sitemap.xml` → **Wyślij**

3. **Poproś o zaindeksowanie:** w Search Console wklej w górne pole adres
   `https://twoj-adres/nieruchomosci.html` → **Poproś o zaindeksowanie**.

Pierwsze wyniki w Google pojawiają się zwykle po kilku dniach.

---

## Lista kontrolna po instalacji

- [ ] `schema.sql` wykonany, cztery tabele i bucket istnieją
- [ ] Konto administratora w tabeli `admins`
- [ ] Rejestracja nowych użytkowników **wyłączona**
- [ ] `config.js` uzupełniony (URL, klucz anon, `siteUrl`, **prawdziwy telefon**)
- [ ] Trzy funkcje w stanie ACTIVE
- [ ] `ALLOWED_ORIGINS` zawiera adres opublikowanej strony
- [ ] Limit wydatków ustawiony w OpenAI (jeśli używasz AI)
- [ ] `supabase\.env.secrets` usunięty lub pewnie schowany
- [ ] Testowe ogłoszenie widać na stronie publicznej
- [ ] Strona sprawdzona na telefonie
- [ ] `sitemap.xml` i `robots.txt` z prawdziwym adresem
- [ ] Mapa witryny zgłoszona w Search Console

---

## Najczęstsze błędy

### Strona publiczna

| Komunikat / objaw | Przyczyna | Rozwiązanie |
|---|---|---|
| „Brak konfiguracji Supabase — uzupełnij plik config.js" | `config.js` z placeholderami | Krok 5 |
| „Błąd pobierania danych (401)" | Zły klucz `anon` | Skopiuj ponownie z *Settings → API* |
| „Błąd pobierania danych (404)" | Zły `supabaseUrl` albo nie wykonano `schema.sql` | Kroki 1 i 2 |
| Strona pusta, w konsoli `Failed to load config.js` | Brak `config.js` na serwerze | Wgraj plik |
| Polskie znaki jak `NieruchomoÅci` | `config.js` zapisany w innym kodowaniu | Zapisz jako **UTF-8** |
| Zdjęcia się nie pokazują | Bucket nieustawiony jako publiczny | Uruchom `schema.sql` ponownie |

### Panel administratora

| Komunikat | Przyczyna | Rozwiązanie |
|---|---|---|
| „Nieprawidłowy e-mail lub hasło" | Literówka albo konto niepotwierdzone | Krok 3, zaznacz *Auto Confirm User* |
| „To konto nie ma uprawnień administratora" | Brak wpisu w `admins` | Krok 3.3 |
| „Nie udało się wczytać biblioteki Supabase" | Brak internetu lub blokada skryptów (adblock) | Wyłącz blokowanie dla swojej domeny |
| Logowanie „nie reaguje", otwarto plik dwuklikiem | Strona działa jako `file://` | Uruchom przez `http://` — krok 9.1 |

### Import z Otodom

| Komunikat | Przyczyna | Rozwiązanie |
|---|---|---|
| „Dozwolone są wyłącznie linki z otodom.pl" | Link z innego serwisu | Celowa blokada — wklej link z Otodom |
| „Wklej link do konkretnego ogłoszenia" | Link do listy wyników, nie do oferty | Adres musi zawierać `/oferta/` |
| „To ogłoszenie jest już nieaktywne / wygasłe" | Oferta zdjęta z Otodom | Dodaj ręcznie |
| „Nie znalazłem danych ogłoszenia na stronie" | Otodom zmienił format strony | Wymaga aktualizacji `supabase/functions/_shared/otodom.ts` |
| Błąd CORS w konsoli | Adres strony nie jest w `ALLOWED_ORIGINS` | Punkt 10.4c (pamiętaj: bez `/` na końcu) |
| „Sesja wygasła — zaloguj się ponownie" | Token przedawniony | Wyloguj się i zaloguj |
| „Limit 40 operacji na godzinę…" | Zadziałało zabezpieczenie kosztowe | Odczekaj godzinę |
| „Obróbka AI jest wyłączona" | Brak `OPENAI_API_KEY` | Punkt 7.1 (albo odznacz opcję AI) |
| Błąd o nieznanym modelu | `gpt-5.5-mini` niedostępny na Twoim koncie | `& $sb secrets set --project-ref REF OPENAI_MODEL=inna-nazwa` |

### CLI

| Komunikat | Rozwiązanie |
|---|---|
| `supabase: nie rozpoznano jako polecenie` | Użyj pełnej ścieżki albo ponownie ustaw `$sb` (krok 6) |
| `Cannot connect to the Docker daemon` | Zapomniana flaga **`--use-api`** (krok 8) |
| `Access token not provided` | `& $sb login` |
| `Project not found` | Zły `--project-ref` — sprawdź `& $sb projects list` |

Logi funkcji serwerowych (najlepsze źródło informacji o błędach):
**Supabase → Edge Functions → wybierz funkcję → zakładka Logs**.

---

## Co dalej — zwykła eksploatacja

Dodawanie ogłoszeń nie wymaga już PowerShella ani CLI. Wystarczy wejść na
`https://twoj-adres/admin.html`, zalogować się i dodać ofertę.

Do CLI wracasz tylko wtedy, gdy:
- zmieniasz sekret (`secrets set`),
- wprowadzam poprawki w kodzie funkcji (`functions deploy`).

---

## Usunięcie Supabase CLI

Jeśli po wdrożeniu nie chcesz trzymać na dysku 131 MB narzędzia:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\supabase-cli"
```

Nie wpłynie to na działanie strony — funkcje są już wdrożone na serwerach
Supabase. CLI można w każdej chwili pobrać ponownie (krok 6).
