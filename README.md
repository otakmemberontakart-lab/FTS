# Flight Prep / OFP Tool — v0.5

Tool bikin dispatch package (OFP) buat Infinite Flight / RFS / MSFS. Static site —
nggak butuh server backend. "Database" = file JSON di `/data`, di-fetch langsung
dari browser.

## Struktur

```
/data
  aircraft.json         23 pesawat (9 Airbus + 14 Boeing) — OEW/MZFW/MTOW/MLW, seats,
                         vref (takeoff), vref_land (landing), flap_ladder,
                         approach_speed_schedule. Semua terminologi flap: Flaps 1/2/3/Full
                         (Airbus, generik) atau Flaps N° (Boeing, derajat asli).
  airports.json          3.987 bandara global (ICAO/IATA/nama/kota/tier/max_runway_ft/
                          likely_has_ils), dari OurAirports
  pax-rules.json          Matriks load factor per pasangan tier bandara (tunable)
/engine
  route-parser.js        Model 1 (single NM) + Model 2 (baris tabel terstruktur, BUKAN
                          teks bebas lagi). Terapkan rule ALT: 0/kosong + nama waypoint
                          mengandung "RW" → ground; 0/kosong lainnya → bukan constraint wajib.
  fpl-import.js           Parse file .fpl Infinite Flight asli (Garmin XML schema).
                          Hitung HDG/jarak dari lat/lon, convert elevation meter→feet.
                          Infinite Flight ONLY (RFS/MSFS nggak punya fitur ini).
  airport-resolver.js     ICAO/IATA/nama kota → data bandara (exact + fuzzy match)
  pax-recommender.js      Tier bandara pasangan → rekomendasi jumlah pax
  vspeed.js               V1/VR/V2 takeoff dari weight-scaling + runway/flap logic
  altitude-planner.js     Cruise FL (priority chain) + hitung jarak TOD (aturan 3:1)
  approach-profile.js     Approach detail ILS/Manual, ARM APPR di 10NM (gabung Flaps 2/
                          Gear Down), VAPP eksplisit di semua baris relevan
  climb-profile.js        Climb detail: ROC generik per pita ketinggian (BUKAN rumus
                          Speed×5 — climb beda fisika dari descent), positive rate/gear up,
                          pitch attitude, seatbelt/landing lights timing
  trim.js                 Estimasi trim takeoff (Metode A: reuse load-factor heuristik),
                          format RFS (0.00–1.00) dan Infinite Flight (±100%)
  atc-script.js           Sequence komunikasi ATC Infinite Flight (Ground→Tower→Radar)
  calc.js                 Orchestrator: manggil semua modul di atas jadi satu pipeline
/tests
  integration.test.mjs   End-to-end test semua modul (butuh `npm install` dulu — jsdom
                          dipakai buat polyfill DOMParser waktu test fpl-import.js di Node)
  render.test.mjs         Test ofp-template.js: cek undefined/NaN, generate preview HTML
/ui
  index.html             Form input: Manufacturer→Type cascading dropdown, tabel Model 2,
                          tombol import .fpl, semua toggle (Platform/ATC/FL/Approach)
  ofp-template.js         Render hasil jadi dokumen OFP (Trim, Climb, Approach, ATC, dst)
```

## Cara jalanin lokal

Fetch JSON butuh HTTP server (nggak bisa langsung buka file:// karena browser blokir
CORS untuk fetch lokal):

```bash
python3 -m http.server 8000
# buka http://localhost:8000/ui/index.html
```

## Cara jalanin test

```bash
npm install   # cuma buat jsdom, dev-dependency doang
npm test      # jalanin integration.test.mjs + render.test.mjs
```

## Deploy ke GitHub Pages

1. Push semua isi folder ini ke repo GitHub (public, biar Pages gratis).
2. Settings → Pages → source: branch `main`, folder `/ (root)`.
3. Akses via `https://<username>.github.io/<repo>/ui/index.html`, atau bikin
   `index.html` redirect di root biar URL-nya bersih.

---

