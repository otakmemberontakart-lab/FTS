/**
 * vspeed.js
 * Approximates V1/VR/V2 for a given aircraft + actual takeoff weight, using
 * weight-scaling from a reference point: V(W) = V_ref × √(W / W_ref).
 * This is a genuine aerodynamic scaling law (stall speed scales with the
 * square root of weight for a fixed configuration) — not an arbitrary
 * community rule.
 *
 * Flap-setting suggestion is a second, data-driven layer: it reads
 * aircraft.json's `flap_ladder` (runway-length thresholds → flap setting)
 * so the logic lives in data, not hardcoded here.
 *
 * DISCLAIMER (surface this in the UI): this is an approximation, not
 * certified AFM/FCOM performance data. It does NOT account for runway
 * condition, temperature, pressure altitude, wind, or runway slope.
 */

export function computeVSpeeds(aircraftData, actualWeightKg, maxRunwayFt) {
  const ref = aircraftData.vref;
  if (!ref) return { valid: false, error: 'Aircraft tidak punya data vref.' };
  if (!actualWeightKg || actualWeightKg <= 0) {
    return { valid: false, error: 'Berat aktual (TOW) tidak valid.' };
  }

  const scale = Math.sqrt(actualWeightKg / ref.ref_weight_kg);
  const v1 = Math.round(ref.v1 * scale);
  const vr = Math.round(ref.vr * scale);
  const v2 = Math.round(ref.v2 * scale);

  let flapRecommendation = ref.flap_takeoff;
  let flapNote = 'Default dari aircraft.json (belum disesuaikan runway — max_runway_ft tidak diberikan).';

  if (maxRunwayFt && Array.isArray(aircraftData.flap_ladder)) {
    const sorted = [...aircraftData.flap_ladder].sort((a, b) => b.minRunwayFt - a.minRunwayFt);
    const match = sorted.find(step => maxRunwayFt >= step.minRunwayFt);
    if (match) {
      flapRecommendation = match.flap;
      flapNote = `Disesuaikan dari max runway ${maxRunwayFt} ft.`;
    }
  }

  return {
    valid: true,
    actualWeightKg,
    refWeightKg: ref.ref_weight_kg,
    scaleFactor: Math.round(scale * 1000) / 1000,
    v1, vr, v2,
    flapRecommendation,
    flapNote,
    disclaimer: 'Estimasi weight-scaling — bukan data performa AFM/FCOM resmi. Tidak memperhitungkan kondisi runway, suhu, tekanan, angin, atau slope.'
  };
}
