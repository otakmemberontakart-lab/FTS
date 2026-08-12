# Flight Prep / OFP Tool

Tool bikin dispatch package (OFP) buat Infinite Flight / RFS / MSFS. Static site —
nggak butuh server backend. "Database" = file JSON di `/data`, di-fetch langsung
dari browser.

## Struktur

```
/data
  aircraft.json         Data performa pesawat: OEW/MZFW/MTOW/MLW, seats, vref (takeoff),
                         vref_land (landing), flap_ladder, approach_speed_schedule
  airports.json         3.987 bandara global (ICAO/IATA/nama/kota/tier/max_runway_ft/
                         likely_has_ils), dari OurAirports
  pax-rules.json        Matriks load factor per pasangan tier bandara (tunable, terpisah dari kode)
/engine
  route-parser.js       [SELESAI] Parse 2 model input jarak (simple NM / waypoint list)
  airport-resolver.js   [SELESAI] ICAO/IATA/nama kota → data bandara (exact + fuzzy match)
  pax-recommender.js    [SELESAI] Tier bandara pasangan → rekomendasi jumlah pax
  vspeed.js             [SELESAI] V1/VR/V2 takeoff dari weight-scaling + runway/flap logic
  altitude-planner.js   [SELESAI] Rekomendasi/validasi cruise FL + hitung jarak TOD (aturan 3:1)
  approach-profile.js   [SELESAI] Prosedur approach detail bertahap — mode ILS atau Manual/Visual
  atc-script.js         [SELESAI] Sequence komunikasi ATC Infinite Flight (Ground→Tower→Radar)
  calc.js                [SELESAI] Orchestrator: fuel, W&B, V-speed, altitude plan, approach, ATC — semua digabung
/tests
  integration.test.mjs  End-to-end test: semua modul engine dipanggil bareng (8 skenario)
  render.test.mjs        Test ofp-template.js: cek nggak ada undefined/NaN, generate preview HTML
/ui
  index.html            [SELESAI] Form input LENGKAP tersambung ke semua modul engine
  ofp-template.js         [SELESAI] Render hasil jadi dokumen OFP (ILS & Manual mode)
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

## Update terbaru: FL/TOD planning + approach profile detail (ILS/Manual)

- **`altitude-planner.js`** — user bisa isi cruise FL manual (opsional). Kalau kosong,
  sistem rekomendasikan FL tertinggi yang masih realistis buat jarak rute (dites sampai
  FL410). Pakai **aturan 3:1** (3 NM per 1.000 ft — aturan asli yang dipakai pilot buat
  itung TOD, bukan rule buatan sendiri). Output utamanya: **TOD dalam NM sebelum destinasi**
  (persis yang diminta). Kalau user isi FL yang nggak feasible buat jarak segitu (misal
  FL370 buat rute 162 NM), sistem kasih warning + saran FL yang lebih masuk akal — ini
  udah ditest lewat browser beneran, warning-nya muncul.
- **`approach-profile.js`** — dua mode, dipilih manual lewat toggle di UI (bukan
  auto-detect), sesuai yang diminta:
  - **ILS**: localizer/glideslope reference, DA/DH (default CAT I, 200ft), FAF 5NM,
    tabel staged flap/speed/altitude dari 15NM sampai stable gate (1.000ft AFE) dan DA,
    plus catatan missed approach.
  - **Manual/Visual**: staging flap sama (fisik nggak beda), tapi tanpa referensi
    glideslope elektronik, stabilization gate lebih rendah (500ft AFE), dan "visual
    decision point" bukan DA/DH.
  - **PENTING (baca sebelum percaya ini data asli):** dataset OurAirports yang kita pakai
    **TIDAK punya data ILS per-runway beneran** (udah dicek langsung — `navaids.csv` cuma
    NDB/VOR/DME, `runways.csv` cuma dimensi fisik). Field `likely_has_ils` di `airports.json`
    itu **estimasi** dari tier+panjang runway, bukan konfirmasi. Ditampilkan sebagai catatan
    di hasil OFP biar user tau ini estimasi.
  - Semua jarak staging (15/10/7/5 NM) itu **template generik**, bukan prosedur/STAR resmi
    bandara terkait (kita nggak punya data approach plate asli).
- Fuel/cruise distance sekarang dihitung dari climb/TOD distance yang presisi (dari
  `altitude-planner.js`), bukan asumsi tetap per band jarak kayak sebelumnya — jadi lebih
  konsisten secara internal.

## Update terbaru 2: Platform selector (Infinite Flight / RFS / MSFS) + ATC Communication

- **Field baru paling atas form**: pilih platform — Infinite Flight, RFS, atau MSFS.
  RFS dan MSFS: nggak ada perubahan apa-apa, output tetap seperti biasa (fuel/W&B/V-speed/
  approach — semuanya independen dari platform).
- **Kalau pilih Infinite Flight**: muncul toggle tambahan "Dengan/Tanpa Instruksi ATC
  Lengkap" (default: tanpa). Kalau diaktifkan, hasil OFP dapat section baru **ATC
  COMMUNICATION SEQUENCE** — urutan kontak Ground → Tower → Radar buat departure, dan
  Radar → Tower → Ground buat arrival, plus daftar kesalahan umum yang harus dihindari.
- **Sumber data**: dari dokumen `_ATC_Communication_.docx` yang lo lampirkan (halaman
  overview resmi "ATC Communication" Infinite Flight). **Penting**: dokumen itu isinya
  panduan KAPAN kontak fasilitas mana + kesalahan umum — bukan daftar frasa lengkap per
  fase (itu ada di sub-halaman terpisah yang nggak ke-include di file yang dilampirkan).
  Semua teks di `atc-script.js` ditulis ulang pakai kata-kata sendiri (bukan copy-paste
  dari dokumen), karena ini bakal masuk ke repo publik dan itu konten resmi Infinite Flight.
- **Nomor runway** di frasa ATC ("RWY [sesuai assignment ATC]") sengaja nggak diisi angka
  spesifik — kita nggak punya data assignment runway real-time (tergantung angin/ATC pas
  main), jadi diisi placeholder biar nggak ngarang.
- Frasa arrival ke Tower otomatis nyesuain approach mode yang dipilih sebelumnya:
  `"inbound on the ILS..."` kalau mode ILS, `"inbound on the Visual..."` kalau mode Manual.

## Keterbatasan yang perlu diketahui

- Tier bandara otomatis (lihat catatan `airports.json` di atas) bisa meleset untuk
  bandara dengan runway panjang tapi bukan hub besar.
- Rekomendasi PAX murni heuristik tier-pasangan, bukan data load factor rute riil
  (tidak ada dataset publik gratis untuk itu).
- V1/VR/V2 dan Vapp hasil weight-scaling dari 1 titik referensi per pesawat — tidak
  memperhitungkan suhu, tekanan, angin, slope runway, atau kondisi runway (basah/kontaminasi).
- `likely_has_ils` itu estimasi (lihat penjelasan di atas), bukan data ILS terkonfirmasi.
- Approach profile (ILS maupun Manual) itu template generik dari gradient 3° + jadwal
  flap pesawat — bukan approach plate/STAR resmi bandara manapun.
- ATC Communication sequence cuma tersedia buat platform Infinite Flight, berdasarkan
  panduan resmi mereka (dirangkum ulang) — bukan daftar frasa lengkap per fase (cuma
  cakupan overview: kapan kontak fasilitas apa + kesalahan umum). Nomor runway di frasa
  ATC itu placeholder, bukan assignment real.
- Baru 3 tipe pesawat di `aircraft.json` (A320-200, A321-200, B737-800) — gampang ditambah,
  tinggal ikutin format yang ada (`vref`, `vref_land`, `flap_ladder`, `approach_speed_schedule`).

## Cara jalanin lokal

Fetch JSON butuh HTTP server (nggak bisa langsung buka file:// karena browser blokir
CORS untuk fetch lokal). Dari root folder:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000/ui/index.html
```

Atau `npx serve .` kalau ada Node.


## Next steps (opsional, buat pengembangan lanjut)

1. File override manual buat tier bandara yang heuristiknya meleset (kayak kasus WMKJ).
2. Tambah lebih banyak tipe pesawat ke `aircraft.json` (A330, A350, B777, dst).
3. Deploy ke GitHub Pages (lihat bagian "Deploy" di atas) dan test dari HP/tablet.
4. Kalau mau lebih presisi: tambah input suhu/tekanan buat V-speed, atau field
   kondisi runway (dry/wet/contaminated) ke `vspeed.js`.
5. Halaman "Route" bisa ditambah preview map (pakai lat/lon yang udah ada di
   `airports.json`) — belum ada di scope ini.
