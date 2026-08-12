/**
 * climb-profile.js
 * Builds a detailed, distance-staged climb profile from liftoff to TOC —
 * the climb-side mirror of approach-profile.js's descent staging, but
 * using DIFFERENT physics on purpose.
 *
 * Descent V/S uses Speed(kt) x 5 because idle-thrust descent naturally
 * settles near a constant ~3° angle (that's the same assumption baked
 * into altitude-planner.js's distance math). Climb does NOT follow a
 * constant angle — climb rate is thrust-limited and genuinely decreases
 * with altitude as air thins and excess thrust shrinks. So climb V/S here
 * uses a generic decreasing-by-altitude-band table instead of a formula,
 * which is closer to how real climb performance actually behaves (and is
 * the same style of simplification real published "climb schedules" use).
 *
 * Distance checkpoints reuse the SAME 3:1 gradient distances computed for
 * TOC in altitude-planner.js, so the final row always lands exactly on
 * `climbDistanceNm` and the ACTUAL cruise FL — not a generic label.
 */

const GRADIENT_FT_PER_NM = 318;

// Generic ROC bands — decreasing with altitude, not tied to a speed formula.
const ROC_BANDS = [
  { minFt: 26000, roc: '+300 to +600' },
  { minFt: 20000, roc: '+600 to +900' },
  { minFt: 14000, roc: '+900 to +1.300' },
  { minFt: 8000,  roc: '+1.300 to +1.700' },
  { minFt: 3000,  roc: '+1.700 to +2.200' },
  { minFt: 0,     roc: '+2.200 to +2.500' }
];
function rocForAlt(altFt) {
  const band = ROC_BANDS.find(b => altFt >= b.minFt);
  return band ? band.roc : ROC_BANDS[ROC_BANDS.length - 1].roc;
}

function altAtDistanceFromDep(distNm, depElevFt) {
  return Math.round(distNm * GRADIENT_FT_PER_NM + depElevFt);
}

/**
 * aircraftData: record from aircraft.json (needs vref.v2 for initial speed reference)
 * depAirport: resolved airport record (needs elev_ft)
 * cruiseFt / climbDistanceNm: from altitude-planner.js's planAltitude() output
 */
export function buildClimbProfile(aircraftData, depAirport, cruiseFt, climbDistanceNm) {
  const depElevFt = depAirport.elev_ft || 0;
  const v2 = aircraftData.vref ? aircraftData.vref.v2 : 150; // fallback if missing

  const rows = [];

  rows.push({
    distanceNm: 0,
    altitudeFt: depElevFt,
    speedKt: `V2+15 ≈ ${v2 + 15} kt`,
    vs: 'rotating',
    action: 'LIFTOFF · Landing lights ON · Seatbelt sign ON · Pitch ~15-18° nose up (SRS target, bervariasi per tipe/berat)'
  });

  rows.push({
    distanceNm: null, // event-based, not distance-based
    distanceLabel: '~50 ft AGL',
    altitudeFt: null,
    speedKt: `V2+10 ≈ ${v2 + 10} kt`,
    vs: '+2.500 to +3.000',
    action: 'POSITIVE RATE → GEAR UP'
  });

  // Flap retraction segment (mirrors the approach schedule in reverse)
  const flapAlt1500 = Math.min(1500 + depElevFt, cruiseFt);
  rows.push({
    distanceNm: Math.round((1500 / GRADIENT_FT_PER_NM) * 10) / 10,
    altitudeFt: flapAlt1500,
    speedKt: '~200 kt',
    vs: rocForAlt(1500),
    action: 'Thrust reduction → CLB · Flaps retract (Full→3→2→1→Clean sesuai speed gate)'
  });

  // Standard 10,000ft checkpoint (only if cruise is above it)
  if (cruiseFt > 10000) {
    const d = Math.round(((10000 - depElevFt) / GRADIENT_FT_PER_NM) * 10) / 10;
    if (d < climbDistanceNm) {
      rows.push({
        distanceNm: d,
        altitudeFt: 10000,
        speedKt: '250 kt',
        vs: rocForAlt(10000),
        action: 'Cross 10.000ft · Seatbelt sign OFF (kalau smooth) · Landing lights OFF'
      });
    }
  }

  // Intermediate step-up bands, mirroring altitude-planner's descent bands
  const bands = [20000, 28000].filter(b => b < cruiseFt);
  for (const b of bands) {
    const d = Math.round(((b - depElevFt) / GRADIENT_FT_PER_NM) * 10) / 10;
    if (d < climbDistanceNm) {
      rows.push({
        distanceNm: d,
        altitudeFt: b,
        speedKt: '300 kt',
        vs: rocForAlt(b),
        action: b >= 28000 ? 'Transisi IAS → Mach' : 'Lanjut naik, thrust margin berkurang'
      });
    }
  }

  rows.push({
    distanceNm: climbDistanceNm,
    altitudeFt: cruiseFt,
    speedKt: `M${aircraftData.cruise_mach || 0.78}`,
    vs: rocForAlt(cruiseFt) + ' → 0 (level off)',
    action: `TOC — level off, mulai cruise FL${Math.round(cruiseFt / 100)}`
  });

  // sort by distance (event-based "positive rate" row sits just after
  // liftoff at distance 0, before the next real distance checkpoint)
  rows.sort((a, b) => {
    const da = a.distanceNm === null ? 0.001 : a.distanceNm;
    const db = b.distanceNm === null ? 0.001 : b.distanceNm;
    return da - db;
  });

  return {
    rows,
    disclaimer: 'ROC (V/S) climb pakai tabel generik per pita ketinggian — BUKAN rumus Speed×5 seperti descent. Climb rate ditentukan excess thrust (menurun seiring ketinggian), bukan sudut konstan, jadi butuh pendekatan beda dari descent.'
  };
}
