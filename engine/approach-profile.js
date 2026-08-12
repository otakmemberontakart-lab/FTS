/**
 * approach-profile.js
 * Builds a detailed, distance-staged approach procedure for the arrival
 * airport — either ILS-based (electronic glideslope reference) or a
 * generic manual/visual procedure — driven by aircraft flap/speed data
 * and a standard 3° descent gradient.
 *
 * IMPORTANT — read before trusting this for anything real:
 * This is a GENERIC TEMPLATE, not the actual published approach plate for
 * the airport. We don't have real procedure/STAR/plate data. Distance
 * points for each flap stage (15/10/7/5 NM etc.) are a reasonable typical
 * pattern, not airport-specific. The "ILS available" flag on the airport
 * record is itself a heuristic (see data/airports.json's likely_has_ils) —
 * free open airport data does not include confirmed real ILS presence.
 */

const GLIDESLOPE_FT_PER_NM = 318; // ~3.0° descent gradient, standard approximation
const STABLE_GATE_ILS_FT = 1000;  // precision approach stabilization gate (AFE)
const STABLE_GATE_VISUAL_FT = 500; // typical visual-approach stabilization gate (AFE)

// Fixed staging distances (NM before threshold) — matches the pattern used
// in earlier hand-built OFPs (FAP 7NM, FAF 5NM, 1000ft gate ~3.2NM), which
// lines up with the 3° gradient math, so kept consistent here.
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

/**
 * Builds the staged flap/speed/altitude table for ILS mode. ARM APPR is
 * merged into the same row as Flaps 2 + Gear Down (10NM / ~3,200ft) per
 * user's real Infinite Flight experience — not a separate far-out step.
 */
function buildStagedRows(aircraftData, arrAirport, vapp) {
  const schedule = aircraftData.approach_speed_schedule || [];
  const elevFt = arrAirport.elev_ft || 0;
  const usableStages = schedule.slice(1); // drop "Clean"/"Flaps Up" entry
  const rows = [];

  STAGE_DISTANCES_NM.forEach((distNm, i) => {
    const stage = usableStages[i] || usableStages[usableStages.length - 1];
    let action = `Select ${stage.stage}`;
    if (i === 1) action = `ARM APPR (LOC alive) · Select ${stage.stage} · GEAR DOWN · check 3 green`;
    rows.push({
      distanceNm: distNm,
      altitudeFt: altAtDistance(distNm, elevFt),
      speedKt: stage.maxSpeedKt,
      action
    });
  });

  // stabilization gate
  const stableDistNm = Math.round((STABLE_GATE_ILS_FT / GLIDESLOPE_FT_PER_NM) * 10) / 10;
  rows.push({
    distanceNm: stableDistNm,
    altitudeFt: elevFt + STABLE_GATE_ILS_FT,
    speedKt: vapp,
    isVapp: true,
    action: `STABLE GATE (${STABLE_GATE_ILS_FT} ft AFE) — full landing config, VAPP target, "STABLE" call mandatory`
  });

  return rows;
}

/**
 * ILS mode — full procedure with localizer/glideslope references, FAF,
 * DA/DH, missed approach altitude.
 */
export function buildIlsApproach(aircraftData, arrAirport, landingWeightKg) {
  const vapp = computeVapp(aircraftData, landingWeightKg);
  const elevFt = arrAirport.elev_ft || 0;
  const daFt = elevFt + 200; // CAT I default
  const daDistNm = Math.round((200 / GLIDESLOPE_FT_PER_NM) * 100) / 100;

  const rows = buildStagedRows(aircraftData, arrAirport, vapp);
  rows.push({
    distanceNm: daDistNm,
    altitudeFt: daFt,
    speedKt: vapp,
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
 * Manual/visual mode — same flap staging, but framed as a visual descent
 * (no localizer/glideslope electronic guidance), lower stabilization gate,
 * and a visual decision point instead of DA/DH.
 */
export function buildManualApproach(aircraftData, arrAirport, landingWeightKg) {
  const vapp = computeVapp(aircraftData, landingWeightKg);
  const elevFt = arrAirport.elev_ft || 0;

  const schedule = aircraftData.approach_speed_schedule || [];
  const usableStages = schedule.slice(1);
  const rows = [];

  STAGE_DISTANCES_NM.forEach((distNm, i) => {
    const stage = usableStages[i] || usableStages[usableStages.length - 1];
    rows.push({
      distanceNm: distNm,
      altitudeFt: altAtDistance(distNm, elevFt), // visual descent path, same 3:1 ratio as reference
      speedKt: stage.maxSpeedKt,
      action: `Select ${stage.stage}${i === 1 ? ' · GEAR DOWN · check 3 green' : ''} (visual — jaga posisi terhadap runway, no electronic glideslope)`
    });
  });

  const stableDistNm = Math.round((STABLE_GATE_VISUAL_FT / GLIDESLOPE_FT_PER_NM) * 10) / 10;
  rows.push({
    distanceNm: stableDistNm,
    altitudeFt: elevFt + STABLE_GATE_VISUAL_FT,
    speedKt: vapp,
    isVapp: true,
    action: `STABLE GATE VISUAL (${STABLE_GATE_VISUAL_FT} ft AFE) — full landing config, VAPP target, runway environment harus sudah dalam pandangan`
  });

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
 * Dispatcher used by calc.js.
 */
export function buildApproachProfile(mode, aircraftData, arrAirport, landingWeightKg) {
  if (mode === 'manual') return buildManualApproach(aircraftData, arrAirport, landingWeightKg);
  return buildIlsApproach(aircraftData, arrAirport, landingWeightKg);
}
