/**
 * trim.js
 * Takeoff trim estimate — Method A (confirmed with user): reuses the
 * existing V.TRIM heuristic (Load% ÷ 3) already computed in calc.js's
 * weight & balance step, rather than modeling real CG/%MAC (which would
 * need arm/moment data we don't have — pax/cargo position, fuel tank
 * position — and still wouldn't be authoritative without a real loadsheet).
 *
 * DISCLAIMER: this is a load-factor correlation, NOT a real CG-based trim
 * calculation. Actual trim depends on where the weight sits (forward vs
 * aft), not just how much weight there is.
 *
 * Output formats:
 *   - RFS:            0.00 to 1.00 (e.g. 0.26)
 *   - Infinite Flight: -100% to +100% (0 = idle, negative = nose down,
 *                       positive = nose up). We assume the typical
 *                       nose-up direction since we have no real CG data
 *                       to determine direction — only magnitude.
 */

export function computeTrim(vtrimHeuristic) {
  const rfsValue = Math.round(vtrimHeuristic * 100) / 100;
  const ifPercent = Math.round(vtrimHeuristic * 100);

  return {
    rfsValue,                    // e.g. 0.26
    ifPercent: `+${ifPercent}%`, // e.g. "+26%" — assumes nose-up (typical takeoff trim direction)
    disclaimer: 'Estimasi dari Load% ÷ 3 (Metode A) — korelasi berat, BUKAN hitungan CG/%MAC beneran. Arah (nose-up) diasumsikan default umum, bukan dari data CG aktual.'
  };
}
