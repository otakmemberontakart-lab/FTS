# Flight Prep / OFP Tool

Tool bikin dispatch package (OFP) buat Infinite Flight / RFS / MSFS. Static site —
nggak butuh server backend. "Database" = file JSON di `/data`, di-fetch langsung
dari browser.

## Struktur

```
/data
  aircraft.json      Data performa pesawat (OEW/MZFW/MTOW/MLW, seats, vref, flap_ladder)
  airports.json      3.987 bandara global (ICAO/IATA/nama/kota/tier/max_runway_ft), dari OurAirports
  pax-rules.json     Matriks load factor per pasangan tier bandara (tunable, terpisah dari kode)
/engine
  route-parser.js       [SELESAI] Parse 2 model input jarak (simple NM / waypoint list)
  airport-resolver.js   [SELESAI] ICAO/IATA/nama kota → data bandara (exact + fuzzy match)
  pax-recommender.js    [SELESAI] Tier bandara pasangan → rekomendasi jumlah pax
  vspeed.js              [SELESAI] V1/VR/V2 dari weight-scaling + runway/flap logic
  calc.js                 [SELESAI] Fuel, W&B, climb/descent — migrasi dari flight-prep-calculator.html lama
/tests
  integration.test.mjs  End-to-end test: semua modul engine dipanggil bareng
/ui
  index.html          [SELESAI — scaffold] Form input, BELUM tersambung ke engine
```

## Status saat ini — SELESAI (v0.2, fully wired)

Semua lapisan (data → engine → UI → OFP renderer) sudah tersambung dan **ditest end-to-end
di browser beneran** (Playwright headless, bukan cuma unit test modul terpisah).

- ✅ `data/airports.json` — 3.987 bandara (filter: scheduled service + ICAO valid),
  tier otomatis (`mega` / `major` / `medium` / `regional`) dari tipe bandara + panjang
  runway terpanjang. **Catatan:** heuristik ini bisa meleset di beberapa kasus (contoh:
  WMKJ Senai kehitung `mega` karena runway panjang, padahal bukan hub besar). Perlu
  file override manual untuk kasus-kasus begini — belum dibuat.
- ✅ `data/aircraft.json` — seed data A320-200, A321-200, B737-800. Termasuk `vref`
  (referensi V1/VR/V2 di 1 titik berat) dan `flap_ladder` (runway length → flap setting).
- ✅ `data/pax-rules.json` — matriks load factor 10 pasangan tier, semua angka bebas
  di-tuning tanpa sentuh kode.
- ✅ `engine/route-parser.js`, `airport-resolver.js`, `pax-recommender.js`, `vspeed.js`,
  `calc.js` — semua pure functions, ditest lewat `tests/integration.test.mjs`.
- ✅ `ui/ofp-template.js` — render hasil `calc.js` jadi dokumen OFP (navy/white print style,
  konsisten sama OFP-NK4521 sebelumnya). Ditest lewat `tests/render.test.mjs` (cek nggak
  ada `undefined`/`NaN` bocor + screenshot visual).
- ✅ `ui/index.html` — form **sudah tersambung penuh**: EXEC button manggil resolver →
  (kalau auto) pax-recommender → calc.js → ofp-template.js, hasil di-render inline di
  halaman yang sama. Ada tombol PRINT/SAVE PDF (pakai `window.print()`, CSS udah di-scope
  biar cuma dokumen OFP yang ke-print, bukan seluruh form).

**Ditest 2 skenario penuh di browser (Playwright, headless Chromium):**
1. WIBB → "Singapore Changi" (fuzzy match nama) · A321-200 · pax auto-recommend ·
   Model 1 (162 NM) → 140 pax, block fuel 3.900–4.000 kg, V1/VR/V2 136/143/149, semua AMAN.
2. KUL (IATA) → WSSS · B737-800 · pax manual 150 · Model 2 (waypoint list, 161 NM) →
   flap FLAPS 1 (disesuaikan runway WMKK 13.530ft), V1/VR/V2 127/132/138.

Nol console error di kedua skenario.

## Keterbatasan yang perlu diketahui

- Tier bandara otomatis (lihat catatan `airports.json` di atas) bisa meleset untuk
  bandara dengan runway panjang tapi bukan hub besar.
- Rekomendasi PAX murni heuristik tier-pasangan, bukan data load factor rute riil
  (tidak ada dataset publik gratis untuk itu).
- V1/VR/V2 hasil weight-scaling dari 1 titik referensi per pesawat — tidak memperhitungkan
  suhu, tekanan, angin, slope runway, atau kondisi runway (basah/kontaminasi).
- Baru 3 tipe pesawat di `aircraft.json` (A320-200, A321-200, B737-800) — gampang ditambah,
  tinggal ikutin format yang ada (termasuk `vref` dan `flap_ladder`).

## Cara jalanin lokal

Fetch JSON butuh HTTP server (nggak bisa langsung buka file:// karena browser blokir
CORS untuk fetch lokal). Dari root folder:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000/ui/index.html
```

Atau `npx serve .` kalau ada Node.

## Deploy ke GitHub Pages

1. Push folder ini ke repo GitHub.
2. Settings → Pages → source: branch `main`, folder `/root` (atau `/docs` kalau mau rename).
3. Set entry point ke `ui/index.html`, atau bikin `index.html` di root yang redirect
   ke `ui/index.html`.

## Next steps (opsional, buat pengembangan lanjut)

1. File override manual buat tier bandara yang heuristiknya meleset (kayak kasus WMKJ).
2. Tambah lebih banyak tipe pesawat ke `aircraft.json` (A330, A350, B777, dst).
3. Deploy ke GitHub Pages (lihat bagian "Deploy" di atas) dan test dari HP/tablet.
4. Kalau mau lebih presisi: tambah input suhu/tekanan buat V-speed, atau field
   kondisi runway (dry/wet/contaminated) ke `vspeed.js`.
5. Halaman "Route" bisa ditambah preview map (pakai lat/lon yang udah ada di
   `airports.json`) — belum ada di scope ini.