## Status — SELESAI, v0.5 (rebuild besar setelah "BRIEF UPDATE DONE")

Semua fitur di bawah udah dibangun, ditest lewat integration test (Node) DAN browser
test beneran (Playwright headless Chromium) — bukan cuma unit test modul terpisah.

### 1. Model 2 — tabel input terstruktur
Ganti dari textarea bebas → tabel dengan box per kolom (Waypoint/HDG/Leg Dist/Alt).
Default 5 baris, tombol "+ Tambah Baris", tombol hapus (✕) per baris, Total Route
Distance live-update. Model 1 (single NM) nggak berubah.

### 2. Semantik ALT
- ALT=0/kosong + nama waypoint mengandung "RW" → **ground** (di runway, wajar nggak
  ada target ALT)
- ALT=0/kosong + nama lain → **bukan constraint wajib** (disesuaikan pas terbang)
- Dikonfirmasi dari data `.fpl` asli: waypoint `RW20R`/`RW11` (type USER WAYPOINT,
  representasi threshold runway) memang selalu nggak punya `<elevation>`, sementara
  fix STAR/SID tanpa constraint (misal `ASUNA`, `SAMKO`) juga nggak punya elevation
  meski bukan RW-named — dua kasus beda makna, sama-sama tervalidasi dari data asli.

### 3. Import dari file `.fpl` (Infinite Flight only)
Tombol cuma muncul kalau platform = Infinite Flight. Parse XML Garmin schema asli:
`identifier`/`type`/`lat`/`lon`/`elevation` (opsional, dalam **meter**). HDG & Leg Dist
dihitung dari lat/lon (haversine + bearing) karena file nggak punya field itu. Elevation
dikonversi meter→feet. Ditest pakai file `.fpl` asli WIMM→WSSS: 16 waypoint, 419 NM,
AKPAG (SID climb restriction) = 30.000ft — semua match.

### 4. Prioritas sumber Cruise Altitude
1. Field "Cruise FL" diisi → pakai itu
2. Kosong + ada data ALT di tabel Model 2 → pakai **ALT tertinggi** di situ
3. Keduanya kosong → sistem rekomendasikan otomatis
TOD selalu dihitung pakai rumus 3:1 di semua kondisi.

### 5. Descent profile lengkap (TOD → landing)
Step-down altitude bertahap dari TOD sampai 10.000ft (bukan cuma 1 angka TOD).
Kolom **V/S = Speed(kt) × 5** (descent idle-thrust natural nyari sudut 3° konstan —
basis fisika yang sama dipakai buat hitung TOD-nya). **ARM APPR** (mode ILS) digabung
di titik 10NM/~3.200ft bareng Flaps 2 + Gear Down (dikonfirmasi dari pengalaman
langsung user main Infinite Flight, bukan di 18NM kayak draft awal). **VAPP selalu
eksplisit** ("VAPP (127 kt)"), nggak pernah cuma label kosong. Seatbelt sign ON di
TOD, Landing lights ON di 10.000ft, Cabin secure di Flaps Full/FAF.

### 6. Climb profile lengkap (liftoff → TOC) — level detail sama kayak descent
**V/S climb TIDAK pakai rumus Speed×5** — itu cuma valid buat descent (sudut konstan).
Climb pakai **tabel ROC generik per pita ketinggian** (menurun seiring naik, karena
climb rate ditentukan excess thrust yang mengecil di udara tipis — fisika beda,
pendekatan beda). Ada **Positive Rate → Gear Up** (event terpisah, bukan jarak NM,
terjadi dalam hitungan detik di ~50ft AGL) dan **pitch attitude** (~15-18° nose up,
SRS target). Baris TOC selalu merujuk ke **cruise FL yang beneran kepake** (dari
altitude plan), bukan label tier generik yang lama.

### 7. Terminologi Flaps — konsisten di takeoff DAN descent/approach
- **Airbus**: Flaps 1 / Flaps 2 / Flaps 3 / Flaps Full (generik, bukan CONF1+F/CONF2/
  CONF3 lagi)
