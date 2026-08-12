/**
 * route-parser.js
 * Model 1 (simple): a single total distance in NM — unchanged.
 * Model 2 (table): structured rows { name, hdg, legDistNm, alt } coming
 * directly from the UI's per-cell inputs (no free-text parsing anymore —
 * that was the old textarea design, replaced by a real table with a box
 * per column).
 *
 * ALT semantic rule (confirmed against real Infinite Flight .fpl data):
 *   - alt is 0/blank AND waypoint name contains "RW"  -> GROUND
 *     (this is the runway threshold point — makes sense to have no
 *     target altitude there)
 *   - alt is 0/blank AND name does NOT contain "RW"    -> NOT MANDATORY
 *     (not a hard constraint — adjusted in-flight / pilot's discretion)
 *   - alt has a value                                   -> HARD CONSTRAINT
 */

export function parseSimpleDistance(nmValue) {
  const nm = parseFloat(nmValue);
  if (!nm || nm <= 0 || !isFinite(nm)) {
    return { valid: false, error: 'Jarak (NM) harus angka lebih dari 0.' };
  }
  return {
    valid: true,
    mode: 'simple',
    totalDistanceNm: Math.round(nm * 10) / 10,
    waypoints: null
  };
}

function classifyAlt(name, altFt) {
  if (altFt && altFt > 0) return 'constraint';
  return /RW/i.test(name || '') ? 'ground' : 'not_mandatory';
}

/**
 * rows: array of { name, hdg, legDistNm, alt } — alt in feet, already
 * numeric (converted by the UI / fpl-import before reaching here).
 * Ignores fully-empty rows (user added a row but never filled it).
 */
export function parseWaypointRows(rows) {
  const filled = (rows || []).filter(r => (r.name || '').trim() !== '');

  if (filled.length < 2) {
    return { valid: false, error: 'Minimal 2 waypoint (keberangkatan & kedatangan) harus diisi namanya.' };
  }

  const waypoints = [];
  let totalDistanceNm = 0;

  for (const r of filled) {
    const name = r.name.trim();
    const hdg = (r.hdg === '' || r.hdg === null || r.hdg === undefined) ? null : Number(r.hdg);
    const legDistNm = Number(r.legDistNm);
    const altFt = (r.alt === '' || r.alt === null || r.alt === undefined) ? 0 : Number(r.alt);

    if (isNaN(legDistNm) || legDistNm < 0) {
      return { valid: false, error: `Leg Dist tidak valid di waypoint "${name}".` };
    }
    if (hdg !== null && (isNaN(hdg) || hdg < 0 || hdg > 360)) {
      return { valid: false, error: `HDG tidak valid di waypoint "${name}" (harus 0-360).` };
    }

    waypoints.push({
      name,
      headingDeg: hdg,
      legDistNm,
      altFt,
      altStatus: classifyAlt(name, altFt) // 'ground' | 'not_mandatory' | 'constraint'
    });
    totalDistanceNm += legDistNm;
  }

  return {
    valid: true,
    mode: 'waypoints',
    totalDistanceNm: Math.round(totalDistanceNm * 10) / 10,
    waypoints,
    highestAltFt: Math.max(0, ...waypoints.map(w => w.altFt))
  };
}

/**
 * Convenience dispatcher used by the UI.
 */
export function parseRoute(mode, input) {
  if (mode === 'simple') return parseSimpleDistance(input);
  if (mode === 'waypoints') return parseWaypointRows(input);
  return { valid: false, error: `Mode tidak dikenal: ${mode}` };
}
