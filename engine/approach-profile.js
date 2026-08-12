/**
 * approach-profile.js
 * Builds the FULL distance-staged descent-to-landing procedure — from TOD
 * all the way to touchdown — for both ILS and Manual/Visual modes. Both
 * modes get the SAME level of completeness (confirmed requirement: full
 * detail regardless of ILS or Manual, not a summary).
 *
 * Two segments, glued into one continuous `rows` array:
 *   1. Upper descent (TOD -> 10,000ft) — same physics/V/S=Speed×5 formula
 *      used everywhere else in this tool for idle-thrust descent (constant
 *      ~3° gradient assumption). Identical for ILS and Manual — the
 *      aircraft doesn't fly differently up here based on approach type.
 *   2. Staged approach (15/10/7/5 NM -> stable gate -> DA/visual point) —
 *      this part DOES differ: ILS gets a real DA/DH and glideslope framing,
 *      Manual gets a lower stabilization gate and a visual decision point.
 *
 * IMPORTANT — read before trusting this for anything real:
 * This is a GENERIC TEMPLATE, not the actual published approach plate/STAR
 * for the airport. Distance points (15/10/7/5 NM, band altitudes) are a
 * reasonable typical pattern, not airport-specific. The "ILS available"
 * flag on the airport record is itself a heuristic (see
 * data/airports.json's likely_has_ils) — free open airport data does not
 * include confirmed real ILS presence.
 */

const GLIDESLOPE_FT_PER_NM = 318; // ~3.0° descent gradient
const STABLE_GATE_ILS_FT = 1000;
const STABLE_GATE_VISUAL_FT = 500;
const STAGE_DISTANCES_NM = [15, 10, 7, 5];

export function computeVapp(aircraftData, landingWeightKg) {
  const ref = aircraftData.vref_land;
  if (!ref) return null;
  const scale = Math.sqrt(landingWeightKg / ref.ref_weight_kg);
  return Math.round(ref.vapp * scale);
}

function altAtDistance(distanceNm, elevFt) {
  return Math.round(distanceNm * GLIDESLOPE_FT_PER_NM + elevFt);
}
function vsFromSpeed(speedKt) {
  return `-${Math.round(speedKt * 5)}`;
}

/**
 * Segment 1 — TOD down to 10,000ft. Identical for ILS and Manual: this is
 * plain idle-thrust descent, no approach-type-specific behavior yet.
 */
function buildUpperDescentRows(cruiseFt, todDistanceNm, elevFt) {
  const rows = [];

  rows.push({
    distanceNm: todDistanceNm,
    altitudeFt: cruiseFt,
    speedKt: 'M.78',
    vs: '-2.000 to -2.500',
    action: 'TOD — mulai turun · Seatbelt sign ON'
  });

  // Intermediate step-down bands, only if cruise is actually above them
  const bands = [28000, 20000].filter(b => b < cruiseFt);
  for (const b of bands) {
    const d = Math.round(((b - elevFt) / GLIDESLOPE_FT_PER_NM) * 10) / 10;
    if (d > 10 && d < todDistanceNm) { // keep it ahead of the 10,000ft/15NM zone
      rows.push({
        distanceNm: d,
        altitudeFt: b,
        speedKt: '300 kt',
        vs: vsFromSpeed(300),
        action: b >= 28000 ? 'Transisi Mach → IAS' : 'Lanjut turun'
      });
    }
  }

  if (cruiseFt > 10000) {
    const d = Math.round(((10000 - elevFt) / GLIDESLOPE_FT_PER_NM) * 10) / 10;
    rows.push({
      distanceNm: d,
      altitudeFt: 10000,
      speedKt: '250 kt',
      vs: vsFromSpeed(250),
      action: 'Cross 10.000ft, decelerate (wajib) · Landing lights ON'
    });
  }

  return rows;
}

/**
 * Segment 2 — staged flap/speed/altitude table, 15NM down to stable gate.
 * ARM APPR is merged into the same row as Flaps 2 + Gear Down (10NM /
 * ~3,200ft) per user's real Infinite Flight experience — ILS mode only,
 * Manual mode has no APPR mode to arm.
 */
function buildStagedRows(aircraftData, elevFt, vapp, mode) {
  const schedule = aircraftData.approach_speed_schedule || [];
  const usableStages = schedule.slice(1); // drop "Clean"/"Flaps Up" entry
  const rows = [];

  STAGE_DISTANCES_NM.forEach((distNm, i) => {
    const stage = usableStages[i] || usableStages[usableStages.length - 1];
    let action;
    if (mode === 'ils') {
      action = i === 1
        ? `ARM APPR (LOC alive) · Select ${stage.stage} · GEAR DOWN · check 3 green`
        : `Select ${stage.stage}`;
    } else {
      action = i === 1
        ? `Select ${stage.stage} · GEAR DOWN · check 3 green (visual — jaga posisi terhadap runway)`
        : `Select ${stage.stage} (visual — no electronic glideslope)`;
    }
    rows.push({
      distanceNm: distNm,
      altitudeFt: altAtDistance(distNm, elevFt),
      speedKt: stage.maxSpeedKt,
      vs: vsFromSpeed(stage.maxSpeedKt),
      action
    });
  });

  const gateFt = mode === 'ils' ? STABLE_GATE_ILS_FT : STABLE_GATE_VISUAL_FT;
  const stableDistNm = Math.round((gateFt / GLIDESLOPE_FT_PER_NM) * 10) / 10;
  rows.push({
    distanceNm: stableDistNm,
    altitudeFt: elevFt + gateFt,
    speedKt: vapp,
    vs: vsFromSpeed(vapp),
    isVapp: true,
    action: mode === 'ils'
      ? `STABLE GATE (${gateFt} ft AFE) — full landing config, VAPP target, "STABLE" call mandatory`
      : `STABLE GATE VISUAL (${gateFt} ft AFE) — full landing config, VAPP target, runway environment harus sudah dalam pandangan`
  });

  return rows;
}