- **Boeing**: Flaps 1° / 5° / 15° / 30° dst (derajat asli + simbol °)
- Berlaku di `vspeed.js` (flap_ladder, takeoff) DAN `approach-profile.js`
  (approach_speed_schedule, descent) — user eksplisit minta dua-duanya disamain.

### 8. Trim takeoff (Metode A)
Reuse V.TRIM heuristik yang udah ada (Load% ÷ 3) — bukan bangun model CG/%MAC baru
(butuh data arm/moment yang nggak kita punya, dan tetap approximation di ujungnya).
Format ganda: **RFS** (0.00–1.00) dan **Infinite Flight** (±100%, asumsi arah nose-up
default karena kita nggak punya data CG buat nentuin arah pasti).

### 9. 23 pesawat (9 Airbus + 14 Boeing) — data riset, bukan tebakan
Semua OEW/MZFW/MTOW/MLW/seats dari riset web (bukan generate dari memori doang).
**777F dikeluarin** dari daftar — itu freighter, nggak punya kursi penumpang, break
asumsi PAX-based di seluruh pipeline `calc.js`.
**UI cascading dropdown**: Manufacturer (Airbus/Boeing) → Aircraft Type ke-filter
otomatis sesuai manufacturer yang dipilih.

### 10. Platform selector + ATC (dari sesi sebelumnya, masih jalan)
Infinite Flight / RFS / MSFS. Toggle "Dengan/Tanpa Instruksi ATC" cuma muncul &
berlaku buat Infinite Flight.

## Bug yang ketemu & diperbaiki selama testing sesi ini (bukan cuma diklaim beres)

1. **V1/VR/V2 salah** — reference weight ke-overwrite jadi MTOW pas generate ulang
   `aircraft.json`, padahal angka V1/VR/V2 buat 3 pesawat lama dikalibrasi di reference
   weight yang lebih rendah (69.000kg buat A321, bukan MTOW 89.000kg). Fix: restore
   reference weight asli buat 3 pesawat lama, biarin 20 pesawat baru pakai MTOW (karena
   emang diriset "at MTOW").
2. **Simbol `⚠` dobel** di baris Tower arrival ATC (dua modul sama-sama nambahin).
3. **`→ 0` dobel** di baris TOC climb profile.
4. **Urutan baris POSITIVE RATE ketuker** — muncul SEBELUM Liftoff di tabel (sorting
   logic salah nge-handle baris event-based yang nggak punya jarak NM).
5. **Band ROC climb kurang granular** — FL200/FL280/FL300 awalnya keluar angka sama
   karena cuma ada 1 band di atas 20.000ft.

## Keterbatasan yang perlu diketahui

- Tier bandara & `likely_has_ils` itu heuristik (dari tier+panjang runway), bukan data
  terkonfirmasi — dataset terbuka yang kita pakai nggak nyediain info ILS per-runway asli.
- Rekomendasi PAX murni heuristik tier-pasangan, bukan data load factor rute riil.
- V1/VR/V2/Vapp/Trim semua hasil weight-scaling dari 1 titik referensi — nggak
  memperhitungkan suhu, tekanan, angin, slope runway, atau CG/%MAC beneran.
- Approach & climb profile itu template generik dari gradient 3° / tabel ROC generik +
  jadwal flap pesawat — bukan approach plate/STAR/climb schedule resmi bandara manapun.
- ATC Communication cuma cakupan overview (kapan kontak fasilitas apa + kesalahan
  umum) — bukan daftar frasa lengkap per fase. Nomor runway di frasa ATC itu placeholder.
- 23 pesawat sekarang (777F dikeluarin) — gampang nambah lagi, tinggal ikutin format
  yang ada di `aircraft.json`.

## Next steps (opsional)

1. File override manual buat tier bandara yang heuristiknya meleset.
2. Input suhu/tekanan/kondisi runway buat V-speed yang lebih presisi.
3. Preview map di halaman Route (lat/lon udah ada di `airports.json`).
4. Model CG/%MAC beneran buat trim (Metode B) — butuh data arm/moment per pesawat.
