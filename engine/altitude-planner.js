/**
 * altitude-planner.js
 * Given a route distance (and optionally a user-specified cruise FL),
 * works out:
 *   - climb distance (NM from departure to top of climb)
 *   - TOD distance (NM BEFORE destination where descent must start)
 *   - whether the chosen/recommended FL is actually feasible for the
 *     route distance (climb + descent must fit within total distance)
 *
 * Method: the standard aviation "3:1 descent rule" — losing 1,000 ft takes
 * about 3 NM at a normal ~3° descent gradient. This is a real rule of thumb
 * taught to pilots, not an invented heuristic. Climb is approximated with
 * the same ratio plus a fixed low-altitude buffer, since climb below
 * 10,000 ft is speed-restricted (250 kt) and less efficient than descent.
 *
 * DISCLAIMER: still an approximation — no wind, no temperature/ISA
 * deviation, no aircraft-specific climb/descent performance tables.
 */

const NM_PER_1000FT = 3;          // 3:1 rule
const CLIMB_LOW_ALT_BUFFER_NM = 8; // extra distance for <10,000ft speed-restricted segment
const DESCENT_DECEL_BUFFER_NM = 10; // extra distance for deceleration/level-off segment before FAF
const MIN_CRUISE_SEGMENT_NM = 5;    // minimum felt cruise segment for a FL to be "worth" using

// Standard flight levels we'll consider when recommending one
const STANDARD_FLS = [80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 350, 360, 370, 380, 390, 400, 410];

export function estimateClimbDistanceNm(cruiseFt) {
  return Math.round((cruiseFt / 1000) * NM_PER_1000FT + CLIMB_LOW_ALT_BUFFER_NM);
}

export function estimateTodDistanceNm(cruiseFt, destElevFt = 0) {
  const altToLose = Math.max(cruiseFt - destElevFt, 0);
  return Math.round((altToLose / 1000) * NM_PER_1000FT + DESCENT_DECEL_BUFFER_NM);
}

/**
 * Recommends the highest standard FL that still leaves a minimum cruise
 * segment for the given route distance.
 */
export function recommendCruiseFL(distanceNm, destElevFt = 0) {
  let best = STANDARD_FLS[0];
  for (const fl of STANDARD_FLS) {
    const ft = fl * 100;
    const climb = estimateClimbDistanceNm(ft);
    const tod = estimateTodDistanceNm(ft, destElevFt);
    if (climb + tod + MIN_CRUISE_SEGMENT_NM <= distanceNm) {
      best = fl;
    } else {
      break; // monotonic: once infeasible, higher FLs stay infeasible
    }
  }
  return best;
}

/**
 * Main entry point used by calc.js.
 * Priority chain for picking the cruise FL (confirmed with user):
 *   1. `userFL` (explicit "Cruise FL" field) — if filled, wins outright.
 *   2. `tableHighestAltFt` (highest ALT value found in the Model 2 table,
 *      whether typed manually or imported from a .fpl file) — used only
 *      if userFL is empty.
 *   3. Neither given -> auto-recommend (existing logic).
 * TOD is always computed via the 3:1 rule regardless of which source won.
 */
export function planAltitude({ distanceNm, userFL, tableHighestAltFt, destElevFt = 0 }) {
  let fl, source;
  if (userFL) {
    fl = userFL;
    source = 'user_field';
  } else if (tableHighestAltFt && tableHighestAltFt > 0) {
    fl = Math.round(tableHighestAltFt / 100);
    source = 'table_highest';
  } else {
    fl = recommendCruiseFL(distanceNm, destElevFt);
    source = 'recommended';
  }
  const ft = fl * 100;

  const climbDistanceNm = estimateClimbDistanceNm(ft);
  const todDistanceNm = estimateTodDistanceNm(ft, destElevFt);
  const cruiseSegmentNm = Math.round((distanceNm - climbDistanceNm - todDistanceNm) * 10) / 10;
  const feasible = cruiseSegmentNm >= 0;

  let warning = null;
  const isExplicit = source === 'user_field' || source === 'table_highest';
  if (isExplicit && !feasible) {
    const recommended = recommendCruiseFL(distanceNm, destElevFt);
    warning = `FL${fl} kemungkinan terlalu tinggi untuk jarak ${distanceNm} NM — TOC dan TOD akan bertabrakan (cruise segment negatif). Pertimbangkan turun ke FL${recommended} atau lebih rendah.`;
  } else if (isExplicit && cruiseSegmentNm < MIN_CRUISE_SEGMENT_NM) {
    warning = `FL${fl} pas-pasan untuk jarak ini — cruise segment cuma ${cruiseSegmentNm} NM. TOC dan TOD akan berdekatan.`;
  }

  return {
    cruiseFL: fl,
    cruiseFt: ft,
    source, // 'user_field' | 'table_highest' | 'recommended'
    climbDistanceNm,
    todDistanceNm,          // <-- "berapa NM sebelum destinasi" yang diminta user
    cruiseSegmentNm: Math.max(cruiseSegmentNm, 0),
    feasible,
    warning,
    disclaimer: 'Estimasi dari aturan 3:1 (3 NM per 1.000 ft) — tidak memperhitungkan angin, suhu, atau performa spesifik pesawat.'
  };
}