/**
 * ILS mode — full procedure with localizer/glideslope references, FAF,
 * DA/DH, missed approach altitude.
 */
export function buildIlsApproach(aircraftData, arrAirport, landingWeightKg, cruiseFt, todDistanceNm) {
  const vapp = computeVapp(aircraftData, landingWeightKg);
  const elevFt = arrAirport.elev_ft || 0;
  const daFt = elevFt + 200; // CAT I default
  const daDistNm = Math.round((200 / GLIDESLOPE_FT_PER_NM) * 100) / 100;

  const rows = [
    ...buildUpperDescentRows(cruiseFt, todDistanceNm, elevFt),
    ...buildStagedRows(aircraftData, elevFt, vapp, 'ils')
  ];
  rows.push({
    distanceNm: daDistNm,
    altitudeFt: daFt,
    speedKt: vapp,
    vs: vsFromSpeed(vapp),
    isVapp: true,
    action: 'DECISION ALTITUDE (DA) — runway/approach lights in sight → LAND, else IMMEDIATE GO-AROUND'
  });

  return {
    mode: 'ils',
    vapp,
    category: 'CAT I (asumsi default)',
    decisionAltitudeFt: daFt,
    decisionHeightFt: 200,
    fafDistanceNm: 5,
    glideslopeAngleDeg: 3.0,
    stableGateFt: STABLE_GATE_ILS_FT,
    ilsDataQuality: arrAirport.likely_has_ils
      ? 'Bandara ini kemungkinan besar punya ILS (estimasi dari tier + panjang runway — bukan data ILS terkonfirmasi, karena dataset terbuka yang kita pakai tidak menyediakan info ILS per-runway).'
      : '⚠ Bandara ini kemungkinan TIDAK punya ILS (runway pendek / tier kecil). Prosedur ILS di bawah tetap ditampilkan sesuai pilihan lo, tapi pertimbangkan pakai mode Manual kalau di sim beneran nggak ada approach ILS-nya.',
    rows,
    missedApproach: {
      initialAction: 'TOGA thrust, positive rate → gear up, flap retract 1 notch',
      headingNote: 'Ikuti published missed approach / runway heading, climb ke altitude aman (biasanya 3.000–4.000 ft AFE minimum, cek MSA lokal)',
      note: 'Prosedur missed approach spesifik (heading/altitude persis) tergantung chart resmi bandara — di luar scope data yang kita punya.'
    },
    disclaimer: 'Template generik dari gradient 3° + jadwal flap pesawat. Bukan approach plate resmi bandara ini.'
  };
}

/**
 * Manual/visual mode — same upper descent + same flap staging, but framed
 * as visual (no localizer/glideslope electronic guidance), lower
 * stabilization gate, and a visual decision point instead of DA/DH.
 */
export function buildManualApproach(aircraftData, arrAirport, landingWeightKg, cruiseFt, todDistanceNm) {
  const vapp = computeVapp(aircraftData, landingWeightKg);
  const elevFt = arrAirport.elev_ft || 0;

  const rows = [
    ...buildUpperDescentRows(cruiseFt, todDistanceNm, elevFt),
    ...buildStagedRows(aircraftData, elevFt, vapp, 'manual')
  ];

  return {
    mode: 'manual',
    vapp,
    stableGateFt: STABLE_GATE_VISUAL_FT,
    visualDecisionNote: 'Tidak ada DA/DH elektronik. Pilot menentukan sendiri titik "committed to land" — umumnya begitu stabilized di gate visual (500ft AFE) dan runway environment jelas terlihat. Kalau tidak yakin di ketinggian berapa pun → GO-AROUND.',
    rows,
    missedApproach: {
      initialAction: 'TOGA thrust, positive rate → gear up, flap retract 1 notch',
      headingNote: 'Climb straight ahead / runway heading (default aman tanpa published missed approach), koordinasi ATC untuk vector ulang',
      note: 'Karena approach manual/visual, tidak ada missed approach procedure resmi — ini default konservatif, bukan prosedur charted.'
    },
    disclaimer: 'Template generik visual approach dari gradient 3° + jadwal flap pesawat. Bukan prosedur resmi bandara ini — pakai kalau di sim beneran approach-nya visual/non-precision.'
  };
}

/**
 * Dispatcher used by calc.js. Now needs cruiseFt/todDistanceNm from
 * altitude-planner.js's output to build the upper descent segment.
 */
export function buildApproachProfile(mode, aircraftData, arrAirport, landingWeightKg, cruiseFt, todDistanceNm) {
  if (mode === 'manual') return buildManualApproach(aircraftData, arrAirport, landingWeightKg, cruiseFt, todDistanceNm);
  return buildIlsApproach(aircraftData, arrAirport, landingWeightKg, cruiseFt, todDistanceNm);
}
